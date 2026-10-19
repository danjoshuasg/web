// Live behaviour for the XRD figure. Inlined above it: the kit (iso, pathOf, solidSvg, radialTicks, ...), the lathe kit
// as G, model.mjs (run, identify, beamGlow, counts, dSpacing, braggTwoTheta, ANODES, PHASES, SAMPLES, SCAN, LIMITS,
// DEFAULTS), gonio.mjs (makeGonio) and common/live-core.js (clamp, smoothstep, screenOf, ease, liveStage).
const DATA = __DATA__;
const { P } = DATA;
const GD = DATA.gon;
const RAD = Math.PI / 180;
const GONIO = makeGonio({ iso, pathOf, solidSvg, lineSvg, dotsSvg, fadedSvg, cylinder, slabOf, ring, knurl, sideArc, corners }, G, P, GD);
const stage = document.querySelector(".bx-stage");
const partOf = (name) => stage.querySelector(`[data-part="${name}"]`);
const readoutEl = document.querySelector("[data-readout]");
const noteEl = document.querySelector("[data-note]");
const sizeIn = document.querySelector('[data-ctl="size"]');
const sizeOut = document.querySelector('[data-out="size"]');
const scanBtn = document.querySelector("[data-scan]");
const groups = ["sample", "anode"].map((key) => [key, [...document.querySelectorAll(`[data-group="${key}"] input`)]]);
const SVGNS = "http://www.w3.org/2000/svg";

// ---------------------------------------------------------------- the run: model result, measured counts, wording
const params = { sample: DATA.defaults.sample, anode: DATA.defaults.anode, size: DATA.defaults.size };
let target = DATA.defaults.twoTheta; // set 2θ (°)
let arm = target; // where the arms are (°)
let result, measured, seed = 11;
let scan = null; // null, or { stage: "slew" | "run" }
let reveal = 1; // share of the scan range drawn on the LCD
const fmtCps = (c) => {
  if (c < 1e3) return c.toFixed(0);
  const e = Math.floor(Math.log10(c));
  return `${(c / 10 ** e).toFixed(1)}e${e}`;
};
const hklText = (hit) => (hit ? `${hit.label.split(" ")[0]} (${hit.label.split(" ")[1]})` : "—");
const hitAt = (tt) => identify(result, tt);
function prepare() {
  result = run(params);
  measured = counts(result, DATA.secPerStep, seed);
  if (Number(sizeIn.value) !== params.size) sizeIn.value = params.size;
  sizeIn.setAttribute("aria-valuetext", `${params.size} nanometres`);
  sizeOut.textContent = `${params.size} nm`;
  for (const [key, list] of groups) for (const input of list) input.checked = input.value === params[key];
  for (const key of Object.keys(SAMPLES)) { const el = partOf(`tray-${key}`); if (el) el.style.display = key === params.sample ? "none" : ""; }
  labelPeaks();
  aria();
}
function aria() {
  stage.setAttribute("aria-valuenow", target.toFixed(2));
  stage.setAttribute("aria-valuetext", describe(target));
}
function describe(tt) {
  const hit = hitAt(tt);
  const d = dSpacing(tt, result.wavelength);
  return `2θ ${tt.toFixed(2)} degrees, d ${d.toFixed(3)} ångström, ${hit ? `${hklText(hit)} reflection` : "no reflection"}, ${fmtCps(result.at(tt))} counts per second; ${SAMPLES[params.sample].label}, ${ANODES[params.anode].label} K-alpha ${result.wavelength} ångström, ${params.size} nanometre crystallites${scan ? ", scanning" : ""}`;
}

