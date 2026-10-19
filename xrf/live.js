// Live behaviour for the EDXRF figure. Inlined above it: the kit (iso, pathOf, radialTicks, cameraOf, ...), model.mjs
// (run, identify, counts, lines, detEff, ELEMENTS, SAMPLES, FILTERS, ATMOSPHERES, LIMITS, DEFAULTS, DET, TUBE) and
// common/live-core.js (clamp, smoothstep, screenOf, ease, liveStage).
const DATA = __DATA__;
const { P } = DATA;
const stage = document.querySelector(".bx-stage");
const partOf = (name) => stage.querySelector(`[data-part="${name}"]`);
const readoutEl = document.querySelector("[data-readout]");
const noteEl = document.querySelector("[data-note]");
const inputs = { kV: document.querySelector('[data-ctl="kV"]'), uA: document.querySelector('[data-ctl="uA"]') };
const outputs = { kV: document.querySelector('[data-out="kV"]'), uA: document.querySelector('[data-out="uA"]') };
const groups = ["filter", "atm", "sample"].map((key) => [key, [...document.querySelectorAll(`[data-group="${key}"] input`)]]);
const SVGNS = "http://www.w3.org/2000/svg";

// ---------------------------------------------------------------- the run: model result, acquisition clock, wording
const params = { ...DATA.defaults, cursor: 8.05 };
const PRESET = DATA.defaults.live;
let result, topCounts, inMax;
let acq = 0; // acquisition clock (s of preset time)
let hold = 0; // real seconds the finished spectrum has been held
const fmtCps = (c) => {
  if (c < 1e3) return c < 10 ? c.toFixed(1) : c.toFixed(0);
  const e = Math.floor(Math.log10(c));
  return `${(c / 10 ** e).toFixed(1)}e${e}`;
};
const lineName = (label) => label.replace(/ Ka$/, " Kα").replace(/ Kb$/, " Kβ").replace(/ La$/, " Lα").replace(/ Lb$/, " Lβ").replace(/ Ka C$/, " Kα C").replace(/ Kb C$/, " Kβ C");
const ATM_WORD = { air: "air", he: "helium", vac: "vacuum" };
const filterWord = (f) => FILTERS[f].label.replace("um", "µm");
const cursorLine = () => identify(result, params.cursor, 0.2);

function prepare() {
  result = run(params);
  // full scale of the log display: the tallest bin at the end of the preset time, with headroom
  let peak = 0;
  for (const m of result.bins) peak = Math.max(peak, m);
  topCounts = Math.max(10, peak * (1 - result.dead) * PRESET * 1.6);
  // the brightest primary beam this figure can show: 50 kV, 200 µA, no filter, on brass
  inMax = run({ ...params, kV: DATA.limits.kV[1], uA: DATA.limits.uA[1], filter: "none", sample: "brass", atm: "vac" }).inCps;
  for (const key of ["kV", "uA"]) {
    if (Number(inputs[key].value) !== params[key]) inputs[key].value = params[key];
    inputs[key].setAttribute("aria-valuetext", key === "kV" ? `${params.kV} kilovolts` : `${params.uA} microamps`);
    outputs[key].textContent = key === "kV" ? `${params.kV} kV` : `${params.uA} µA`;
  }
  for (const [key, list] of groups) for (const input of list) input.checked = input.value === params[key];
  findPeaks();
  intensity();
  stage.setAttribute("aria-valuenow", params.cursor.toFixed(2));
  stage.setAttribute("aria-valuetext", describe());
}
function describe() {
  const hit = cursorLine();
  return `${params.cursor.toFixed(2)} keV, ${hit ? `${lineName(hit.label)} at ${hit.E.toFixed(2)} keV, ${fmtCps(hit.cps)} counts per second` : "no line"}; ${params.kV} kilovolts, ${params.uA} microamps, ${filterWord(params.filter)} filter, ${ATM_WORD[params.atm]} path, ${SAMPLES[params.sample].label}; ${fmtCps(result.inCps)} counts per second in, ${fmtCps(result.outCps)} out, ${(result.dead * 100).toFixed(1)} percent dead time`;
}

