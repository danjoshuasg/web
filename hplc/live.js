// Live behaviour for the HPLC figure. Inlined above it: the kit (iso, pathOf, translateAlong, holdStill),
// model.mjs (run, pressure, phiAt, retentionFactor, deadTime, ANALYTES, COLUMN, LIMITS) and
// common/live-core.js (clamp, smoothstep, screenOf, ease, liveStage).
const DATA = __DATA__;
const { P } = DATA;
const stage = document.querySelector(".bx-stage");
const svg = stage.querySelector("svg");
const part = (name) => svg.querySelector(`[data-part="${name}"]`);
const readout = document.querySelector("[data-readout]");
const methodEl = document.querySelector("[data-note]");
const inputs = { flow: document.querySelector('[data-ctl="flow"]'), phi1: document.querySelector('[data-ctl="phi1"]') };
const outputs = { flow: document.querySelector('[data-out="flow"]'), phi1: document.querySelector('[data-out="phi1"]') };

// ---------------------------------------------------------------- method and its precomputed run
const params = { ...DATA.defaults };
let method, bands, axisMax, tracePts;
function prepare() {
  method = run(params);
  axisMax = Math.max(2, Math.ceil(method.end));
  // band position along the bed (0 → 1) by the same migration law the model integrates
  const t0 = method.t0;
  const dt = 0.005;
  bands = ANALYTES.map((a) => {
    const xs = [0];
    let x = 0, t = 0;
    while (x < 1 && t < 200) { x += dt / (t0 * (1 + retentionFactor(a, phiAt(t, params)))); t += dt; xs.push(Math.min(1, x)); }
    return { name: a.name, xs, dt };
  });
  const { x0, x1, z0, z1 } = DATA.plot;
  const n = 1600;
  const top = 1.15;
  let d = "";
  for (let i = 0; i <= n; i++) {
    const t = (axisMax * i) / n;
    const x = x0 + ((x1 - x0) * i) / n;
    const y = -(z0 + ((z1 - z0) * Math.min(top, method.signal(t))) / top);
    d += (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
  }
  part("trace").setAttribute("d", d);
  tracePts = { top };
  let ticks = "";
  for (let m = 1; m < axisMax; m++) { const x = x0 + ((x1 - x0) * m) / axisMax; ticks += `M${x.toFixed(2)} ${(-z0).toFixed(2)}v${m % 5 ? 1.2 : 2}`; }
  part("ticks").setAttribute("d", ticks);
  const yb = (phi) => -(z0 + (z1 - z0) * phi);
  const xg = x0 + ((x1 - x0) * Math.min(params.tG, axisMax)) / axisMax;
  part("gradient").setAttribute("d", `M${x0} ${yb(params.phi0).toFixed(2)}L${xg.toFixed(2)} ${yb(phiAt(Math.min(params.tG, axisMax), params)).toFixed(2)}H${DATA.screen.x1}`);
  methodEl.textContent = `t0 ${method.t0.toFixed(2)} · tR ${method.peaks.map((p) => `${p.name} ${p.tR.toFixed(2)}`).join(" · ")} min · ${Math.round(method.pMax)} bar max`;
  stage.setAttribute("aria-valuenow", params.flow.toFixed(2));
  stage.setAttribute("aria-valuetext", `Flow ${params.flow.toFixed(2)} mL/min, final ${Math.round(params.phi1 * 100)} percent B, ${Math.round(pressure(params.flow, params.phi0))} bar at the start, peaks at ${method.peaks.map((p) => p.tR.toFixed(2)).join(", ")} min`);
  for (const key of ["flow", "phi1"]) {
    const text = key === "flow" ? `${params.flow.toFixed(2)} mL/min` : `${Math.round(params.phi1 * 100)} %`;
    if (Number(inputs[key].value) !== (key === "flow" ? params.flow : Math.round(params.phi1 * 100))) inputs[key].value = key === "flow" ? params.flow : Math.round(params.phi1 * 100);
    inputs[key].setAttribute("aria-valuetext", key === "flow" ? text : `${Math.round(params.phi1 * 100)} percent acetonitrile`);
    outputs[key].textContent = text;
  }
}
const bandAt = (b, t) => { if (t <= 0) return 0; const i = t / b.dt; const j = Math.floor(i); if (j >= b.xs.length - 1) return 1; return b.xs[j] + (b.xs[j + 1] - b.xs[j]) * (i - j); };

// ---------------------------------------------------------------- the cycle: sample, inject, run, reset
const T = { toVial: 0.9, down: 0.6, dwell: 0.5, up: 0.6, toSeat: 0.9, seat: 0.6, valve: 0.5, lift: 0.6, back: 0.5, hold: 1.4 };
const INJECT = T.toVial + T.down + T.dwell + T.up + T.toSeat + T.seat + T.valve;
const runSeconds = () => method.end / DATA.speed;
let c = 0; // cycle clock, page seconds
let vial = 0;
function poseAt(cc) {
  const N = DATA.needle;
  const vx = N.vials[vial % N.vials.length];
  let x = N.x, down = 0, valve = 0, phase = "sampling";
  let k = cc;
  const seg = (len) => { const s = clamp(k / len, 0, 1); k -= len; return smoothstep(0, 1, s); };
  const a = seg(T.toVial), b = seg(T.down), _ = seg(T.dwell), u = seg(T.up), s = seg(T.toSeat), d = seg(T.seat), v = seg(T.valve);
  x = N.x + (vx - N.x) * (a - s);
  down = N.down * (b - u + d);
  valve = v;
  void _;
  const tRun = cc > INJECT ? (cc - INJECT) * DATA.speed : 0;
  if (cc > INJECT) phase = tRun < method.end ? "run" : "done";
  if (cc > INJECT + runSeconds()) {
    const k2 = cc - INJECT - runSeconds();
    down = N.down * (1 - smoothstep(0, T.lift, k2));
    valve = 1 - smoothstep(T.lift, T.lift + T.back, k2);
  }
  return { x, down, valve, tRun: Math.min(tRun, method.end), phase };
}
const cycleLength = () => INJECT + runSeconds() + T.lift + T.back + T.hold;

// ---------------------------------------------------------------- drawing
const pistons = DATA.pistons.map((id) => ({ id, cam: part("cam" + id), rod: part("piston" + id), theta: 0 }));
const unitX = screenOf([1, 0, 0], P);
const carriage = part("carriage");
const needle = part("needle");
const cut = part("cut");
const grooves = part("grooves");
const gauge = part("gauge");
const bandsEl = part("bands");
const reveal = part("reveal");
const pen = part("pen");
const clockEl = part("clock");
const phaseEl = part("phase");
const shown = { x: DATA.needle.x, down: 0, valve: 0, p: pressure(params.flow, params.phi0) };

function patch(s0, s1) {
  const F = DATA.colF, r = DATA.colR, a0 = DATA.win.a0, a1 = DATA.win.a1, n = 10;
  const pt = (s, a) => iso([0, 1, 2].map((i) => F.o[i] + F.a[i] * s + r * (F.u[i] * Math.cos(a) + F.v[i] * Math.sin(a))), P);
  const out = [];
  for (let i = 0; i <= n; i++) out.push(pt(s0, a0 + ((a1 - a0) * i) / n));
  for (let i = n; i >= 0; i--) out.push(pt(s1, a0 + ((a1 - a0) * i) / n));
  return "M" + out.map(([x, y]) => x.toFixed(2) + " " + y.toFixed(2)).join("L") + "Z";
}
function grooveD(alpha) {
  const { x, y, z } = DATA.valve;
  const pairs = [[205, 265], [325, 25], [85, 145]];
  const pt = (deg, rr) => [x + rr * Math.cos(deg * Math.PI / 180), y + rr * Math.sin(deg * Math.PI / 180)];
  return pairs.map(([a, b]) => {
    const p = pt(a + alpha, DATA.portR), q = pt(b + alpha, DATA.portR);
    const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const w = 0.95;
    const ring = [];
    for (let i = 0; i <= 8; i++) { const t = ang + Math.PI / 2 + (Math.PI * i) / 8; ring.push([q[0] + w * Math.cos(t), q[1] + w * Math.sin(t)]); }
    for (let i = 0; i <= 8; i++) { const t = ang - Math.PI / 2 + (Math.PI * i) / 8; ring.push([p[0] + w * Math.cos(t), p[1] + w * Math.sin(t)]); }
    return pathOf(ring.map(([u, v]) => iso([u, v, z + 8], P)), true);
  }).join("");
}
function gaugeD(p) {
  const g = DATA.gauge;
  const A = (-135 + 270 * clamp(p / LIMITS.pMax, 0, 1)) * Math.PI / 180;
  const tail = iso([g.x - Math.sin(A) * 1.4, g.y + Math.cos(A) * 1.4, g.z], P);
  const tip = iso([g.x + Math.sin(A) * g.r, g.y - Math.cos(A) * g.r, g.z], P);
  return `M${tail[0].toFixed(2)} ${tail[1].toFixed(2)}L${tip[0].toFixed(2)} ${tip[1].toFixed(2)}`;
}
function entryZ(x) {
  const N = DATA.needle;
  if (N.vials.some((vx) => Math.abs(vx - x) < 2.4)) return N.vialTop;
  if (Math.abs(x - N.x) < 1.6) return N.seatTop;
  return null;
}
let lastText = "";
function draw(pose, phi) {
  const N = DATA.needle;
  // pistons: displacement e(1 − cos θ) out of the gland, cam centre on its circle
  for (const p of pistons) {
    const e = DATA.ecc;
    p.cam.setAttribute("transform", translateAlong(P, [e * Math.cos(p.theta) - e, 0, e * Math.sin(p.theta)]));
    const d = e * (1 - Math.cos(p.theta));
    const off = [-unitX[0] * d, -unitX[1] * d];
    p.rod.setAttribute("transform", `translate(${off[0].toFixed(2)} ${off[1].toFixed(2)})`);
    holdStill(p.rod, off);
  }
  // autosampler
  const dx = shown.x - N.x;
  const carOff = screenOf([dx, 0, 0], P);
  carriage.setAttribute("transform", `translate(${carOff[0].toFixed(2)} ${carOff[1].toFixed(2)})`);
  const nOff = screenOf([0, 0, -shown.down], P);
  needle.setAttribute("transform", `translate(${nOff[0].toFixed(2)} ${nOff[1].toFixed(2)})`);
  holdStill(needle, nOff);
  const ez = entryZ(shown.x);
  const yCut = ez === null ? 4000 : iso([N.x, N.y, ez], P)[1];
  cut.setAttribute("height", String(yCut + 2000));
  grooves.setAttribute("d", grooveD(60 * shown.valve));
  gauge.setAttribute("d", gaugeD(shown.p));
  // analyte bands in the bed
  const { s0, s1 } = DATA.win;
  let bd = "";
  if (pose.phase === "run" || pose.phase === "done")
    for (const b of bands) {
      const x = bandAt(b, pose.tRun);
      if (x <= 0 || x >= 1) continue;
      const sc = s0 + (s1 - s0) * x;
      const hw = 0.9 + 2 * (s1 - s0) * Math.sqrt(x / COLUMN.plates);
      bd += patch(sc - hw, sc + hw);
    }
  bandsEl.setAttribute("d", bd);
  // chromatogram
  const { x0, x1, z0, z1 } = DATA.plot;
  const tr = pose.phase === "sampling" ? 0 : pose.tRun;
  const px = x0 + ((x1 - x0) * tr) / axisMax;
  reveal.setAttribute("width", (px - DATA.screen.x0).toFixed(2));
  pen.setAttribute("cx", px.toFixed(2));
  pen.setAttribute("cy", (-(z0 + ((z1 - z0) * Math.min(tracePts.top, method.signal(tr))) / tracePts.top)).toFixed(2));
  clockEl.textContent = `t ${tr.toFixed(2)} min`;
  phaseEl.textContent = `${Math.round(phi * 100)} %B`;
  // readout: words and numbers from the same instant
  const bar = Math.round(shown.p);
  let text;
  if (pose.phase === "sampling") text = `sampling · ${params.flow.toFixed(2)} mL/min · ${bar} bar`;
  else {
    const next = method.peaks.find((p) => p.tR > tr) ?? method.peaks[method.peaks.length - 1];
    text = `${params.flow.toFixed(2)} mL/min · ${bar} bar · ${Math.round(phi * 100)} %B · tR ${next.name} ${next.tR.toFixed(2)} min`;
  }
  if (text !== lastText) { readout.textContent = text; lastText = text; }
}

// ---------------------------------------------------------------- loop (rAF, reduced motion, tour, keys, live region: live-core)
const TOUR = [{ flow: 1.0, phi1: 0.8 }, { flow: 1.6, phi1: 0.8 }, { flow: 1.6, phi1: 0.95 }, { flow: 0.6, phi1: 0.6 }];
function advance(dt) {
  c += dt;
  if (c >= cycleLength()) {
    c = 0;
    vial++;
    const stop = live.nextStop();
    if (stop) { Object.assign(params, stop); prepare(); }
  }
  const pose = poseAt(c);
  const phi = pose.phase === "sampling" ? params.phi0 : phiAt(pose.tRun, params);
  shown.x = ease(shown.x, pose.x, 0.06, dt);
  shown.down = ease(shown.down, pose.down, 0.06, dt);
  shown.valve = ease(shown.valve, pose.valve, 0.08, dt);
  shown.p = ease(shown.p, pressure(params.flow, phi), 0.25, dt);
  // each channel strokes at its own share of the flow: f = q / V_stroke
  const q = [params.flow * (1 - phi), params.flow * phi];
  pistons.forEach((p, i) => { p.theta = (p.theta + (2 * Math.PI * q[i] * dt) / (DATA.strokeML * 60)) % (2 * Math.PI); });
  draw(pose, phi);
}
function stillFrame() {
  // reduced motion: one representative frame, the finished run with the needle in its seat
  const pose = { x: DATA.needle.x, down: DATA.needle.down, valve: 1, tRun: method.end, phase: "done" };
  Object.assign(shown, { x: pose.x, down: pose.down, valve: 1, p: pressure(params.flow, phiAt(method.end, params)) });
  draw(pose, phiAt(method.end, params));
}
function retune(next) {
  const flow = next.flow ?? params.flow;
  const phi1 = next.phi1 ?? params.phi1;
  params.flow = Math.round(clamp(flow, LIMITS.flow[0], LIMITS.flow[1]) * 100) / 100;
  params.phi1 = Math.round(clamp(phi1, 0.4, LIMITS.phi1[1]) * 100) / 100;
  prepare();
  // a new method re-injects: the run restarts at the valve switch, the needle already in its seat
  if (c > INJECT) c = INJECT;
}
const live = liveStage(stage, {
  step: advance,
  rest: stillFrame,
  apply: retune,
  say: () => `Flow ${params.flow.toFixed(2)} millilitres per minute, final ${Math.round(params.phi1 * 100)} percent B: peaks at ${method.peaks.map((p) => p.tR.toFixed(2)).join(", ")} minutes, ${Math.round(method.pMax)} bar.`,
  key: { value: () => params.flow, step: 0.05, big: 0.25, min: LIMITS.flow[0], max: LIMITS.flow[1], to: (flow) => ({ flow }) },
  tour: TOUR,
});
inputs.flow.addEventListener("input", () => live.steer({ flow: Number(inputs.flow.value) }));
inputs.phi1.addEventListener("input", () => live.steer({ phi1: Number(inputs.phi1.value) / 100 }));
prepare();
live.begin(() => draw(poseAt(0), params.phi0));