// ---------------------------------------------------------------- diffractogram on the LCD (screen coordinates x, −z)
const { x0: PX0, x1: PX1, z0: PZ0, z1: PZ1 } = DATA.plot;
const [T0, T1] = DATA.axis;
const xOf = (tt) => PX0 + ((PX1 - PX0) * (tt - T0)) / (T1 - T0);
const PTOP = PZ1 - 3.4; // the trace keeps clear of the header line, where the names go
let top = 1;
const zOf = (c) => PZ0 + (PTOP - PZ0) * clamp(c / top, 0, 1);
const COLS = 320;
const NS = Math.round((DATA.scan.to - DATA.scan.from) / DATA.scan.step) + 1;
const idxOf = (tt) => clamp(Math.round((tt - DATA.scan.from) / DATA.scan.step), 0, NS - 1);
const traceEl = partOf("trace");
const penEl = partOf("pen");
const cursorEl = partOf("gradient");
const clockEl = partOf("clock");
const phaseEl = partOf("phase");
const peaksEl = partOf("peaks");
const revealEl = partOf("reveal");
let marks = [];
function labelPeaks() {
  // the strongest reflections, one name per 2.4°, named by hkl (with the phase when two are present)
  const two = Object.keys(SAMPLES[params.sample].phases).length > 1;
  const list = result.peaks.slice().sort((p, q) => q.cps - p.cps);
  marks = [];
  for (const p of list) {
    if (marks.length >= 6) break;
    if (marks.some((q) => Math.abs(q.tt - p.tt) < 2.4)) continue;
    marks.push({ tt: p.tt, text: two ? p.label : p.hkl });
  }
  peaksEl.textContent = "";
  for (const p of marks) {
    const t = document.createElementNS(SVGNS, "text");
    t.setAttribute("class", "bx-lcd-text xd-lcd-small");
    t.setAttribute("font-size", two ? "2.1" : "2.4");
    t.setAttribute("text-anchor", "middle");
    t.textContent = p.text;
    peaksEl.appendChild(t);
    p.el = t;
  }
}
function drawTrace() {
  let peak = 0;
  for (const c of measured) peak = Math.max(peak, c);
  top = peak * 1.08;
  let d = "";
  const per = NS / COLS;
  for (let c = 0; c < COLS; c++) {
    let m = 0;
    for (let i = Math.floor(c * per); i < Math.min(NS, Math.floor((c + 1) * per)); i++) m = Math.max(m, measured[i]);
    const x = xOf(DATA.scan.from + (c + 0.5) * per * DATA.scan.step);
    d += (c ? "L" : "M") + x.toFixed(2) + " " + (-zOf(m)).toFixed(2);
  }
  traceEl.setAttribute("d", d);
  // names sit above their peaks; one that would overlap its left neighbour is stacked above it
  let prev = null;
  for (const p of [...marks].sort((u, w) => u.tt - w.tt)) {
    let m = 0;
    const i = idxOf(p.tt);
    for (let j = Math.max(0, i - 6); j <= Math.min(NS - 1, i + 6); j++) m = Math.max(m, measured[j]);
    const x = xOf(p.tt);
    let z = Math.min(zOf(m) + 1.4, PZ1 + 0.6);
    if (prev && x - prev.x < (p.text.length > 4 ? 10 : 6.4)) z = Math.max(z, prev.z + 2.6);
    const show = z <= PZ1 + 0.6 && xOf(p.tt) <= xOf(DATA.scan.from + reveal * (DATA.scan.to - DATA.scan.from)) + 0.01;
    p.el.setAttribute("x", x.toFixed(2));
    p.el.setAttribute("y", (-z).toFixed(2));
    p.el.style.opacity = show ? "1" : "0";
    if (show) prev = { x, z };
  }
}
function drawCursor() {
  const x = xOf(arm);
  cursorEl.setAttribute("d", `M${x.toFixed(2)} ${(-PZ0).toFixed(2)}V${(-PZ1).toFixed(2)}`);
  const shown = !scan || scan.stage === "run";
  const i = idxOf(arm);
  let m = 0;
  for (let j = Math.max(0, i - 2); j <= Math.min(NS - 1, i + 2); j++) m = Math.max(m, measured[j]);
  penEl.setAttribute("cx", x.toFixed(2));
  penEl.setAttribute("cy", (-(shown ? zOf(m) : PZ0)).toFixed(2));
  revealEl.setAttribute("width", Math.max(0, xOf(DATA.scan.from + reveal * (DATA.scan.to - DATA.scan.from)) - DATA.screen.x0).toFixed(2));
  clockEl.textContent = `${arm.toFixed(2)}° ${hklText(hitAt(arm))}`;
  phaseEl.textContent = scan ? (scan.stage === "slew" ? "to 10°" : `scan ${Math.round(reveal * 100)} %`) : `${ANODES[params.anode].label} · ${params.size} nm`;
}
function axisTicks() {
  let d = "";
  for (let t = T0; t <= T1 + 1e-9; t += 5) d += `M${xOf(t).toFixed(2)} ${(-PZ0).toFixed(2)}v${t % 10 ? 1.1 : 2}`;
  partOf("ticks").setAttribute("d", d);
}

