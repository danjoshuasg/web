// Live behaviour for the ICP-MS figure. Inlined above it: the kit (iso, pathOf), the WebGL layer (glLayer, smooth,
// burst, settle), model.mjs (run, transmit, cellFactor, polyFactor, quadRF, ELEMENTS, LIMITS, DEFAULTS, ...) and
// common/live-core.js (clamp, smoothstep, screenOf, ease, liveStage).
const DATA = __DATA__;
const { P } = DATA;
const stage = document.querySelector(".bx-stage");
const figure = stage.querySelector("svg");
const partOf = (name) => stage.querySelector(`[data-part="${name}"]`);
const readoutEl = document.querySelector("[data-readout]");
const noteEl = document.querySelector("[data-note]");
const modeEl = document.querySelector("[data-mode]");
const inputs = { rf: document.querySelector('[data-ctl="rf"]'), neb: document.querySelector('[data-ctl="neb"]') };
const outputs = { rf: document.querySelector('[data-out="rf"]'), neb: document.querySelector('[data-out="neb"]') };

// ---------------------------------------------------------------- the method: model run, spectrum, species of the ion packets
const params = { ...DATA.defaults };
const shownMz = { x: params.mz, v: 0 };
let result, species, speciesCdf;
const fmtCps = (c) => {
  if (c < 1e3) return c < 10 ? c.toFixed(1) : c.toFixed(0);
  const e = Math.floor(Math.log10(c));
  return `${(c / 10 ** e).toFixed(1)}e${e}`;
};
// element read at a nominal m/z: the isotope line with the most counts there
function elementAt(mz) {
  const m = Math.round(mz);
  const best = result.lines.filter((l) => !l.poly && l.mz === m).sort((a, b) => b.cps - a.cps)[0];
  return best ? best.sym : null;
}
const polyAt = (mz) => result.lines.find((l) => l.poly && l.mz === Math.round(mz)) ?? null;
const logOf = (cps) => clamp(Math.log10(Math.max(cps, 1)) / 8, 0, 1);

function prepare() {
  result = run(params);
  // packets sample the lines in proportion to cps^0.4, so the weak analytes still show next to Ar2+
  species = result.lines.map((l) => ({ mz: l.mz, poly: Boolean(l.poly), w: Math.pow(l.cps, 0.4) }));
  const total = species.reduce((s, sp) => s + sp.w, 0);
  let acc = 0;
  speciesCdf = species.map((sp) => (acc += sp.w / total));
  // spectrum: log10 cps over the full m/z range
  const { x0, x1, z0, z1 } = DATA.plot;
  const [m0, m1] = DATA.limits.mz;
  let d = "";
  const n = 1360;
  for (let i = 0; i <= n; i++) {
    const mz = m0 + ((m1 - m0) * i) / n;
    const x = x0 + ((x1 - x0) * i) / n;
    d += (i ? "L" : "M") + x.toFixed(2) + " " + (-(z0 + (z1 - z0) * logOf(result.signal(mz)))).toFixed(2);
  }
  partOf("trace").setAttribute("d", d);
  partOf("phase").textContent = params.mode === "ked" ? "KED He" : "STD";
  modeEl.setAttribute("aria-pressed", params.mode === "ked" ? "true" : "false");
  modeEl.dataset.state = params.mode;
  modeEl.setAttribute("aria-label", params.mode === "ked" ? "Cell mode: helium KED. Press for standard mode" : "Cell mode: standard. Press for helium KED");
  for (const key of ["rf", "neb"]) {
    const text = key === "rf" ? `${params.rf} W` : `${params.neb.toFixed(2)} L/min`;
    if (Number(inputs[key].value) !== params[key]) inputs[key].value = params[key];
    inputs[key].setAttribute("aria-valuetext", key === "rf" ? `${params.rf} watts` : `${params.neb.toFixed(2)} litres per minute`);
    outputs[key].textContent = text;
  }
  noteEl.textContent = `T ${Math.round(result.T)} K · aerosol ${Math.round(result.eff * 100)} % · quad V ${Math.round(quadRF(params.mz).V)} V, U ${Math.round(quadRF(params.mz).U)} V`;
  stage.setAttribute("aria-valuenow", String(params.mz));
  stage.setAttribute("aria-valuetext", describe());
}
function describe() {
  const el = elementAt(params.mz);
  const poly = polyAt(params.mz);
  const cps = result.cpsAt(params.mz);
  return `m/z ${params.mz}${el ? `, ${el}` : ""}${poly && params.mode === "std" ? ` under ${poly.sym}` : ""}, ${fmtCps(cps)} counts per second, ${params.mode === "ked" ? "helium KED" : "standard"} mode, plasma ${Math.round(result.T)} kelvin`;
}
function axisTicks() {
  const { x0, x1, z0 } = DATA.plot;
  const [m0, m1] = DATA.limits.mz;
  let d = "";
  for (let m = Math.ceil(m0 / 10) * 10; m <= m1; m += 10) {
    const x = x0 + ((x1 - x0) * (m - m0)) / (m1 - m0);
    d += `M${x.toFixed(2)} ${(-z0).toFixed(2)}v${m % 50 ? 1.2 : 2.2}`;
  }
  partOf("ticks").setAttribute("d", d);
  const reveal = partOf("reveal");
  reveal.setAttribute("width", String(DATA.screen.x1 - DATA.screen.x0));
}