// ---------------------------------------------------------------- spectrum on the LCD (screen coordinates x, −z)
const { x0: PX0, x1: PX1, z0: PZ0, z1: PZ1 } = DATA.plot;
const [E0, E1] = DATA.eAxis;
const xOf = (E) => PX0 + ((PX1 - PX0) * (E - E0)) / (E1 - E0);
const PTOP = PZ1 - 3; // the trace keeps clear of the top grid line, where the peak names go
const zOf = (c) => PZ0 + (PTOP - PZ0) * clamp(Math.log10(1 + c) / Math.log10(1 + topCounts), 0, 1);
const BIN = DET.binKev;
const NB = Math.round((E1 - E0) / BIN);
const COLS = 300;
const traceEl = partOf("trace");
const penEl = partOf("pen");
const cursorEl = partOf("gradient");
const clockEl = partOf("clock");
const phaseEl = partOf("phase");
const peaksEl = partOf("peaks");
let shown = null; // counts on screen
let peakMarks = [];
function findPeaks() {
  // local maxima of the expected spectrum, named by identify(); strongest first, one name per 0.45 keV
  const b = result.bins;
  const found = [];
  for (let i = 3; i < NB - 3; i++) {
    if (b[i] > b[i - 1] && b[i] >= b[i + 1] && b[i] > b[i - 3] * 1.3 && b[i] > b[i + 3] * 1.3) {
      const E = (i + 0.5) * BIN;
      const hit = identify(result, E, 0.15);
      if (hit && !hit.label.endsWith(" C")) found.push({ E, i, label: hit.label, m: b[i] });
    }
  }
  found.sort((p, q) => q.m - p.m);
  peakMarks = [];
  for (const p of found) {
    if (peakMarks.length >= 6) break;
    if (peakMarks.some((q) => Math.abs(q.E - p.E) < 0.45)) continue;
    peakMarks.push(p);
  }
  peaksEl.textContent = "";
  for (const p of peakMarks) {
    const t = document.createElementNS(SVGNS, "text");
    t.setAttribute("class", "bx-lcd-text xr-lcd-small");
    t.setAttribute("font-size", "2.4");
    t.setAttribute("text-anchor", "middle");
    t.textContent = p.label.split(" ")[0] + " " + p.label.split(" ")[1].replace("a", "α").replace("b", "β");
    peaksEl.appendChild(t);
    p.el = t;
  }
}
function drawSpectrum() {
  shown = counts(result, acq, 7);
  let d = "";
  const per = NB / COLS;
  for (let c = 0; c < COLS; c++) {
    let m = 0;
    for (let i = Math.floor(c * per); i < Math.floor((c + 1) * per); i++) m = Math.max(m, shown[i]);
    const x = xOf(E0 + ((c + 0.5) * per) * BIN);
    d += (c ? "L" : "M") + x.toFixed(2) + " " + (-zOf(m)).toFixed(2);
  }
  traceEl.setAttribute("d", d);
  // names sit above their peaks; a name that would overlap the one to its left is stacked above it
  let prev = null;
  for (const p of [...peakMarks].sort((u, w) => u.E - w.E)) {
    let m = 0;
    for (let i = p.i - 2; i <= p.i + 2; i++) m = Math.max(m, shown[i]);
    const x = xOf(p.E);
    let z = Math.min(zOf(m) + 1.4, PZ1 + 0.6);
    if (prev && x - prev.x < 7.6) z = Math.max(z, prev.z + 2.7);
    const show = m > 3 && z <= PZ1 + 0.6; // a name with no room under the header is left out
    p.el.setAttribute("x", x.toFixed(2));
    p.el.setAttribute("y", (-z).toFixed(2));
    p.el.style.opacity = show ? "1" : "0";
    if (show) prev = { x, z };
  }
}
function drawCursor() {
  const x = xOf(params.cursor);
  const i = Math.min(NB - 1, Math.floor(params.cursor / BIN));
  let m = 0;
  if (shown) for (let j = Math.max(0, i - 1); j <= Math.min(NB - 1, i + 1); j++) m = Math.max(m, shown[j]);
  cursorEl.setAttribute("d", `M${x.toFixed(2)} ${(-PZ0).toFixed(2)}V${(-PZ1).toFixed(2)}`);
  penEl.setAttribute("cx", x.toFixed(2));
  penEl.setAttribute("cy", (-zOf(m)).toFixed(2));
  const hit = cursorLine();
  clockEl.textContent = `${params.cursor.toFixed(2)} keV ${hit ? lineName(hit.label) : "—"}`;
  phaseEl.textContent = `LT ${(acq * (1 - result.dead)).toFixed(1)} s`;
}
function axisTicks() {
  let d = "";
  for (let E = E0; E <= E1 + 1e-9; E += 1) d += `M${xOf(E).toFixed(2)} ${(-PZ0).toFixed(2)}v${E % 5 ? 1.1 : 2}`;
  partOf("ticks").setAttribute("d", d);
  partOf("reveal").setAttribute("width", String(DATA.screen.x1 - DATA.screen.x0));
}

