// Hand-drawn plan sketches for the background of the About/Contact section.
//
// Vector paths come from a real section cut through the Barkhaus model
// (scripts/export_plan_sketch.py). Two "sheets" sit in opposite corners,
// rotated like loose drawings on a desk. A pen works outward from each corner,
// stroke by stroke, with the small habits of a hand: lines overshoot their
// corners a little, wobble slightly, and some get traced twice. When a sheet is
// finished it rests, fades, and is redrawn from a different part of the plan.

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const INK = 'rgba(226, 213, 188, 0.40)';   // fallback; a section can set --sketch-ink
// Each sheet takes about this long to draw, however much is on it.
// Review aid: ?fastsketch draws a whole sheet almost instantly.
const DRAW_SECONDS = new URLSearchParams(location.search).has('fastsketch') ? 0.4 : 18;
const REST = 5, FADE = 1.6; // seconds

function rand(seed) { // small deterministic PRNG so each stroke keeps its wobble
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

// Prepare one sheet: which part of the plan, where it sits, in what order the
// strokes go down.
function makeSheet(plan, w, h, corner, variant) {
  const narrow = w < 700;
  const size = narrow ? Math.min(w * 0.95, 520) : Math.min(w * 0.42, 640);
  const angle = (corner === 'tr' ? -28 : 28) * Math.PI / 180 + (variant % 2 ? 0.08 : -0.05);
  const scale = size / (plan.width * (0.55 + 0.1 * (variant % 3)));   // show ~half the plan, zoomed
  // Pick the plan crop: alternate between the grooming wing and the retail front.
  const focus = [[0.28, 0.32], [0.3, 0.78], [0.62, 0.5]][variant % 3].map((f, i) => f * (i ? plan.height : plan.width));
  const anchor = corner === 'tr' ? [w - size * 0.3, size * 0.24] : [size * 0.2, h - size * 0.2];
  const c = Math.cos(angle), s = Math.sin(angle);
  const toScreen = (x, y) => {
    const dx = (x - focus[0]) * scale, dy = (y - focus[1]) * scale;
    return [anchor[0] + dx * c - dy * s, anchor[1] + dx * s + dy * c];
  };
  const half = size / 2, rx = [anchor[0], anchor[1]];
  const inside = ([x, y]) => {
    const dx = x - rx[0], dy = y - rx[1];
    const u = dx * c + dy * s, v = -dx * s + dy * c;            // into the sheet's own axes
    return Math.abs(u) < half && Math.abs(v) < half * 0.82;
  };
  const strokes = [];
  plan.paths.forEach((p, k) => {
    const pts = [];
    for (let i = 0; i < p.length; i += 2) pts.push(toScreen(p[i], p[i + 1]));
    if (!pts.some(inside)) return;
    const r = rand(k * 97 + variant * 13 + 1);
    const wob = 0.6 + r() * 0.8;
    // Overshoot both ends by a few px, the way a quick hand runs past a corner.
    const ext = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1], d = Math.hypot(dx, dy) || 1, o = 2 + r() * 5; return [a[0] + dx / d * o, a[1] + dy / d * o]; };
    if (pts.length > 1) { pts[0] = ext(pts[0], pts[1]); pts[pts.length - 1] = ext(pts[pts.length - 1], pts[pts.length - 2]); }
    const jittered = pts.map(([x, y]) => [x + (r() - .5) * wob, y + (r() - .5) * wob]);
    let len = 0; for (let i = 1; i < jittered.length; i++) len += Math.hypot(jittered[i][0] - jittered[i - 1][0], jittered[i][1] - jittered[i - 1][1]);
    const d0 = Math.hypot(jittered[0][0] - (corner === 'tr' ? w : 0), jittered[0][1] - (corner === 'tr' ? 0 : h));
    strokes.push({ pts: jittered, len, order: d0 + r() * 120, twice: r() < 0.22, width: 0.7 + r() * 0.6 });
  });
  strokes.sort((a, b) => a.order - b.order);
  const total = strokes.reduce((t, s) => t + s.len * (s.twice ? 2 : 1), 0);
  return { strokes, total, angle, anchor, size, clip: [anchor, angle, half] };
}

