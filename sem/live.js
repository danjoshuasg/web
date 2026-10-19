// Live behaviour for the SEM figure. Inlined above it: the kit (iso, pathOf, holdStill), sem/model.mjs (run, probe,
// volume, kanayaRange, renderClean, noisy, fov, seYield, electronsPerPixel, LIMITS, DEFAULTS, ...) and
// common/live-core.js (clamp, smoothstep, screenOf, ease, liveStage).
const DATA = __DATA__;
const { P } = DATA;
const stage = document.querySelector(".bx-stage");
const partOf = (name) => stage.querySelector(`[data-part="${name}"]`);
const readoutEl = document.querySelector("[data-readout]");
const noteEl = document.querySelector("[data-note]");
const inputs = { kV: document.querySelector('[data-ctl="kV"]'), pA: document.querySelector('[data-ctl="pA"]'), wd: document.querySelector('[data-ctl="wd"]') };
const outputs = { kV: document.querySelector('[data-out="kV"]'), pA: document.querySelector('[data-out="pA"]'), wd: document.querySelector('[data-out="wd"]') };
const detInputs = [...document.querySelectorAll('input[name="sm-det"]')];

// ---------------------------------------------------------------- settings and what the model says about them
const params = { ...DATA.defaults };
const PA_SPAN = Math.log(DATA.limits.pA[1] / DATA.limits.pA[0]);
const paOfSlider = (v) => DATA.limits.pA[0] * Math.exp((v / 100) * PA_SPAN);
const sliderOfPa = (pA) => Math.round((Math.log(pA / DATA.limits.pA[0]) / PA_SPAN) * 100);
const roundPa = (pA) => (pA < 10 ? Math.round(pA * 10) / 10 : pA < 100 ? Math.round(pA) : Math.round(pA / 10) * 10);
const fmtMag = (m) => `${Math.round(m).toLocaleString("en-US").replace(/,/g, " ")}×`;
const fmtTorr = (t) => { const e = Math.floor(Math.log10(t)); return `${(t / 10 ** e).toFixed(0)}e${e}`; };
const fmtUm = (u) => (u < 0.1 ? u.toFixed(3) : u < 1 ? u.toFixed(2) : u < 10 ? u.toFixed(2) : u.toFixed(1));
const fmtLen = (nm) => (nm >= 1000 ? `${nm / 1000} µm` : `${nm} nm`);
let result = run(params);
const deepest = kanayaRange(DATA.limits.kV[1], "si");

function describe() {
  return `${fmtMag(params.mag)}, field of view ${(fov(params.mag) / 1000).toFixed(2)} micrometres, ${params.kV} kilovolts, ${params.pA} picoamperes, probe ${result.probeNm.toFixed(1)} nanometres, interaction depth ${fmtUm(result.depthUm)} micrometres, ${params.det === "bse" ? "backscatter" : "secondary electron"} image`;
}
function prepare() {
  result = run(params);
  for (const key of ["kV", "pA", "wd"]) {
    const value = key === "pA" ? sliderOfPa(params.pA) : params[key];
    if (Number(inputs[key].value) !== value) inputs[key].value = value;
  }
  outputs.kV.textContent = `${params.kV} kV`;
  outputs.pA.textContent = `${params.pA} pA`;
  outputs.wd.textContent = `${params.wd} mm`;
  inputs.kV.setAttribute("aria-valuetext", `${params.kV} kilovolts`);
  inputs.pA.setAttribute("aria-valuetext", `${params.pA} picoamperes`);
  inputs.wd.setAttribute("aria-valuetext", `${params.wd} millimetres`);
  for (const input of detInputs) input.checked = input.value === params.det;
  noteEl.textContent = `field of view ${(fov(params.mag) / 1000).toFixed(2)} µm · ${Math.round(result.electrons)} electrons per pixel · SE yield Si ${seYield(params.kV, "si").toFixed(2)} · probe terms: source ${result.terms.dg.toFixed(1)}, diffraction ${result.terms.dd.toFixed(1)}, chromatic ${result.terms.dc.toFixed(2)} nm`;
  stage.setAttribute("aria-valuenow", String(Math.round(params.mag)));
  stage.setAttribute("aria-valuetext", describe());
  readoutEl.textContent = `${params.kV} kV · ${params.pA} pA · probe ${result.probeNm.toFixed(1)} nm · depth ${fmtUm(result.depthUm)} µm · ${fmtMag(params.mag)} · ${fmtTorr(result.pressures[2].torr)} Torr`;
  lcdText();
  dirty = true;
}