// ---------------------------------------------------------------- ion packets
// each packet: species, axial position, and the uniform draws that decide its fate in the cell and the quadrupole
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const PACKETS = 150;
const [B0, B1] = [DATA.start, DATA.det];
const packets = Array.from({ length: PACKETS }, (_, i) => spawn(B0 + ((B1 - B0) * i) / PACKETS));
function pick() {
  const u = rand();
  const i = speciesCdf.findIndex((c) => c >= u);
  return species[i < 0 ? species.length - 1 : i];
}
function spawn(x) {
  return { x, sp: null, uCell: rand(), uQuad: rand(), a: rand() * Math.PI * 2, cellDecided: false, cellOut: false, quadOut: null, dead: false };
}
function cellPass(sp) {
  return params.mode === "ked" ? (sp.poly ? polyFactor("ked") : cellFactor("ked", sp.mz)) : 1;
}
function stepPackets(dt) {
  for (const p of packets) {
    if (!p.sp) p.sp = pick();
    p.x += DATA.speed * dt;
    if (p.x > DATA.cell[0] && !p.cellDecided) { p.cellDecided = true; p.cellOut = p.uCell > cellPass(p.sp); }
    if (p.x > DATA.quad[0] && p.quadOut === null) p.quadOut = p.uQuad > transmit(shownMz.x, p.sp.mz);
    if (p.x > B1 || (p.dead && p.x > DATA.cell[0])) Object.assign(p, spawn(B0 + (p.x > B1 ? p.x - B1 : 0)));
  }
}
// where a packet is drawn: off-axis offset (world) and size (0..1)
function poseOf(p) {
  let r = 0;
  let size = 1;
  const [c0, c1] = DATA.cell;
  const [q0, q1, qr] = DATA.quad;
  if (p.cellOut && p.x > c0) {
    const t = smoothstep(c0, c0 + (c1 - c0) * 0.8, p.x);
    r = 3.4 * t;
    size = 1 - t;
  }
  if (p.quadOut && p.x > q0) {
    const t = smoothstep(q0, q0 + (q1 - q0) * 0.55, p.x);
    r = Math.max(r, qr * t);
    size = Math.min(size, 1 - smoothstep(0.75, 1, t));
  }
  if (size <= 0.02) p.dead = true;
  return { r, size };
}
const DOT = 1.05;
const beamEls = DATA.beam.map((_, i) => partOf(`beam${i}`));
function drawPackets() {
  const out = DATA.beam.map(() => "");
  for (const p of packets) {
    if (!p.sp || p.dead) continue;
    const seg = DATA.beam.findIndex(([x0, x1]) => p.x >= x0 && p.x <= x1);
    if (seg < 0) continue;
    const { r, size } = poseOf(p);
    if (size <= 0.02) continue;
    const [sx, sy] = iso([p.x, DATA.ax.y + r * Math.cos(p.a), DATA.ax.z + r * Math.sin(p.a)], P);
    const rr = (DOT * size * (p.sp.poly ? 0.8 : 1)).toFixed(2);
    out[seg] += `M${(sx - rr).toFixed(2)} ${sy.toFixed(2)}a${rr} ${rr} 0 1 0 ${(2 * rr).toFixed(2)} 0a${rr} ${rr} 0 1 0 ${(-2 * rr).toFixed(2)} 0`;
  }
  out.forEach((d, i) => beamEls[i].setAttribute("d", d));
}