// ---------------------------------------------------------------- world geometry for the moving parts
const pointOn = (F, s, r, t) => [0, 1, 2].map((j) => F.o[j] + F.a[j] * s + r * (F.u[j] * Math.cos(t) + F.v[j] * Math.sin(t)));
const circleAround = (F, c, r, n = 24) => pathOf(Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return iso([0, 1, 2].map((j) => c[j] + r * (F.u[j] * Math.cos(t) + F.v[j] * Math.sin(t))), P); }), true);
const dotD = (sx, sy, r) => `M${(sx - r).toFixed(2)} ${sy.toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0`;
const K = cameraOf(P).k;

// filter wheel: aperture j sits on the beam (angle π in the wheel frame) when the wheel is at π − j·120°
const WH = DATA.wheel;
const wheelTarget = () => Math.PI - WH.order.indexOf(params.filter) * ((Math.PI * 2) / 3);
const wheel = { x: wheelTarget(), v: 0 };
// how squarely an aperture sits on the beam: while the wheel turns, solid wheel blocks the beam
const aligned = () => {
  const step = (Math.PI * 2) / 3;
  const off = Math.abs(((((wheel.x - Math.PI) % step) + step * 1.5) % step) - step / 2);
  return 1 - smoothstep(0.04, 0.2, off);
};
const apEls = { none: partOf("ap-none"), al: partOf("ap-al"), cu: partOf("ap-cu"), rims: partOf("ap-rims") };
function drawWheel() {
  let rims = "";
  WH.order.forEach((f, j) => {
    const c = pointOn(WH, WH.s, WH.off, wheel.x + (j * Math.PI * 2) / 3);
    const d = circleAround(WH, c, WH.hole);
    apEls[f].setAttribute("d", d);
    rims += d + (f === "cu" ? circleAround(WH, c, WH.hole * 0.55, 18) : "");
  });
  apEls.rims.setAttribute("d", rims);
}

// primary beam: a lit ribbon from the selected aperture to the spot, brightness from the model's input count rate
const BM = DATA.beam;
const beamEl = partOf("beam");
const spotEl = partOf("spot");
const glow = { x: 0, v: 0 };
let beamLevel = 0;
function intensity() {
  beamLevel = Math.pow(clamp(result.inCps / inMax, 0, 1), 0.3);
}
function drawBeam() {
  const a = iso(pointOn(DATA.tube, BM.s0, 0, 0), P);
  const b = iso(pointOn(DATA.tube, BM.s1, 0, 0), P);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const [r0, r1] = BM.r.map((r) => r * K * 0.9);
  beamEl.setAttribute("d", `M${(a[0] + nx * r0).toFixed(2)} ${(a[1] + ny * r0).toFixed(2)}L${(b[0] + nx * r1).toFixed(2)} ${(b[1] + ny * r1).toFixed(2)}L${(b[0] - nx * r1).toFixed(2)} ${(b[1] - ny * r1).toFixed(2)}L${(a[0] - nx * r0).toFixed(2)} ${(a[1] - ny * r0).toFixed(2)}Z`);
  stage.style.setProperty("--xr-beam", (glow.x * aligned() * (0.25 + 0.75 * beamLevel)).toFixed(3));
}