// ---------------------------------------------------------------- the image: model raster, rescanned line by line onto the monitor
const IW = DATA.img.w;
const IH = DATA.img.h;
const canvas = document.createElement("canvas");
canvas.width = IW;
canvas.height = IH;
const ctx = canvas.getContext("2d");
const frame = ctx.createImageData(IW, IH);
const imageEl = partOf("image");
const scanEl = partOf("scanline");
const imgBox = { x: Number(imageEl.getAttribute("x")), y: Number(imageEl.getAttribute("y")), w: Number(imageEl.getAttribute("width")), h: Number(imageEl.getAttribute("height")) };
let clean = null;
let target = null;
let dirty = true;
let lastCompute = -1;
let seedN = 3;
let row = 0;
let rowAcc = 0;
let pushed = 0;
let changed = false;
function compute() {
  clean = renderClean(params, IW, IH);
  target = noisy(clean, seedN);
  dirty = false;
}
function writeRows(from, to) {
  for (let j = from; j < to; j++) {
    for (let i = 0; i < IW; i++) {
      const v = Math.round(255 * target[j * IW + i]);
      const o = (j * IW + i) * 4;
      frame.data[o] = v;
      frame.data[o + 1] = v;
      frame.data[o + 2] = v;
      frame.data[o + 3] = 255;
    }
  }
  changed = true;
}
function pushImage() {
  ctx.putImageData(frame, 0, 0);
  imageEl.setAttribute("href", canvas.toDataURL("image/png"));
  changed = false;
}
function scanImage(dt, clock) {
  if (dirty && clock - lastCompute > 0.12) { compute(); lastCompute = clock; }
  rowAcc += DATA.lineRate * dt;
  while (rowAcc >= 1) {
    rowAcc -= 1;
    writeRows(row, row + 1);
    row += 1;
    if (row >= IH) {
      row = 0;
      seedN += 1;
      if (clean) target = noisy(clean, seedN);
    }
  }
  if (changed && clock - pushed > 0.05) { pushImage(); pushed = clock; }
  scanEl.setAttribute("y", (imgBox.y + (row / IH) * imgBox.h).toFixed(2));
}
// LCD data bar: kV, magnification, detector and WD, a scale bar sized from the field of view
function niceBar(fovNm) {
  const want = fovNm * 0.2;
  const e = 10 ** Math.floor(Math.log10(want));
  const m = want / e;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e;
}
function lcdText() {
  partOf("lcd-kv").textContent = `${params.kV.toFixed(1)} kV`;
  partOf("lcd-mag").textContent = fmtMag(params.mag);
  partOf("lcd-det").textContent = `${params.det === "bse" ? "BSE" : "SE"} WD ${params.wd} mm`;
  const F = fov(params.mag);
  const len = niceBar(F);
  const bar = partOf("lcd-bar");
  const w = (len / F) * imgBox.w;
  bar.setAttribute("width", w.toFixed(2));
  bar.setAttribute("x", (Number(bar.dataset.right) - w).toFixed(2));
  partOf("lcd-bar-text").textContent = fmtLen(len);
}

// ---------------------------------------------------------------- the stage lift (working distance)
const liftEls = [...stage.querySelectorAll('.it[data-n^="lift."]')];
const shown = { wd: params.wd, kV: params.kV, probe: result.probeNm };
function placeLift() {
  const dz = (DATA.lift.wdRest - shown.wd) * DATA.lift.unit;
  const [dx, dy] = screenOf([0, 0, dz], P);
  const text = `translate(${dx.toFixed(3)} ${dy.toFixed(3)})`;
  for (const el of liftEls) {
    el.setAttribute("transform", text);
    holdStill(el, [dx, dy]);
  }
  return DATA.lift.rest + dz;
}