// ---------------------------------------------------------------- the moving group: rebuilt when the arms move
const gonioEl = partOf("gonio");
let built = null;
let refs = {};
let worm = 0;
function rebuild() {
  if (built !== null && Math.abs(built - arm) < 1e-4) return;
  built = arm;
  worm = (arm / 2) * RAD * DATA.wormRatio;
  gonioEl.innerHTML = GONIO.svg(arm, worm);
  refs = { inRay: partOf("beam-in-ray"), inDots: partOf("beam-in-dots"), out: partOf("beam-out"), outRay: partOf("beam-out-ray"), outDots: partOf("beam-out-dots"), spot: partOf("spot"), ticks: partOf("spin-ticks") };
}

// ---------------------------------------------------------------- beams: incident fan to the footprint, diffracted fan converging on the receiving slit
const YB = GD.yb, ZA = GD.za;
const LY = 4.2; // half length of the line focus along the axis
const hullOf2 = (pts) => {
  const s = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of s) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of s.reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
};
const lerp3 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const dotD = (sx, sy, r) => `M${(sx - r).toFixed(2)} ${sy.toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0`;
const hash = (i, lap) => { const x = Math.sin(i * 127.1 + lap * 311.7) * 43758.5453; return x - Math.floor(x); };
function fans(tt) {
  const th = tt / 2;
  const At = GONIO.armOf(180 - th);
  const Ad = GONIO.armOf(th);
  const slit = GD.tube.slit[0];
  const half = 0.55 + slit * Math.tan((DATA.divergence / 2) * RAD);
  const lh = Math.min(half / Math.sin(th * RAD), GD.stage.wellR);
  const from = (fw, fy) => At.L(slit, 0.55 * fw, YB + LY * fy);
  const foot = (fw, fy) => [lh * fw, YB + LY * fy, ZA + 0.05];
  const along = (p) => p[0] * Ad.a[0] + (p[2] - ZA) * Ad.a[2];
  const anti = GD.det.anti[0];
  const toward = (fw, fy) => {
    const e = foot(fw, fy);
    const f = Ad.L(GD.det.recv[0], 0, YB + LY * fy);
    const t = (anti - along(e)) / (along(f) - along(e));
    return lerp3(e, f, t);
  };
  return { from, foot, toward };
}
let clock = 0;
let glow = 0;
const N_IN = 30, N_OUT = 30;
function drawBeams() {
  if (!refs.inRay) return;
  const { from, foot, toward } = fans(arm);
  const corners4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const hullD = (fa, fb) => pathOf(hullOf2(corners4.flatMap(([w, y]) => [iso(fa(w, y), P), iso(fb(w, y), P)])), true);
  refs.inRay.setAttribute("d", hullD(from, foot));
  refs.outRay.setAttribute("d", hullD(foot, toward));
  refs.spot.setAttribute("d", pathOf(corners4.map(([w, y]) => iso(foot(w, y), P)), true));
  refs.out.style.setProperty("--xd-glow", glow.toFixed(3));
  let d = "";
  for (let i = 0; i < N_IN; i++) {
    const u = clock * (DATA.speed / 24) + i / N_IN + hash(i, 0) * 0.02;
    const lap = Math.floor(u);
    const f = u - lap;
    const fw = 2 * hash(i, lap + 0.5) - 1, fy = 2 * hash(i, lap + 0.25) - 1;
    const p = iso(lerp3(from(fw, fy), foot(fw, fy), f), P);
    d += dotD(p[0], p[1], 0.8);
  }
  refs.inDots.setAttribute("d", d);
  d = "";
  // a slot shows a photon on a lap when its draw is under the glow, so a change takes effect as photons leave the sample
  const rate = Math.pow(glow, 0.6);
  for (let i = 0; i < N_OUT; i++) {
    const u = clock * (DATA.speed / 24) + i / N_OUT + hash(i + 50, 0) * 0.02;
    const lap = Math.floor(u);
    if (hash(i + 50, lap) > rate) continue;
    const f = u - lap;
    const fw = 2 * hash(i + 50, lap + 0.5) - 1, fy = 2 * hash(i + 50, lap + 0.25) - 1;
    const p = iso(lerp3(foot(fw, fy), toward(fw, fy), f), P);
    d += dotD(p[0], p[1], 0.8);
  }
  refs.outDots.setAttribute("d", d);
}

