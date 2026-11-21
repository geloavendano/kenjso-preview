// Floating navigation with a leather tab marking where you are.
// Links with data-section follow scroll position; a link with
// aria-current="page" (e.g. Work on the portfolio page) stays marked.
export function initNav() {
  const nav = document.querySelector('#float-nav');
  if (!nav) return;
  const indicator = nav.querySelector('.nav-indicator');
  const links = [...nav.querySelectorAll('a')];
  const pageLink = links.find(a => a.getAttribute('aria-current') === 'page');
  const spied = links.filter(a => a.dataset.section && document.getElementById(a.dataset.section));

  function activeLink() {
    if (pageLink) return pageLink;
    const connect = document.getElementById('connect');
    const atBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    if (connect && (connect.getBoundingClientRect().top < innerHeight * .62 || atBottom))
      return spied.find(a => a.dataset.section === 'connect');
    let current = null;
    for (const a of spied) if (a.dataset.section !== 'connect' && document.getElementById(a.dataset.section).getBoundingClientRect().top <= innerHeight * .42) current = a;
    return current;
  }

  function place(link) {
    if (!link) { indicator.style.opacity = 0; return; }
    const nb = nav.getBoundingClientRect(), lb = link.getBoundingClientRect();
    indicator.style.width = `${lb.width}px`;
    indicator.style.transform = `translateX(${lb.left - nb.left - 1}px)`;
    indicator.style.opacity = 1;
  }

  let ticking = false, last;
  function update(force) {
    ticking = false;
    nav.dataset.floating = String(scrollY > 40 || !!pageLink);
    const link = activeLink();
    if (link === last && !force) return;
    last = link;
    spied.forEach(a => a.setAttribute('aria-current', a === link ? 'true' : 'false'));
    place(link);
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => update()); } }, { passive: true });
  addEventListener('resize', () => update(true));
  document.fonts?.ready.then(() => update(true));
  update(true);
}