// ---------------------------------------------------------------- the beam: envelope, core, electrons, spot and interaction volume
const envEl = partOf("env");
const coreEl = partOf("core");
const dotsEl = partOf("dots");
const spotEl = partOf("spot");
const haloEl = partOf("halo");
const pearEl = partOf("pear");
const pearEdgeEl = partOf("pear-edge");
const K = Math.hypot(...screenOf([1, -1, 0], P)) / Math.SQRT2; // screen units per world unit across the view
const AX = DATA.axis;
// lateral offset of the beam (world x, in the cut plane y = 0) at height z for a scan position s in [-1, 1]
function offsetAt(z, s, zs) {
  const a = (DATA.scanA * (AX.scan[1] - AX.pivot)) / (AX.pivot - zs);
  if (z >= AX.scan[0]) return 0;
  if (z >= AX.scan[1]) return a * s * ((AX.scan[0] - z) / (AX.scan[0] - AX.scan[1]));
  if (z >= AX.pivot) return a * s * ((z - AX.pivot) / (AX.scan[1] - AX.pivot));
  return -DATA.scanA * s * ((AX.pivot - z) / (AX.pivot - zs));
}
// envelope half-width: the listed profile above the objective, then converging to the probe at the specimen
function widthAt(z, zs, spot) {
  const E = DATA.envelope;
  if (z >= E[0][0]) return E[0][1];
  for (let i = 1; i < E.length; i++) {
    if (z >= E[i][0]) {
      const t = (E[i - 1][0] - z) / (E[i - 1][0] - E[i][0]);
      return E[i - 1][1] + (E[i][1] - E[i - 1][1]) * t;
    }
  }
  const last = E[E.length - 1];
  const t = clamp((last[0] - z) / (last[0] - zs), 0, 1);
  return last[1] + (spot - last[1]) * t;
}
const ZS_STEPS = (() => {
  const list = [];
  for (let z = AX.tip; z > AX.scan[0]; z -= 6) list.push(z);
  const E = DATA.envelope.map(([z]) => z);
  return [...new Set([...list, ...E, AX.scan[0], AX.scan[1], AX.pivot])].sort((a, b) => b - a);
})();
const N_E = 46;
const electrons = Array.from({ length: N_E }, (_, i) => (i + 0.5) / N_E);
const circle = (x, y, r) => `M${(x - r).toFixed(2)} ${y.toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0`;
function drawBeam(s, zs) {
  const spot = 0.22 + 0.06 * shown.probe;
  const zList = [...ZS_STEPS.filter((z) => z > zs), ...Array.from({ length: 10 }, (_, i) => AX.pivot - ((AX.pivot - zs) * (i + 1)) / 10)].filter((z, i, l) => i === 0 || z < l[i - 1]);
  const centre = zList.map((z) => iso([offsetAt(z, s, zs), 0, z], P));
  const left = [];
  const right = [];
  zList.forEach((z, i) => {
    const w = widthAt(z, zs, spot) * K;
    left.push([centre[i][0] - w, centre[i][1]]);
    right.push([centre[i][0] + w, centre[i][1]]);
  });
  envEl.setAttribute("d", pathOf([...left, ...right.reverse()], true));
  coreEl.setAttribute("d", pathOf(centre));
  // electrons: evenly spaced along the height, falling at a drawn speed
  let d = "";
  for (const u of electrons) {
    const z = AX.tip - (AX.tip - zs) * u;
    const [x, y] = iso([offsetAt(z, s, zs), 0, z], P);
    d += circle(x, y, 0.55);
  }
  dotsEl.setAttribute("d", d);
  // spot on the specimen top: a small ellipse, and its halo
  const xs = offsetAt(zs, s, zs);
  const ring = (r) => pathOf(Array.from({ length: 24 }, (_, i) => iso([xs + r * Math.cos((i / 24) * Math.PI * 2), r * Math.sin((i / 24) * Math.PI * 2), zs + 0.02], P)), true);
  spotEl.setAttribute("d", ring(spot * 1.1));
  haloEl.setAttribute("d", ring(spot * 3.2));
  drawPear(xs, zs);
}
// interaction volume: a pear of drawn depth D (square-root scale of the Kanaya-Okayama range) and half-width 0.8 D, seen
// on the specimen's two cut faces: the plane y = 0 (x >= 0) through its centre and the plane x = 0 (y >= 0) beside it
function pearR(t) {
  // 0 at the surface entry (a narrow neck), widest just below half depth, closed at the bottom
  return Math.sqrt(Math.max(0, t)) * Math.pow(Math.max(0, 1 - t), 0.55) / 0.4785;
}
function drawPear(xs, zs) {
  const vol = volume(shown.kV, "si");
  const D = DATA.pearMax * Math.sqrt(vol.depth / deepest);
  const Wd = Math.min(DATA.spec.R - Math.abs(xs) - 0.4, D * (vol.radius / vol.depth));
  const n = 28;
  const faceA = { right: [], left: [] };
  const faceB = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = zs - t * D;
    const r = Wd * pearR(t);
    const x1 = Math.min(DATA.spec.R, xs + r);
    const x0 = Math.max(0, xs - r);
    if (x1 > x0) { faceA.right.push(iso([x1, 0, z], P)); faceA.left.push(iso([x0, 0, z], P)); }
    const y = Math.sqrt(Math.max(0, r * r - xs * xs));
    if (y > 0) faceB.push([iso([0, y, z], P), iso([0, 0, z], P)]);
  }
  let d = "";
  if (faceA.right.length > 1) d += pathOf([...faceA.right, ...faceA.left.reverse()], true);
  if (faceB.length > 1) d += pathOf([...faceB.map((p) => p[0]), ...faceB.map((p) => p[1]).reverse()], true);
  pearEl.setAttribute("d", d);
  pearEdgeEl.setAttribute("d", d);
}