// ---------------------------------------------------------------- pump rollers, spectrum pen and cursor, readout
const rollersEl = partOf("rollers");
let rotor = 0;
function rollersD(theta) {
  const { o, u, v, r, roller, n } = DATA.rotor;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = theta + (i * Math.PI * 2) / n;
    const c = [0, 1, 2].map((j) => o[j] + r * (u[j] * Math.cos(a) + v[j] * Math.sin(a)));
    const pts = [];
    for (let s = 0; s < 14; s++) {
      const b = (s / 14) * Math.PI * 2;
      pts.push(iso([0, 1, 2].map((j) => c[j] + roller * (u[j] * Math.cos(b) + v[j] * Math.sin(b))), P));
    }
    d += pathOf(pts, true);
  }
  return d;
}
const penEl = partOf("pen");
const cursorEl = partOf("gradient");
const clockEl = partOf("clock");
let lastText = "";
function draw() {
  const { x0, x1, z0, z1 } = DATA.plot;
  const [m0, m1] = DATA.limits.mz;
  const mz = shownMz.x;
  const px = x0 + ((x1 - x0) * (mz - m0)) / (m1 - m0);
  const cps = result.signal(mz);
  penEl.setAttribute("cx", px.toFixed(2));
  penEl.setAttribute("cy", (-(z0 + (z1 - z0) * logOf(cps))).toFixed(2));
  cursorEl.setAttribute("d", `M${px.toFixed(2)} ${(-z0).toFixed(2)}V${(-z1).toFixed(2)}`);
  const nominal = Math.round(mz);
  clockEl.textContent = `m/z ${nominal}`;
  rollersEl.setAttribute("d", rollersD(rotor));
  drawPackets();
  // readout: the swept mass, its counts and the plasma state, all from the same instant of the model
  const el = elementAt(nominal);
  const ion = el ? result.ions.find((i) => i.sym === el).f : null;
  const text = `m/z ${nominal}${el ? ` ${el}` : ""} · ${fmtCps(result.cpsAt(nominal))} cps · ${Math.round(result.T)} K${ion !== null ? ` · ${Math.round(ion * 100)} % ion` : ""} · ${result.pressures[1].torr.toFixed(1)} Torr`;
  if (text !== lastText) { readoutEl.textContent = text; lastText = text; }
}

