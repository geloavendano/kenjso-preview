// Portfolio page: every project, tiled.
import { loadProjects } from './projects.js?v=05f2a50810';
import { projectCard, bindFilters } from './grid.js?v=ee39fae337';
import { initProjectView } from './project-view.js?v=7c473f6016';
import { initNav } from './nav.js?v=b1556581c0';

const grid = document.querySelector('#portfolio-grid');
const count = document.querySelector('#count');
const say = (n, f) => { count.textContent = `${n} ${f === 'all' ? '' : f + ' '}project${n === 1 ? '' : 's'}`; };

loadProjects().then(({ projects }) => {
  // Featured work leads, in the home page's order. Tiles take a repeating
  // rhythm of sizes (large, tall, wide) so the wall reads like a contact sheet.
  const RHYTHM = ['big', '', '', 'tall', '', 'wide', '', '', '', 'tall', 'wide', ''];
  projects.forEach((p, i) => {
    const card = projectCard(p, { showSize: true });
    if (RHYTHM[i % RHYTHM.length]) card.classList.add(RHYTHM[i % RHYTHM.length]);
    grid.append(card);
  });
  say(projects.length, 'all');
  bindFilters([...document.querySelectorAll('[data-filter]')], grid, f =>
    say(f === 'all' ? projects.length : projects.filter(p => p.category === f).length, f));
}).catch(e => console.error('Project content unavailable', e));

initProjectView();
initNav();
