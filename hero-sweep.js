// "From the first line" hero.
//
// Layers, all rendered from the Barkhaus SketchUp model (scripts/render_hero_c1.py):
//   plan     top-down section of the whole tenancy, line art
//   lines    final camera, line art        ┐
//   height   final camera, world Z per px  │ one camera, one pixel grid
//   clay     final camera, cream model     │
//   finished final camera, real materials  ┘
//
// The story, in one fragment shader:
//   1. the floor plan inks itself onto dark microcement
//   2. a virtual camera flies from overhead down to eye level; the plan is
//      re-projected onto the floor (z = 0) every frame, landing exactly where
//      the floor sits in the final view
//   3. the walls rise: line art appears wherever the height map is below a
//      climbing "section" height, while the plan fades
//   4. a clay wash fills the volumes
//   5. a scan line reveals the finished room, the drawing trailing behind it
// Then it loops gently: hold the room, rewind slowly to the sketch, rebuild,
// with a slow pan across the room running underneath.

const art = document.querySelector('#sweep-art');
const canvas = document.querySelector('#sweep');
const still = document.querySelector('#sweep-still');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const PAPER_TEX = './assets/textures/microcement-olive-deep.webp';
const INK = [226, 213, 188].map(v => v / 255);        // travertine-cream ink on dark
const INK_ON_FINISH = [70, 52, 34].map(v => v / 255); // bronze ink over the finished render
const FOCUS = [0.58, 0.5];                            // where the room sits before panning starts

const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const span = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const lerp = (a, b, t) => a + (b - a) * t;
const outQuad = u => 1 - (1 - u) * (1 - u);

// ---- Choreography ------------------------------------------------------------
// First play (0 → FIRST s): plan, flight, walls rise, clay, scan reveals the room.
// Then an endless idle loop (CYCLE s): hold the room, rewind slowly back to the
// sketch (scan runs right → left, the clay lifts), rest on the drawing, rebuild.
// A slow pan / breathing zoom runs underneath everything after the first reveal.
const FIRST = 11.6, CYCLE = 26;
let scanStart = 0.12;   // under the desktop scrim; 0 on phones (no side scrim to hide behind)

// Scan line x (fraction of screen width). Below 0 = sketch side everywhere,
// 1.3 = room everywhere (the overshoot lets the trailing ink clear the edge).
const scanForward = u => lerp(scanStart, 1.3, outQuad(u));

export function timeline(t) {
  const first = {
    plan: ease(span(t, 0.3, 2.6)),                          // plan inks in
    flight: ease(span(t, 2.0, 4.9)),                        // overhead → eye level
    rise: lerp(-0.15, 4.4, ease(span(t, 4.4, 6.9))),        // section height, metres
    clay: ease(span(t, 6.4, 8.0)),
    wipe: t < 8 ? -0.02 : scanForward(span(t, 8.0, FIRST)),
  };
  if (t >= FIRST) {
    const c = (t - FIRST) % CYCLE;
    // 0–6 room · 6–13 rewind scan · 11–14 clay lifts · 14–18 sketch · 18–20 clay wash · 20–26 scan forward
    first.wipe = c < 20 ? lerp(1.3, -0.02, ease(span(c, 6, 13))) : scanForward(span(c, 20, CYCLE));
    first.clay = c < 18 ? 1 - ease(span(c, 11, 14)) : ease(span(c, 18, 20));
  }
  const drift = ease(span(t, 9, 16));                       // pan fades in during the first reveal
  return { ...first, drift,
    zoom: 1 + 0.05 * ease(span(t, 4, 14)) + 0.03 * drift * (0.5 - 0.5 * Math.cos(2 * Math.PI * (t - 9) / 43)) };
}