// Draw a stroke from length a to length b (CSS px along the polyline).
function strokeRange(ctx, st, a, b) {
  let walked = 0;
  ctx.beginPath();
  let started = false;
  for (let i = 1; i < st.pts.length; i++) {
    const [x0, y0] = st.pts[i - 1], [x1, y1] = st.pts[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    const s0 = Math.max(a, walked), s1 = Math.min(b, walked + seg);
    if (s1 > s0 && seg > 0) {
      const t0 = (s0 - walked) / seg, t1 = (s1 - walked) / seg;
      const p0 = [x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0];
      if (!started) { ctx.moveTo(...p0); started = true; }
      ctx.lineTo(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1);
    }
    walked += seg;
    if (walked >= b) break;
  }
  ctx.lineWidth = st.width; ctx.stroke();
}

export async function initSketches(section) {
  if (!section) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'sketch-canvas'; canvas.setAttribute('aria-hidden', 'true');
  section.prepend(canvas);
  const plan = await fetch('./assets/sketch/barkhaus-plan.json').then(r => r.json());
  const ctx = canvas.getContext('2d');
  const ink = getComputedStyle(section).getPropertyValue('--sketch-ink').trim() || INK;
  let w, h, dpr, sheets = [], variant = 0, visible = false, last = 0, raf = 0;

  const setup = () => {
    const r = section.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2); w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    sheets = ['tr', 'bl'].map((corner, i) => ({ ...makeSheet(plan, w, h, corner, variant + i), drawn: 0, phase: 'draw', t: 0, corner }));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    canvas.style.opacity = 1;
    if (reduced.matches) sheets.forEach(s => paint(s, 0, s.total));
  };

  // Paint the part of a sheet between drawn lengths a and b, clipped to its page.
  function paint(sheet, a, b) {
    ctx.save();
    const [[ax, ay], angle, half] = sheet.clip;
    ctx.translate(ax, ay); ctx.rotate(angle); ctx.beginPath(); ctx.rect(-half, -half * .82, half * 2, half * 1.64); ctx.rotate(-angle); ctx.translate(-ax, -ay);
    ctx.clip();
    ctx.strokeStyle = ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    let at = 0;
    for (const st of sheet.strokes) {
      const passes = st.twice ? 2 : 1;
      for (let p = 0; p < passes; p++) {
        const s0 = at, s1 = at + st.len; at = s1;
        if (s1 <= a) continue;
        if (s0 >= b) { ctx.restore(); return; }
        if (p === 1) { ctx.save(); ctx.translate(.6, -.4); }
        strokeRange(ctx, st, Math.max(0, a - s0), Math.min(st.len, b - s0));
        if (p === 1) ctx.restore();
      }
    }
    ctx.restore();
  }

  function tick(now) {
    raf = 0;
    if (!visible) return;
    const dt = last ? Math.min((now - last) / 1000, .1) : 0; last = now;
    let allRested = true;
    for (const s of sheets) {
      if (s.phase === 'draw') {
        const next = Math.min(s.total, s.drawn + s.total / DRAW_SECONDS * dt);
        paint(s, s.drawn, next); s.drawn = next;
        if (next >= s.total) { s.phase = 'rest'; s.t = 0; }
        allRested = false;
      } else { s.t += dt; if (s.t < REST) allRested = false; }
    }
    if (allRested) {   // both sheets done and rested: fade out, redraw elsewhere
      canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE * 1000, fill: 'forwards' }).finished.then(() => {
        canvas.getAnimations().forEach(a => a.cancel()); variant += 2; setup(); last = 0; start();
      });
      return;
    }
    start();
  }
  const start = () => { if (!raf && visible && !reduced.matches) raf = requestAnimationFrame(tick); };

  setup();
  new ResizeObserver(() => { const r = section.getBoundingClientRect(); if (Math.abs(r.width - w) > 2 || Math.abs(r.height - h) > 40) setup(); }).observe(section);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; last = 0; start(); }, { threshold: .1 }).observe(section);
}
