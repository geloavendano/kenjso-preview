// Full-screen media viewer for a project's photos (and videos, if any are added).
//
//   openLightbox(items, index, { title, returnFocus })
//     items: array of media URLs (images, or .mp4/.webm/.mov videos)
//
// One large item at a time, a scrollable strip of thumbnails underneath.
// Arrow keys / swipe / thumbnails move between items; Esc, Close or the
// browser's Back button close it (it adds one history entry while open, so
// Back on a phone closes the viewer instead of leaving the project).

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const isVideo = src => /\.(mp4|webm|mov)(\?|$)/i.test(src);
// The image host can serve a small version for thumbnails; local files are used as they are.
const thumbOf = src => src.replace(/w_\d+,h_\d+/, 'w_240,h_240');

let box, stage, strip, counter, titleEl, items = [], index = 0, returnFocus = null, pushed = false;

function el(tag, attrs = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), attrs);
  n.append(...kids.filter(k => k != null));
  return n;
}

function media(src, alt, { thumb = false } = {}) {
  if (isVideo(src)) {
    const v = el('video', { src, playsInline: true, preload: 'metadata', muted: thumb, controls: !thumb });
    if (thumb) v.tabIndex = -1;
    return v;
  }
  return el('img', { src: thumb ? thumbOf(src) : src, alt, decoding: 'async', draggable: false });   // thumbs are small; load them all
}

function build() {
  const close = el('button', { className: 'lb-close', type: 'button', textContent: 'Close' });
  close.addEventListener('click', closeLightbox);
  const prev = el('button', { className: 'lb-nav lb-prev', type: 'button', ariaLabel: 'Previous' });
  const next = el('button', { className: 'lb-nav lb-next', type: 'button', ariaLabel: 'Next' });
  prev.addEventListener('click', () => go(index - 1));
  next.addEventListener('click', () => go(index + 1));
  counter = el('p', { className: 'lb-count' });
  titleEl = el('p', { className: 'lb-title' });
  stage = el('div', { className: 'lb-stage' });
  strip = el('div', { className: 'lb-strip', role: 'listbox', ariaLabel: 'All photos' });
  box = el('div', { className: 'lightbox', hidden: true },
    el('div', { className: 'lb-bar' }, titleEl, counter, close), stage, prev, next, strip);
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photo viewer');

  box.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); closeLightbox(); }
    else if (e.key === 'ArrowRight') go(index + 1);
    else if (e.key === 'ArrowLeft') go(index - 1);
  });
  // Click the dark area around the photo to close.
  stage.addEventListener('click', e => { if (e.target === stage) closeLightbox(); });

  // Swipe left/right on touch screens.
  let x0 = null, y0 = 0;
  stage.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { x0 = e.clientX; y0 = e.clientY; } });
  stage.addEventListener('pointerup', e => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) go(index + (dx < 0 ? 1 : -1));
  });

  addEventListener('popstate', () => { if (!box.hidden && !history.state?.lb) { pushed = false; hide(); } });
  document.body.append(box);
}

function go(i) {
  if (!items.length) return;
  index = (i + items.length) % items.length;
  const src = items[index];
  const item = media(src, `${titleEl.textContent} — photo ${index + 1}`);
  stage.querySelectorAll('video').forEach(v => v.pause());
  stage.replaceChildren(item);
  if (!reduced.matches) item.animate([{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
  counter.textContent = `${index + 1} / ${items.length}`;
  [...strip.children].forEach((t, k) => t.setAttribute('aria-selected', String(k === index)));
  const active = strip.children[index];
  active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
  // Warm the neighbours so moving on feels instant.
  [index + 1, index - 1].forEach(k => { const s = items[(k + items.length) % items.length]; if (!isVideo(s)) new Image().src = s; });
}

export function openLightbox(list, start = 0, { title = '', returnFocus: rf = null } = {}) {
  if (!list.length) return;
  if (!box) build();
  items = list; returnFocus = rf; titleEl.textContent = title;
  strip.replaceChildren(...items.map((src, k) => {
    const t = el('button', { className: 'lb-thumb', type: 'button', role: 'option' }, media(src, '', { thumb: true }));
    t.setAttribute('aria-label', `Photo ${k + 1}`);
    t.addEventListener('click', () => go(k));
    return t;
  }));
  box.hidden = false;
  document.documentElement.classList.add('lb-open');
  if (!reduced.matches) box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
  history.pushState({ ...(history.state || {}), lb: 1 }, '', location.href); pushed = true;
  go(start);
  box.querySelector('.lb-close').focus({ preventScroll: true });
}

function hide() {
  stage.querySelectorAll('video').forEach(v => v.pause());
  box.hidden = true;
  document.documentElement.classList.remove('lb-open');
  returnFocus?.focus?.({ preventScroll: true });
}

export function closeLightbox() {
  if (!box || box.hidden) return;
  if (pushed && history.state?.lb) { history.back(); return; }   // popstate hides it
  pushed = false; hide();
}
