// Project tiles + animated filtering, shared by the home page and the portfolio.
import { projectHash, label, facts } from './projects.js?v=05f2a50810';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const EASE = 'cubic-bezier(.2,.7,.2,1)';

export function projectCard(p, { showSize = false } = {}) {
  const a = Object.assign(document.createElement('a'), { className: 'project-card', href: projectHash(p.slug) });
  a.dataset.category = p.category;
  const img = Object.assign(new Image(), { src: p.cover, alt: `${p.title}, interior by Kenj So`, loading: 'lazy', decoding: 'async' });
  const caption = Object.assign(document.createElement('span'), { className: 'project-caption' });
  caption.append(Object.assign(document.createElement('strong'), { textContent: p.title }),
                 Object.assign(document.createElement('span'), { textContent: (showSize ? facts(p) : [label(p)]).join(' · ') }));
  a.append(img, caption);
  return a;
}

// FLIP: measure every tile, change the layout, then animate each tile from
// where it was to where it now is. Leaving tiles are lifted out of the flow
// (absolutely placed where they stood) so the grid reflows straight away
// while they fade; arriving tiles fade and settle into their new cells.
export function filterGrid(grid, filter) {
  const tiles = [...grid.children];
  const wants = el => !el.classList.contains('project-card') || filter === 'all' || el.dataset.category === filter;

  const gridBox = grid.getBoundingClientRect();
  grid.getAnimations().forEach(a => a.cancel());
  const first = new Map(tiles.filter(el => !el.hidden).map(el => [el, el.getBoundingClientRect()]));
  tiles.forEach(el => { el.getAnimations().forEach(a => a.cancel()); el.style.cssText = ''; });

  if (reduced.matches) {
    tiles.forEach(el => { el.hidden = !wants(el); });
    grid.classList.toggle('filtered', filter !== 'all');
    return;
  }

  const leaving = tiles.filter(el => first.has(el) && !wants(el));
  const entering = tiles.filter(el => !first.has(el) && wants(el));
  leaving.forEach(el => {
    const r = first.get(el);
    Object.assign(el.style, { position: 'absolute', margin: 0, zIndex: 0, pointerEvents: 'none',
      left: `${r.left - gridBox.left}px`, top: `${r.top - gridBox.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  });
  entering.forEach(el => { el.hidden = false; });
  grid.classList.toggle('filtered', filter !== 'all');

  const newHeight = grid.getBoundingClientRect().height;
  if (Math.abs(newHeight - gridBox.height) > 1)
    grid.animate([{ height: `${gridBox.height}px` }, { height: `${newHeight}px` }], { duration: 620, easing: EASE });

  tiles.filter(el => first.has(el) && wants(el)).forEach(el => {
    const a = first.get(el), b = el.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top, sx = a.width / b.width, sy = a.height / b.height;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < .01 && Math.abs(sy - 1) < .01) return;
    el.animate([{ transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
                { transformOrigin: '0 0', transform: 'none' }], { duration: 620, easing: EASE });
  });
  leaving.forEach(el => {
    el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.94)' }],
      { duration: 280, easing: 'ease-in', fill: 'forwards' })
      .finished.then(() => { el.hidden = true; el.style.cssText = ''; el.getAnimations().forEach(x => x.cancel()); })
      .catch(() => {});
  });
  entering.forEach((el, i) => {
    el.animate([{ opacity: 0, transform: 'translateY(14px) scale(.96)' }, { opacity: 1, transform: 'none' }],
      { duration: 520, delay: 160 + i * 45, easing: EASE, fill: 'backwards' });
  });
}

export function bindFilters(buttons, grid, onChange) {
  buttons.forEach(b => b.addEventListener('click', () => {
    buttons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    filterGrid(grid, b.dataset.filter);
    onChange?.(b.dataset.filter);
  }));
}