// spinner ticks and the HV generator's fan
let spin = 0;
function drawSpinner() {
  if (!refs.ticks) return;
  const S0 = GD.stage;
  const t = radialTicks(0, YB, S0.plateR, 48, 6, S0.spinZ + S0.spinH + S0.plateH, [1, 1.8], P, spin);
  refs.ticks.setAttribute("d", t.minor + t.major);
}
const FN = DATA.fan;
const fanEl = partOf("fan");
let fanAngle = 0;
const pointOn = (F, s, r, t) => [0, 1, 2].map((j) => F.o[j] + F.a[j] * s + r * (F.u[j] * Math.cos(t) + F.v[j] * Math.sin(t)));
function drawFan() {
  let d = "";
  for (let b = 0; b < 7; b++) {
    const pts = [];
    for (let q = 0; q <= 8; q++) {
      const f = q / 8;
      pts.push(iso(pointOn(FN, FN.s, FN.r0 + (FN.r1 - FN.r0) * f, fanAngle + (b * Math.PI * 2) / 7 + 0.5 * f), P));
    }
    d += pathOf(pts);
  }
  fanEl.setAttribute("d", d);
}

// ---------------------------------------------------------------- readout and note
let lastText = "";
function drawReadout() {
  const hit = hitAt(arm);
  const text = `2θ ${arm.toFixed(2)}° · d ${dSpacing(arm, result.wavelength).toFixed(3)} Å · λ ${result.wavelength.toFixed(4)} Å · ${hklText(hit)} · ${fmtCps(result.at(arm))} cps`;
  if (text !== lastText) { readoutEl.textContent = text; lastText = text; }
  const sec = DATA.secPerStep;
  noteEl.textContent = scan
    ? `scanning ${DATA.scan.from}–${DATA.scan.to}° · ${DATA.scan.step}° steps, ${sec} s/step · shown ${DATA.factor}× real time · ${SAMPLES[params.sample].label}`
    : `${SAMPLES[params.sample].label} · ${ANODES[params.anode].label} Kα1 ${result.wavelength} Å · ${params.size} nm crystallites · FWHM at cursor ${fwhm(arm, result.wavelength, params.size).toFixed(2)}°`;
}
function drawAll() {
  rebuild();
  drawBeams();
  drawSpinner();
  drawFan();
  drawCursor();
  drawReadout();
}

