// Project data + the URL scheme for opening one: #project/<slug>.
let cache;
export const loadProjects = () => (cache ??= fetch('./assets/projects.json?v=1e3c7ce070').then(r => r.json()));
export const projectHash = slug => `#project/${slug}`;
export const slugFromHash = (hash = location.hash) => (hash.match(/^#project\/([\w-]+)$/) || [])[1] || null;
export const label = p => (p.category === 'residential' ? 'Residential' : 'Commercial');
export const facts = p => [label(p), p.size ? `${p.size} sqm` : null].filter(Boolean);