// Where the camera frame sits in the 16:9 render. Returns the shader's focus point:
// a gentle drift on wide screens; on tall phone screens (which see only a slice
// of the render) a slow pan across the room, shelving to window.
function viewFraction(canvasAspect, imageAspect, zoom) {
  const v = canvasAspect > imageAspect ? [1, imageAspect / canvasAspect] : [canvasAspect / imageAspect, 1];
  return v.map(x => x / zoom);
}
function focusAt(t, drift, view) {
  const axis = (base, size, lo, hi, period) => {
    const a = Math.max(size / 2, lo), b = Math.min(1 - size / 2, hi);
    if (a >= b) return Math.min(Math.max(base, size / 2), 1 - size / 2);
    const start = Math.min(Math.max(base, a), b);
    return lerp(start, (a + b) / 2 + (b - a) / 2 * Math.sin(2 * Math.PI * (t - 9) / period), drift);
  };
  return [axis(FOCUS[0], view[0], .28, .86, 37), axis(FOCUS[1], view[1], .42, .58, 29)];
}

// ---- Camera ------------------------------------------------------------------
// Blender camera with rotation (rx, 0, rz): rx = 0 looks straight down,
// rx = 90° looks at the horizon; rz turns it about the vertical axis.
function basis(rx, rz) {
  const [sa, ca, sb, cb] = [Math.sin(rx), Math.cos(rx), Math.sin(rz), Math.cos(rz)];
  return { right: [cb, sb, 0], up: [-ca * sb, ca * cb, sa], forward: [-sa * sb, sa * cb, -ca] };
}
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);
function bezier(p0, p1, p2, p3, u) {
  const a = 1 - u;
  return p0.map((_, i) => a * a * a * p0[i] + 3 * a * a * u * p1[i] + 3 * a * u * u * p2[i] + u * u * u * p3[i]);
}

// The flight's first frame looks straight down at the plan. Its height and
// offset are solved so the plan lands at a chosen spot on *this* screen:
// right of the headline on wide screens, above the copy on phones.
function flightPath(cam, canvasAspect) {
  const fin = basis(cam.rx, cam.rz);
  const start = { rx: 0, rz: 0 };
  const b0 = basis(start.rx, start.rz);
  const tanHalf = Math.tan(cam.fov * Math.PI / 360);
  const narrow = canvasAspect < 0.9;
  const [target, frac] = narrow ? [[0.5, 0.33], [0.9, 0.46]] : [[0.69, 0.5], [0.55, 0.92]];
  const view = viewFraction(canvasAspect, cam.aspect, 1);
  const focus = focusAt(0, 0, view);
  const st = target.map((x, i) => Math.min(Math.max(focus[i], view[i] / 2), 1 - view[i] / 2) + (x - .5) * view[i]);
  const h = cam.plan.size * 1.05 / (2 * tanHalf * Math.min(cam.aspect * view[0] * frac[0], view[1] * frac[1]));
  const [cx, cy] = cam.plan.center;
  const offset = add(b0.right.map(v => v * h * (2 * st[0] - 1) * cam.aspect * tanHalf),
                     b0.up.map(v => v * h * (1 - 2 * st[1]) * tanHalf));
  const e0 = [cx - offset[0], cy - offset[1], h];
  const e3 = cam.eye;
  const e1 = add(e0, [0, 0, -h * .35]);
  const e2 = add(add(e3, fin.forward, -7), [0, 0, 6]);          // behind and above the final eye
  return u => {
    const k = ease(u);
    const rx = lerp(start.rx, cam.rx, Math.pow(k, 1.6));        // tilt arrives late, after the descent
    const rz = lerp(start.rz, cam.rz, k);
    return { eye: bezier(e0, e1, e2, e3, u), ...basis(rx, rz) };
  };
}