// ---------------------------------------------------------------- loop (rAF, reduced motion, tour, keys, live region: live-core)
const TOUR = [
  { peak: "Si 111" },
  { peak: "Si 220" },
  { peak: "Si 311" },
  { tt: 38 },
  { anode: "co", peak: "Si 111" },
  { anode: "cu", size: 200, peak: "Si 111" },
  { size: 20, peak: "Si 111" },
  { size: 50, sample: "nacl", peak: "NaCl 200" },
  { sample: "quartz", peak: "quartz 101" },
  { sample: "mix", scan: true },
  { sample: "si", peak: "Si 111" },
];
const DWELL = 4.6;
let tourClock = 0;
let touched = false;
let tourPeak = -1;
let traceClock = 0;
function setScanButton() {
  scanBtn.setAttribute("aria-pressed", scan ? "true" : "false");
  scanBtn.textContent = scan ? "Stop scan" : "Scan 10–90°";
}
function startScan() {
  seed += 1;
  measured = counts(result, DATA.secPerStep, seed);
  if (live && live.media.matches) { scan = null; reveal = 1; drawTrace(); setScanButton(); return; }
  scan = { stage: "slew" };
  target = DATA.scan.from;
  reveal = 0;
  drawTrace();
  setScanButton();
}
function stopScan() {
  scan = null;
  reveal = 1;
  drawTrace();
  setScanButton();
}
function advance(dt) {
  if (!scan) tourClock += dt;
  if (tourClock > DWELL) {
    tourClock = 0;
    const stop = live.nextStop();
    // once someone has set the instrument, the tour leaves their settings alone and only visits the named peaks
    if (stop && !touched) retune(stop);
    else if (stop && marks.length) retune({ tt: marks[(tourPeak = (tourPeak + 1) % marks.length)].tt });
  }
  clock += dt;
  // arms: during a scan they step in lock with the scan; otherwise they follow the set angle (τ 0.2 s, slew-limited)
  if (scan && scan.stage === "run") {
    target = Math.min(DATA.scan.to, target + DATA.rate * dt);
    arm = target;
    reveal = (arm - DATA.scan.from) / (DATA.scan.to - DATA.scan.from);
    aria();
    if (target >= DATA.scan.to) stopScan();
  } else {
    const step = clamp((target - arm) * (1 - Math.exp(-dt / 0.2)), -DATA.slew * dt, DATA.slew * dt);
    arm = Math.abs(target - arm) < 1e-3 ? target : arm + step;
    if (scan && scan.stage === "slew" && Math.abs(arm - DATA.scan.from) < 0.02) { arm = DATA.scan.from; scan.stage = "run"; }
  }
  glow = ease(glow, beamGlow(result, arm), 0.08, dt);
  spin = (spin + Math.PI * 2 * DATA.spin * dt) % (Math.PI * 2);
  fanAngle = (fanAngle + Math.PI * 2 * 0.8 * dt) % (Math.PI * 2);
  traceClock += dt;
  if (scan && traceClock > 1 / 15) { traceClock = 0; drawTrace(); }
  drawAll();
}
function stillFrame() {
  // reduced motion: one representative frame, the arms at the set angle and the full pattern measured
  if (scan) { scan = null; setScanButton(); }
  reveal = 1;
  arm = target;
  clock = 0.37;
  glow = beamGlow(result, arm);
  drawTrace();
  drawAll();
}
function retune(next) {
  const before = `${params.sample}|${params.anode}|${params.size}`;
  if (next.sample !== undefined) params.sample = next.sample;
  if (next.anode !== undefined) params.anode = next.anode;
  if (next.size !== undefined) params.size = Math.round(clamp(next.size, DATA.limits.size[0], DATA.limits.size[1]) / 5) * 5;
  const changed = before !== `${params.sample}|${params.anode}|${params.size}`;
  if (changed) prepare();
  if (next.scan === false || (scan && (changed || next.tt !== undefined || next.peak !== undefined))) stopScan();
  if (next.peak !== undefined) { const p = result.peaks.find((q) => q.label === next.peak); if (p) target = Math.round(p.tt * 100) / 100; }
  if (next.tt !== undefined) target = Math.round(clamp(next.tt, DATA.limits.twoTheta[0], DATA.limits.twoTheta[1]) * 100) / 100;
  if (next.scan === true) startScan();
  if (changed && !scan) drawTrace();
  aria();
}
const live = liveStage(stage, {
  step: advance,
  rest: stillFrame,
  apply: (next) => { touched = true; retune(next); },
  say: () => `${describe(target)}.`,
  key: { value: () => target, step: 0.05, big: 1, min: DATA.limits.twoTheta[0], max: DATA.limits.twoTheta[1], to: (tt) => ({ tt }) },
  tour: TOUR,
});
sizeIn.addEventListener("input", () => live.steer({ size: Number(sizeIn.value) }));
for (const [key, list] of groups) for (const input of list) input.addEventListener("change", () => { if (input.checked) live.steer({ [key]: input.value }); });
scanBtn.addEventListener("click", () => live.steer({ scan: !scan }));
prepare();
axisTicks();
drawTrace();
live.begin(() => advance(1 / 60));