// ---------------------------------------------------------------- loop (rAF, reduced motion, tour, keys, live region: live-core)
const TOUR = [
  { kV: 10, pA: 100, det: "se", mag: 30000, wd: 8 },
  { kV: 20 },
  { kV: 30 },
  { kV: 3 },
  { kV: 10, det: "bse" },
  { pA: 5 },
  { pA: 1000 },
  { pA: 100, det: "se", mag: 100000 },
  { mag: 8000, wd: 15 },
  { mag: 30000, wd: 5 },
];
const DWELL = 4.2;
const SWING = 1.6; // drawn period of the beam's line swing (s), illustrative
let tourClock = 0;
let clock = 0;
let swing = 0;
function scanPos(phase) {
  // sawtooth with a short eased flyback
  const f = 0.86;
  return phase < f ? -1 + (2 * phase) / f : 1 - 2 * smoothstep(f, 1, phase);
}
function advance(dt) {
  clock += dt;
  tourClock += dt;
  if (tourClock > DWELL) {
    tourClock = 0;
    const stop = live.nextStop();
    if (stop) { Object.assign(params, stop); prepare(); }
  }
  shown.wd = ease(shown.wd, params.wd, 0.35, dt);
  shown.kV = ease(shown.kV, params.kV, 0.3, dt);
  shown.probe = ease(shown.probe, result.probeNm, 0.3, dt);
  swing = (swing + dt / SWING) % 1;
  const zs = placeLift();
  drawBeam(scanPos(swing), zs);
  scanImage(dt, clock);
}
function stillFrame() {
  // reduced motion: one representative frame, the full image scanned once, the beam parked a third of the way across
  shown.wd = params.wd;
  shown.kV = params.kV;
  shown.probe = result.probeNm;
  compute();
  writeRows(0, IH);
  pushImage();
  row = 0;
  scanEl.setAttribute("y", String(imgBox.y));
  const zs = placeLift();
  drawBeam(0.3, zs);
}
function retune(next) {
  if (next.mag !== undefined) params.mag = Math.round(clamp(next.mag, DATA.limits.mag[0], DATA.limits.mag[1]));
  if (next.kV !== undefined) params.kV = Math.round(clamp(next.kV, DATA.limits.kV[0], DATA.limits.kV[1]));
  if (next.pA !== undefined) params.pA = roundPa(clamp(next.pA, DATA.limits.pA[0], DATA.limits.pA[1]));
  if (next.wd !== undefined) params.wd = Math.round(clamp(next.wd, DATA.limits.wd[0], DATA.limits.wd[1]));
  if (next.det !== undefined) params.det = next.det;
  prepare();
}
const LOG_MAG = [Math.log10(DATA.limits.mag[0]), Math.log10(DATA.limits.mag[1])];
const live = liveStage(stage, {
  step: advance,
  rest: stillFrame,
  apply: retune,
  say: () => `${describe()}.`,
  key: { value: () => Math.log10(params.mag), step: 0.05, big: 0.3, min: LOG_MAG[0], max: LOG_MAG[1], to: (v) => ({ mag: 10 ** clamp(v, LOG_MAG[0], LOG_MAG[1]) }) },
  tour: TOUR,
});
inputs.kV.addEventListener("input", () => live.steer({ kV: Number(inputs.kV.value) }));
inputs.pA.addEventListener("input", () => live.steer({ pA: paOfSlider(Number(inputs.pA.value)) }));
inputs.wd.addEventListener("input", () => live.steer({ wd: Number(inputs.wd.value) }));
for (const input of detInputs) input.addEventListener("change", () => { if (input.checked) live.steer({ det: input.value }); });
prepare();
compute();
writeRows(0, IH);
pushImage();
live.begin(() => { const zs = placeLift(); drawBeam(-1, zs); });
