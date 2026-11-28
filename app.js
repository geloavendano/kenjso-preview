// Home page.
import { loadProjects } from './projects.js?v=74ffd9d598';
import { projectCard, bindFilters } from './grid.js?v=e44f81ca79';
import { initProjectView } from './project-view.js?v=a917276c95';
import { initNav } from './nav.js?v=b1556581c0';
import { initSketches } from './sketches.js?v=efa8682b7b';

const grid = document.querySelector('#project-grid');

async function projects() {
  try {
    const data = await loadProjects();
    document.querySelector('#portrait').src = data.portrait;
    data.projects.filter(p => p.featured && p.listed).forEach(p => grid.append(projectCard(p)));
    const more = Object.assign(document.createElement('a'), { className: 'more-projects travertine', href: './work.html' });
    more.append(Object.assign(document.createElement('span'), { textContent: `All ${data.projects.filter(p => p.listed).length} projects` }));
    grid.append(more);
    bindFilters([...document.querySelectorAll('#work [data-filter]')], grid);
  } catch (e) { console.error('Project content unavailable', e); }
}

projects();
initProjectView();
initNav();
initSketches(document.querySelector('#about'));