// photons: fixed slots along each path; a slot shows a photon on a lap when its draw is under the rate fraction,
// so a change of rate only takes effect as photons leave the source (nothing pops mid-flight)
const hash = (i, lap) => { const x = Math.sin(i * 127.1 + lap * 311.7) * 43758.5453; return x - Math.floor(x); };
const BEAM_N = 36, XRAY_N = 40;
let clock = 0;
const beamDots = partOf("beam-dots");
const xrayDots = partOf("xray-dots");
const beamLen = BM.s1 - BM.s0;
const rateOf = (cps) => clamp(Math.pow(cps / 1.5e5, 0.3), 0, 1);
function drawPhotons() {
  let d = "";
  const fb = rateOf(result.inCps);
  for (let i = 0; i < BEAM_N; i++) {
    const u = clock * (DATA.speed.beam / beamLen) + i / BEAM_N + hash(i, 0) * 0.02;
    const lap = Math.floor(u);
    if (hash(i, lap) > fb * aligned()) continue;
    const f = u - lap;
    const r = BM.r[0] + (BM.r[1] - BM.r[0]) * f;
    const p = iso(pointOn(DATA.tube, BM.s0 + f * beamLen, r * 0.55 * hash(i, lap + 0.5), hash(i, lap + 0.25) * Math.PI * 2), P);
    d += dotD(p[0], p[1], 0.85);
  }
  beamDots.setAttribute("d", d);
  d = "";
  const fx = rateOf(result.outCps);
  const len = DATA.det.s1;
  for (let i = 0; i < XRAY_N; i++) {
    const u = clock * (DATA.speed.xray / len) + i / XRAY_N + hash(i + 50, 0) * 0.02;
    const lap = Math.floor(u);
    if (hash(i + 50, lap) > fx) continue;
    const f = u - lap;
    const p = iso(pointOn(DATA.det, 0.6 + f * (len - 0.6), 2.8 * f * hash(i + 50, lap + 0.5), hash(i + 50, lap + 0.25) * Math.PI * 2), P);
    d += dotD(p[0], p[1], 0.75);
  }
  xrayDots.setAttribute("d", d);
}

// spinner ticks and the HV generator's fan
const ticksEl = partOf("spin-ticks");
let spin = 0;
function drawSpinner() {
  const t = radialTicks(DATA.spin.c[0], DATA.spin.c[1], DATA.spin.r, 48, 6, DATA.spin.z, [1.1, 2.2], P, spin);
  ticksEl.setAttribute("d", t.minor + t.major);
}
const FN = DATA.fan;
const fanEl = partOf("fan");
let fanAngle = 0;
function drawFan() {
  let d = "";
  for (let b = 0; b < 7; b++) {
    const pts = [];
    for (let q = 0; q <= 8; q++) {
      const f = q / 8;
      const r = FN.r0 + (FN.r1 - FN.r0) * f;
      pts.push(iso(pointOn(FN, FN.s, r, fanAngle + (b * Math.PI * 2) / 7 + 0.5 * f), P));
    }
    d += pathOf(pts);
  }
  fanEl.setAttribute("d", d);
}

// ---------------------------------------------------------------- readout and note
let lastText = "";
function drawReadout() {
  const hit = cursorLine();
  const text = `${params.kV} kV ${params.uA} µA · ${fmtCps(result.inCps)}→${fmtCps(result.outCps)} cps · DT ${(result.dead * 100).toFixed(1)} % · ${params.cursor.toFixed(2)} keV ${hit ? lineName(hit.label) : "—"}`;
  if (text !== lastText) { readoutEl.textContent = text; lastText = text; }
  noteEl.textContent = `real ${acq.toFixed(1)} / ${PRESET} s, live ${(acq * (1 - result.dead)).toFixed(1)} s · ${SAMPLES[params.sample].label} · ${filterWord(params.filter)} · ${ATM_WORD[params.atm]}`;
}