// ---------------------------------------------------------------- the plasma: a WebGL volume in the figure's own camera
// A toroidal fireball inside the load coil with a cooler central channel punched by the nebulizer gas, and a tail out of
// the mouth to the sampler tip. Brightness follows the model's ionisation temperature, the tail length the RF power, the
// channel width the nebulizer flow. Dark: premultiplied light, screen-blended. Light: ink solved from a paper ramp.
const LIGHT = stage.closest("[data-theme]")?.getAttribute("data-theme") === "light" ? 1 : 0;
const PLM = DATA.plasma;
const f1 = (v) => Number(v).toFixed(4);
const PLASMA_FRAG = `
  uniform float uHeat;
  uniform float uLen;
  uniform float uChan;
  uniform float uFirst;
  uniform float uLight;
  const float X0=${f1(PLM.x0)};
  const float X1=${f1(PLM.x1)};
  const float XM=${f1(PLM.mouth)};
  const float RIN=${f1(PLM.rIn)};
  const float AY=${f1(DATA.ax.y)};
  const float AZ=${f1(DATA.ax.z)};
  const float CA=${f1(PLM.A)};
  const float CP=${f1(PLM.p)};
  const float CQ=${f1(PLM.q)};
  const vec3 BODY=vec3(.62,.46,1.);
  const vec3 CORE=vec3(1.,.97,1.);
  const vec3 PAPER_TINT=vec3(.9,.86,1.);
  const vec3 PAPER_BODY=vec3(.46,.3,.9);
  const vec3 PAPER_RIM=vec3(.6,.38,.98);
  const vec3 PAPER_CORE=vec3(.97,.95,1.);
  // envelope radius of the plasma along the axis, the same curve the SVG plasma is turned from
  float envR(float s){float u=clamp(s,.0005,.9995);return CA*pow(u,CP)*pow(1.-u,CQ);}
  float emission(vec3 p){
  float s=(p.x-X0)/(X1-X0);
  vec2 q=p.yz-vec2(AY,AZ);
  float rho=length(q);
  float R=envR(s);
  // inside the quartz the plasma stops short of the wall; beyond the mouth the envelope alone bounds it
  float wall=mix(1.-smoothstep(RIN-1.6,RIN-.25,rho),1.,smoothstep(XM-1.,XM+1.,p.x));
  float inside=(1.-smoothstep(R*.62,R*1.02,rho))*window(s,0.,1.,.04)*wall;
  // fireball: a torus at about half the envelope radius, centred inside the coil, with a cooler central channel
  float ball=exp(-pow((s-.34)/.24,2.))*smoothstep(0.,.22,s);
  float torus=exp(-pow((rho-.46*R)/(.42*R+.4),2.));
  float chan=1.-.72*exp(-pow(rho/uChan,2.))*smoothstep(.05,.3,s);
  // tail: weaker, narrowing toward the sampler tip, shortened at low power
  float tailEnd=mix(.95,1.04,uLen);
  float Rt=mix(3.,1.7,smoothstep(.74,1.,s));
  float tail=smoothstep(.42,.62,s)*(1.-smoothstep(tailEnd-.1,tailEnd,s))*exp(-pow(rho/Rt,2.))*(1.-smoothstep(Rt*1.1,Rt*1.7,rho))*wall*window(s,0.,1.,.03)*1.2;
  float flick=.9+.1*noise3(vec3(p.x*.35-uTime*3.1,q*.4));
  // on paper the body is weighted toward the axis (a torus seen through reads as an outline there)
  float axial=exp(-pow(rho/(.52*R+.3),2.))*(1.-.3*exp(-pow(rho/uChan,2.))*smoothstep(.05,.3,s));
  float body=mix(torus*chan*1.25,axial*1.1,uLight);
  return inside*ball*body+tail*flick;
  }
  vec4 inkFor(vec3 seen,float cover){vec3 absorbed=1.-seen;float a=max(max(absorbed.r,max(absorbed.g,absorbed.b)),cover);return vec4(vec3(a)-absorbed,a);}
  void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec3 V=towardViewer();
  vec3 p0=rayOf(vb);
  // the ray's stretch within a bounding cylinder round the axis (radius 9.4 ≥ every envelope radius)
  vec2 q0=p0.yz-vec2(AY,AZ);
  vec2 d=V.yz;
  float a=dot(d,d);
  float b=dot(q0,d);
  float c=dot(q0,q0)-9.4*9.4;
  float disc=b*b-a*c;
  float E=0.;
  if(disc>0.){
    float h=sqrt(disc);
    float t0=(-b-h)/a;
    float t1=(-b+h)/a;
    float dt=(t1-t0)/28.;
    float jit=hash12(gl_FragCoord.xy+fract(uTime*.37)*41.);
    for(int i=0;i<28;i++){
      vec3 p=p0+(t0+(float(i)+jit)*dt)*V;
      E+=emission(p)*dt;
    }
  }
  float e=E*uHeat*.22;
  vec3 dark=tonemap(BODY*e*1.6+CORE*e*e*1.4,1.15);
  float m=max(dark.r,max(dark.g,dark.b));
  vec4 darkOut=vec4(dark,m);
  float k=1.-exp(-2.3*e);
  vec3 seen=mix(vec3(1.),PAPER_TINT,smoothstep(.0,.14,k));
  seen=mix(seen,PAPER_RIM,smoothstep(.1,.32,k));
  seen=mix(seen,PAPER_BODY,smoothstep(.3,.55,k));
  seen=mix(seen,PAPER_CORE,smoothstep(.78,.97,k));
  vec4 lightOut=inkFor(seen,.94*smoothstep(.72,.95,k));
  lightOut*=smoothstep(0.,.02,k);
  vec4 col=mix(darkOut,lightOut,uLight)*uFirst;
  col.rgb=min(col.rgb,vec3(col.a));
  float n=(hash12(gl_FragCoord.xy+fract(uTime*.61)*91.)+hash12(gl_FragCoord.yx*1.37+fract(uTime*.37)*57.)-1.)/255.;
  col=max(col+n*smoothstep(0.,1.5/255.,col.a),0.);
  col.rgb=min(col.rgb,vec3(col.a));
  gl_FragColor=col;
}`;
const plasmaLayer = glLayer({
  canvas: stage.querySelector(".ic-gl"),
  fragment: PLASMA_FRAG,
  view: DATA.view,
  camera: DATA.camera,
  uniforms: ["uHeat", "uLen", "uChan", "uFirst"],
  fixed: { uLight: LIGHT },
});
if (plasmaLayer) stage.setAttribute("data-gl", "");
const glow = { heat: { x: 0, v: 0 }, len: { x: 0.5, v: 0 }, chan: { x: 1.8, v: 0 }, clock: 0 };
// targets from the model: brightness from the ionisation temperature, tail from RF power, channel from nebulizer flow
const plasmaTargets = () => ({
  heat: 0.35 + 1.05 * smoothstep(6600, 8200, result.T),
  len: (params.rf - DATA.limits.rf[0]) / (DATA.limits.rf[1] - DATA.limits.rf[0]),
  chan: 1.0 + 2.2 * ((params.neb - DATA.limits.neb[0]) / (DATA.limits.neb[1] - DATA.limits.neb[0])),
});
function paintPlasma(dt, calm) {
  if (!plasmaLayer) return;
  const t = plasmaTargets();
  settle(glow.heat, t.heat, dt, 0.5, calm);
  settle(glow.len, t.len, dt, 0.6, calm);
  settle(glow.chan, t.chan, dt, 0.6, calm);
  glow.clock += dt;
  const first = calm ? 1 : smooth(0.1, 1.0, glow.clock);
  plasmaLayer.draw({ uHeat: glow.heat.x, uLen: glow.len.x, uChan: glow.chan.x, uFirst: first }, calm ? 0.8 : glow.clock);
}
// the SVG fallback glow follows the same temperature
const plasmaSvg = partOf("plasma-svg");
function paintFallback() {
  plasmaSvg.style.setProperty("--ic-heat", (0.35 + 0.65 * smoothstep(6600, 8200, result.T)).toFixed(3));
}