// ---- Shader --------------------------------------------------------------------
const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `
precision highp float;
uniform sampler2D uPaper, uPlan, uLines, uHeight, uClay, uFinal;
uniform vec2 uRes, uImg, uFocus;
uniform float uZoom, uPlanInk, uRise, uClayAmt, uWipe, uPaperPx, uHeightRange;
uniform vec3 uInk, uInkFinish;
uniform vec3 uEye, uRight, uUp, uFwd;
uniform float uTanHalf, uAspect;
uniform vec3 uPlanBox;   // centre x, centre y, size (metres)

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){ float v = 0., a = .5; for(int i = 0; i < 4; i++){ v += a*noise(p); p *= 2.03; a *= .5; } return v; }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes; uv.y = 1. - uv.y;

  // object-fit: cover around a focal point, with a slow push-in.
  float ca = uRes.x / uRes.y, ia = uImg.x / uImg.y;
  vec2 view = (ca > ia ? vec2(1., ia / ca) : vec2(ca / ia, 1.)) / uZoom;
  vec2 c = clamp(uFocus, view * .5, 1. - view * .5);
  vec2 st = c + (uv - .5) * view;

  vec3 paper = texture2D(uPaper, gl_FragCoord.xy / uPaperPx).rgb;

  // ---- 1 + 2. Plan on the floor, seen by the flying camera -----------------
  vec3 ray = uFwd + (st.x * 2. - 1.) * uAspect * uTanHalf * uRight + (1. - st.y * 2.) * uTanHalf * uUp;
  float plan = 0.;
  if (ray.z < -1e-4) {
    vec3 hit = uEye + ray * (-uEye.z / ray.z);
    vec2 puv = vec2(hit.x - (uPlanBox.x - uPlanBox.z * .5), (uPlanBox.y + uPlanBox.z * .5) - hit.y) / uPlanBox.z;
    if (all(greaterThanEqual(puv, vec2(0.))) && all(lessThanEqual(puv, vec2(1.)))) {
      float order = .6 * distance(puv, vec2(.5)) / .7 + .4 * fbm(puv * 9.);
      float inked = clamp((uPlanInk * 1.15 - order) / .06, 0., 1.);
      plan = texture2D(uPlan, puv).r * inked;
    }
  }
  float planFade = 1. - smoothstep(.2, 2.2, uRise);

  // ---- 3. Walls rise: reveal line art below the section height --------------
  float z = texture2D(uHeight, st).r * uHeightRange;
  float line = texture2D(uLines, st).r;
  float risen = 1. - smoothstep(uRise - .18, uRise, z);
  float cutGlow = exp(-pow((z - uRise) / .05, 2.)) * step(.05, uRise) * step(uRise, 4.2);

  // ---- 4. Clay wash -----------------------------------------------------------
  vec3 clay = texture2D(uClay, st).rgb;
  float wash = .55 * fbm(st * 3. + 11.) + .45 * (1. - st.y);
  float washed = clamp((uClayAmt * 1.35 - wash) / .18, 0., 1.);
  vec3 col = mix(paper, clay, washed * .94);

  // ---- 5. Scan line --------------------------------------------------------------
  float edge = uWipe;
  float done = smoothstep(edge + .002, edge - .002, uv.x);
  col = mix(col, texture2D(uFinal, st).rgb, done);

  // Ink: plan + risen lines on the paper side; on the finished side it trails
  // behind the scan line in bronze and fades over ~quarter of the width.
  float trail = clamp(1. - (edge - uv.x) / .28, 0., 1.);
  vec3 ink = mix(mix(uInk, uInkFinish, washed * .85), uInkFinish, done);
  float inkAmt = max(plan * planFade, line * risen * (1. + 1.2 * cutGlow));
  inkAmt *= mix(1., .6 * trail * trail, done);
  col = mix(col, ink, clamp(inkAmt, 0., 1.));

  float px = abs(uv.x - edge) * uRes.x;
  float live = step(0., uWipe) * step(uWipe, 1.);
  col = mix(col, uInkFinish, live * exp(-px * px / 1.2) * .85);
  col += live * vec3(.05, .035, .02) * exp(-px / 90.);

  gl_FragColor = vec4(col, 1.);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function texture(gl, unit, image, { format, repeat = false, mips = false } = {}) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  const f = format ?? gl.RGB;
  gl.texImage2D(gl.TEXTURE_2D, 0, f, f, gl.UNSIGNED_BYTE, image);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

async function load(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

const showStill = () => { art.dataset.mode = 'still'; };

async function start() {
  const manifest = await fetch('./assets/hero/hero.json').then(r => r.json());
  still.src = manifest.finished;
  if (reduced.matches) return showStill();

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return showStill();

  const [paper, plan, lines, height, clay, finished] = await Promise.all(
    [PAPER_TEX, manifest.plan, manifest.lines, manifest.height, manifest.clay, manifest.finished].map(load));

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = name => gl.getUniformLocation(prog, name);
  texture(gl, 0, paper, { repeat: true, mips: true });
  texture(gl, 1, plan, { format: gl.LUMINANCE, mips: true });
  texture(gl, 2, lines, { format: gl.LUMINANCE });
  texture(gl, 3, height, { format: gl.LUMINANCE });
  texture(gl, 4, clay);
  texture(gl, 5, finished);
  ['uPaper', 'uPlan', 'uLines', 'uHeight', 'uClay', 'uFinal'].forEach((n, i) => gl.uniform1i(u(n), i));

  const cam = manifest.camera;
  gl.uniform2f(u('uImg'), manifest.imageWidth, manifest.imageHeight);
  gl.uniform3f(u('uInk'), ...INK);
  gl.uniform3f(u('uInkFinish'), ...INK_ON_FINISH);
  gl.uniform1f(u('uHeightRange'), manifest.heightRange);
  gl.uniform1f(u('uTanHalf'), Math.tan(cam.fov * Math.PI / 360));
  gl.uniform1f(u('uAspect'), cam.aspect);
  gl.uniform3f(u('uPlanBox'), ...cam.plan.center, cam.plan.size);
  let fly = flightPath(cam, 16 / 9), canvasAspect = 16 / 9;
  const U = Object.fromEntries(['uRes', 'uFocus', 'uZoom', 'uPlanInk', 'uRise', 'uClayAmt', 'uWipe', 'uPaperPx',
    'uEye', 'uRight', 'uUp', 'uFwd'].map(n => [n, u(n)]));

  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uPaperPx, 512 * dpr);
    canvasAspect = width / height;
    scanStart = canvasAspect < 0.9 ? -0.02 : 0.12;
    fly = flightPath(cam, canvasAspect);
  };

  let elapsed = 0, last = 0, visible = true, running = false, frozen = false;
  const draw = () => {
    const s = timeline(elapsed);
    const v = fly(s.flight);
    gl.uniform3f(U.uEye, ...v.eye); gl.uniform3f(U.uRight, ...v.right);
    gl.uniform3f(U.uUp, ...v.up); gl.uniform3f(U.uFwd, ...v.forward);
    gl.uniform2f(U.uFocus, ...focusAt(elapsed, s.drift, viewFraction(canvasAspect, cam.aspect, s.zoom)));
    gl.uniform1f(U.uZoom, s.zoom); gl.uniform1f(U.uPlanInk, s.plan); gl.uniform1f(U.uRise, s.rise);
    gl.uniform1f(U.uClayAmt, s.clay); gl.uniform1f(U.uWipe, s.wipe);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    art.dataset.t = elapsed.toFixed(2);
  };
  // Runs for as long as the hero is on screen; stops (no frames, no battery)
  // when scrolled away or the tab is hidden, and resumes where it left off.
  const frame = now => {
    if (!visible || document.hidden || frozen) { running = false; last = 0; return; }
    if (last) elapsed += Math.min(now - last, 100) / 1000;
    last = now;
    draw();
    requestAnimationFrame(frame);
  };
  const play = () => { frozen = false; if (!running) { running = true; last = 0; requestAnimationFrame(frame); } };

  new ResizeObserver(() => { resize(); draw(); }).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !frozen) play(); }, { threshold: .05 }).observe(art);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !frozen) play(); });
  resize();
  art.dataset.mode = 'live';

  // Review hook: ?t=6.5 freezes the artwork at that moment instead of playing.
  const freeze = new URLSearchParams(location.search).get('t');
  if (freeze !== null) { frozen = true; elapsed = parseFloat(freeze) || 0; draw(); } else play();
  window.__sweep = { seek(t) { frozen = true; elapsed = t; draw(); }, play };
}

start().catch(error => { console.error('Hero artwork unavailable:', error); showStill(); });