// ---------------------------------------------------------------- loop (rAF, reduced motion, tour, keys, live region: live-core)
const TOUR = [
  { cursor: 8.05 },
  { cursor: 8.64 },
  { cursor: 10.55 },
  { cursor: 10.55, kV: 12 },
  { cursor: 10.55, kV: 40, filter: "cu" },
  { cursor: 6.4, sample: "soil", filter: "al" },
  { cursor: 3.69, sample: "soil", atm: "he" },
  { cursor: 3.69, sample: "soil", atm: "vac", filter: "none" },
  { cursor: 20.22, sample: "plastic", atm: "air", filter: "al", uA: 150 },
  { cursor: 8.05, sample: "brass", filter: "al", uA: 50 },
];
const DWELL = 5.2;
let tourClock = 0;
let touched = false;
let tourPeak = -1;
let spectrumClock = 0;
function advance(dt) {
  tourClock += dt;
  if (tourClock > DWELL) {
    tourClock = 0;
    const stop = live.nextStop();
    // once someone has set the instrument, the tour leaves their settings alone and only visits the named peaks
    if (stop && !touched) retune(stop);
    else if (stop && peakMarks.length) retune({ cursor: peakMarks[(tourPeak = (tourPeak + 1) % peakMarks.length)].E });
  }
  clock += dt;
  if (acq < PRESET) acq = Math.min(PRESET, acq + dt * DATA.acq);
  else if ((hold += dt) > 2) { acq = 0; hold = 0; }
  spectrumClock += dt;
  if (spectrumClock > 1 / 12 || acq === 0) { spectrumClock = 0; drawSpectrum(); }
  // the wheel turns the short way to the selected filter (time constant 0.3 s)
  let target = wheelTarget();
  target += Math.round((wheel.x - target) / (Math.PI * 2)) * Math.PI * 2;
  wheel.x = ease(wheel.x, target, 0.3, dt);
  glow.x = ease(glow.x, 1, 0.4, dt);
  spin = (spin + Math.PI * 2 * DATA.spin.rps * dt) % (Math.PI * 2);
  fanAngle = (fanAngle + Math.PI * 2 * 0.8 * dt) % (Math.PI * 2);
  drawWheel();
  drawBeam();
  drawPhotons();
  drawSpinner();
  drawFan();
  drawCursor();
  drawReadout();
}
function stillFrame() {
  // reduced motion: one representative frame, the spectrum at its full preset time and the photons laid out once
  acq = PRESET;
  hold = 0;
  clock = 0.37;
  wheel.x = wheelTarget();
  glow.x = 1;
  drawSpectrum();
  drawWheel();
  drawBeam();
  drawPhotons();
  drawSpinner();
  drawFan();
  drawCursor();
  drawReadout();
}
function retune(next) {
  const before = `${params.kV}|${params.uA}|${params.filter}|${params.atm}|${params.sample}`;
  if (next.cursor !== undefined) params.cursor = Math.round(clamp(next.cursor, DATA.limits.cursor[0], DATA.limits.cursor[1]) * 100) / 100;
  if (next.kV !== undefined) params.kV = Math.round(clamp(next.kV, DATA.limits.kV[0], DATA.limits.kV[1]));
  if (next.uA !== undefined) params.uA = Math.round(clamp(next.uA, DATA.limits.uA[0], DATA.limits.uA[1]) / 5) * 5;
  for (const key of ["filter", "atm", "sample"]) if (next[key] !== undefined) params[key] = next[key];
  const changed = before !== `${params.kV}|${params.uA}|${params.filter}|${params.atm}|${params.sample}`;
  prepare();
  if (changed) { acq = live && !live.media.matches ? 0 : PRESET; hold = 0; drawSpectrum(); }
}
const live = liveStage(stage, {
  step: advance,
  rest: stillFrame,
  apply: (next) => { touched = true; retune(next); },
  say: () => `${describe()}.`,
  key: { value: () => params.cursor, step: 0.05, big: 1, min: DATA.limits.cursor[0], max: DATA.limits.cursor[1], to: (cursor) => ({ cursor }) },
  tour: TOUR,
});
inputs.kV.addEventListener("input", () => live.steer({ kV: Number(inputs.kV.value) }));
inputs.uA.addEventListener("input", () => live.steer({ uA: Number(inputs.uA.value) }));
for (const [key, list] of groups) for (const input of list) input.addEventListener("change", () => { if (input.checked) live.steer({ [key]: input.value }); });
prepare();
axisTicks();
live.begin(() => { acq = 0; drawSpectrum(); advance(1 / 60); });