// ---------------------------------------------------------------- loop (rAF, reduced motion, tour, keys, live region: live-core)
const TOUR = [
  { mz: 208, mode: "std", rf: 1350 },
  { mz: 56, mode: "std" },
  { mz: 56, mode: "ked" },
  { mz: 80, mode: "ked" },
  { mz: 80, mode: "std" },
  { mz: 114, mode: "std" },
  { mz: 202, mode: "std", rf: 1550 },
  { mz: 75, mode: "ked", rf: 1550 },
  { mz: 75, mode: "ked", rf: 1150 },
  { mz: 63, mode: "ked", rf: 1350 },
];
const DWELL = 3.4;
let tourClock = 0;
function advance(dt) {
  tourClock += dt;
  if (tourClock > DWELL) {
    tourClock = 0;
    const stop = live.nextStop();
    if (stop) { Object.assign(params, stop); prepare(); paintFallback(); }
  }
  settle(shownMz, params.mz, dt, 0.25);
  rotor = (rotor + Math.PI * 2 * DATA.rps * dt) % (Math.PI * 2);
  stepPackets(dt);
  draw();
  paintPlasma(dt, false);
}
function stillFrame() {
  // reduced motion: one representative frame, the quadrupole parked on the selected mass and the beam laid out once
  shownMz.x = params.mz;
  shownMz.v = 0;
  seed = 7;
  packets.forEach((p, i) => Object.assign(p, spawn(B0 + ((B1 - B0) * (i + 0.5)) / PACKETS)));
  for (const p of packets) {
    p.sp = pick();
    p.cellDecided = p.x > DATA.cell[0];
    p.cellOut = p.cellDecided && p.uCell > cellPass(p.sp);
    p.quadOut = p.x > DATA.quad[0] ? p.uQuad > transmit(params.mz, p.sp.mz) : null;
  }
  draw();
  if (live.media.matches) paintPlasma(1 / 60, true);
}
function retune(next) {
  if (next.mz !== undefined) params.mz = Math.round(clamp(next.mz, DATA.limits.mz[0], DATA.limits.mz[1]));
  if (next.rf !== undefined) params.rf = Math.round(clamp(next.rf, DATA.limits.rf[0], DATA.limits.rf[1]) / 10) * 10;
  if (next.neb !== undefined) params.neb = Math.round(clamp(next.neb, DATA.limits.neb[0], DATA.limits.neb[1]) * 100) / 100;
  if (next.mode !== undefined) params.mode = next.mode;
  prepare();
  paintFallback();
}
const live = liveStage(stage, {
  step: advance,
  rest: stillFrame,
  apply: retune,
  say: () => `${describe()}.`,
  key: { value: () => params.mz, step: 1, big: 10, min: DATA.limits.mz[0], max: DATA.limits.mz[1], to: (mz) => ({ mz }) },
  tour: TOUR,
});
inputs.rf.addEventListener("input", () => live.steer({ rf: Number(inputs.rf.value) }));
inputs.neb.addEventListener("input", () => live.steer({ neb: Number(inputs.neb.value) }));
modeEl.addEventListener("click", () => live.steer({ mode: params.mode === "ked" ? "std" : "ked" }));
prepare();
paintFallback();
axisTicks();
live.begin(() => { stillFrame(); draw(); });
