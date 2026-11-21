// Home page.
import { loadProjects } from './projects.js';
import { projectCard, bindFilters } from './grid.js';
import { initProjectView } from './project-view.js';
import { initNav } from './nav.js';
import { initSketches } from './sketches.js';

const grid = document.querySelector('#project-grid');

async function projects() {
  try {
    const data = await loadProjects();
    document.querySelector('#portrait').src = data.portrait;
    data.projects.filter(p => p.featured).forEach(p => grid.append(projectCard(p)));
    const more = Object.assign(document.createElement('a'), { className: 'more-projects travertine', href: './work.html' });
    more.append(Object.assign(document.createElement('span'), { textContent: `All ${data.projects.length} projects` }));
    grid.append(more);
    bindFilters([...document.querySelectorAll('#work [data-filter]')], grid);
  } catch (e) { console.error('Project content unavailable', e); }
}

projects();
initProjectView();
initNav();
initSketches(document.querySelector('#about'));
