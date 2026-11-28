// Full-screen project view. Not a separate page: it opens over whichever page
// you are on, driven by the URL hash (#project/<slug>), so every project has a
// shareable link, the back button closes it, and links between projects work.
import { loadProjects, projectHash, slugFromHash, label, facts } from './projects.js?v=e153df9cbd';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let view, scroller, lastFocus = null, current = null;

function el(tag, attrs = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), attrs);
  n.append(...kids.filter(k => k != null));
  return n;
}

function build() {
  view = el('div', { className: 'project-view', id: 'project-view', hidden: true });
  view.setAttribute('role', 'dialog'); view.setAttribute('aria-modal', 'true');
  view.setAttribute('aria-labelledby', 'pv-title');
  const close = el('button', { className: 'pv-close', type: 'button', textContent: 'Close' });
  close.setAttribute('aria-label', 'Close project');
  close.addEventListener('click', closeProject);
  scroller = el('div', { className: 'pv-scroll' });
  view.append(scroller, close);
  view.addEventListener('keydown', e => { if (e.key === 'Escape') closeProject(); });
  document.body.append(view);
}

// `listed` is the public sequence. An unlisted project still opens from its
// link; it just has no number, and Next leads back into the listed sequence.
function render(p, listed) {
  const i = listed.findIndex(x => x.slug === p.slug);
  const next = listed[(i + 1) % listed.length];
  const [hero, ...rest] = p.images;
  const position = i >= 0 ? `${String(i + 1).padStart(2, '0')} / ${listed.length} · ` : '';

  const head = el('header', { className: 'pv-hero' + (hero ? '' : ' is-placeholder') },
    hero ? el('img', { src: hero, alt: `${p.title} — main view`, decoding: 'async' }) : null,
    el('div', { className: 'pv-hero-copy' },
      el('p', { className: 'eyebrow', textContent: position + label(p) }),
      el('h1', { id: 'pv-title', textContent: p.title }),
      p.tagline ? el('p', { className: 'pv-tagline', textContent: p.tagline }) : null));

  const meta = el('dl', { className: 'pv-meta' },
    ...facts(p).flatMap((f, k) => [el('dt', { textContent: k ? 'Size' : 'Type' }), el('dd', { textContent: f })]),
    ...(p.press.length ? [el('dt', { textContent: 'Featured' }), ...p.press.map(x => el('dd', { textContent: x }))] : []));
  const story = el('section', { className: 'pv-story' + (p.placeholder ? ' is-placeholder' : '') }, meta,
    el('div', { className: 'pv-body' }, ...p.body.map(t => el('p', { textContent: t }))));

  // Gallery rhythm: one wide image, then a pair, repeating.
  const gallery = el('section', { className: 'pv-gallery' },
    ...rest.map((src, k) => el('figure', { className: k % 3 === 0 ? 'wide' : '' },
      el('img', { src, alt: `${p.title} — view ${k + 2}`, loading: 'lazy', decoding: 'async' }))));

  const foot = el('footer', { className: 'pv-next' },
    el('a', { className: 'pv-all text-link', href: './work.html', textContent: 'All projects' }),
    el('a', { className: 'pv-next-link', href: projectHash(next.slug) },
      el('span', { className: 'eyebrow', textContent: 'Next project' }),
      el('strong', { textContent: next.title })));

  scroller.replaceChildren(head, story, gallery, foot);
}

async function show(slug) {
  const { projects } = await loadProjects();
  const p = projects.find(x => x.slug === slug);
  if (!p) return closeProject();
  if (!view) build();
  const wasOpen = !view.hidden;
  if (!wasOpen) lastFocus = document.activeElement;
  render(p, projects.filter(x => x.listed));
  current = slug;
  document.title = `${p.title} — Kenj So`;
  view.getAnimations().forEach(a => a.cancel());   // a closing fade must not finish over us
  if (!wasOpen) {
    view.hidden = false;
    document.documentElement.classList.add('pv-open');
    if (!reduced.matches) view.animate(
      [{ opacity: 0, clipPath: 'inset(8% 0 0 0)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)' }],
      { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)' });
  } else if (!reduced.matches) {
    scroller.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' });
  }
  // Reset only once the view is displayed: while it is hidden (display: none)
  // browsers ignore scroll changes and restore the previous project's offset.
  scroller.scrollTop = 0;
  view.querySelector('.pv-close').focus({ preventScroll: true });
}

function hide() {
  if (!view || view.hidden || !current) return;
  current = null;
  document.title = document.querySelector('meta[name=page-title]')?.content || 'Kenj So — Interior Design';
  const done = () => {
    if (current) return;                       // another project opened meanwhile
    view.hidden = true; document.documentElement.classList.remove('pv-open'); lastFocus?.focus?.({ preventScroll: true });
  };
  if (reduced.matches) return done();
  view.getAnimations().forEach(a => a.cancel());
  view.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: 'ease-in' }).finished.then(done, () => {});
}

export function closeProject() {
  // Opened from this page: step back to the entry we pushed, so Close and the
  // browser's Back button do the same thing. Arrived by deep link: clear the hash.
  if (history.state?.pv && slugFromHash()) { history.back(); return; }
  history.replaceState(null, '', location.pathname + location.search);
  hide();
}

function route() {
  const slug = slugFromHash();
  if (slug) show(slug); else hide();
}

export function initProjectView() {
  // Project links are ordinary anchors (shareable, work without JS). On this
  // page we take over: opening pushes ONE history entry; moving to another
  // project while the view is open replaces it, so Back always returns to the page.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href*="#project/"]');
    if (!a || a.pathname !== location.pathname || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const url = location.pathname + location.search + a.hash;
    if (current) history.replaceState(history.state, '', url);
    else history.pushState({ pv: 1 }, '', url);
    route();
  });
  addEventListener('popstate', route);
  addEventListener('hashchange', route);
  route();
}
