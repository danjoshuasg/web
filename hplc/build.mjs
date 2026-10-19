// HPLC on a bench: an isometric Hero figure built with the anatomy kit.
// node hplc/build.mjs [--light] [--audit]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../kit/tube.mjs";
import * as A from "../kit/audit.mjs";
import { kitScript } from "../scripts/inline-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- world plan
const W = 760;
const H = 480;
const AZIMUTH = 55;
const ELEVATION = 30;

const BENCH = { x: -216, y: -62, w: 424, d: 120, r: 8 };
const BENCH_H = 10;
const FOOT_H = 5;

const FRONT = 36; // front face of the pump and of the right stack
const TY = 41.5; // plane of the front plumbing
const LS = { x: -200, y: -50, w: 110, d: 86, r: 3 }; // left stack: degasser, pump, solvent tray
const DEGAS = { ...LS, d: 94 }; // the degasser is deeper, so its inlet and outlet ports stand in front of the pump
const Z_DEGAS = [0, 26];
const Z_PUMP = [26, 80];
const TRAY = { x: -198, y: -48, w: 106, d: 66, r: 3 };
const Z_TRAY = 80;
const RS = { x: -58, y: -50, w: 114, d: 86, r: 3 }; // right stack: detector, column oven, autosampler
const Z_DET = [0, 44];
const Z_OVEN = [44, 94];
const Z_ALS = [94, 138];
const DECK = Z_ALS[1];

// pump channels: an eccentric cam drives a piston into each head
const ECC = 1.6; // eccentric throw (world units); stroke 2·ECC
const CAM_R = 5.5;
const CH = [
  { id: "A", xc: -178, xh: -158 },
  { id: "B", xc: -128, xh: -110 },
].map((c) => ({ ...c, xv: c.xh + 7 }));
const ZC = 52; // cam and piston axis height
const HEAD = { w: 14, z0: 44, z1: 60 };
const PUMP_STROKE_UL = 20; // assumed piston displacement per stroke (not in model.mjs): sets piston frequency only

const DAMPER = [-74, TY];
const VALVE = { x: -40, y: 14, r: 9.5, z: DECK };
const PORT_R = 6.6;
const PORT_ANG = [25, 85, 145, 205, 265, 325];
const portAt = (deg, z = VALVE.z + 9.2) => [VALVE.x + PORT_R * Math.cos(deg * DEG), VALVE.y + PORT_R * Math.sin(deg * DEG), z];
const P205 = portAt(205);
const P265 = portAt(265);
const COL_Y = Math.round(P205[1] * 10) / 10;
const COL_Z = 68;
const COL = { x0: -35, len: 70, r: 3.4, nut: 4.2, nutL: 6 };
const WIN = { s0: 4, s1: 66, half: 40 * DEG, frit: 2.4 };
const VIALS = [-2, 10, 22, 34].flatMap((x) => [-14, 0].map((y) => [x, y]));
const SEAT = [-20, 0];
const ARM_Y = 0;
const WASTE = [104, COL_Y + 2.6];
const PANEL = { x: 128, x1: 196, y: -4, y1: 4, z0: 21, z1: 80 };
const SCREEN = { x0: 134, x1: 190, z0: 34, z1: 74, r: 2.4 };

const P = k.fitProjection(
  [...k.boxCorners(BENCH, -BENCH_H - FOOT_H, 0), [-186, -15, 168], [VALVE.x, 0, 182], [52, 0, 182], [PANEL.x1, PANEL.y1, PANEL.z1]],
  W,
  H,
  { pad: 34, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const path3 = (pts, closed = false) => k.pathOf(pts.map(at), closed);
const rounded = (u0, v0, u1, v1, r, map, steps = 4) => path3(k.roundedPlan({ x: u0, y: v0, w: u1 - u0, d: v1 - v0, r }, steps).map(([u, v]) => map(u, v)), true);
const onFront = (y) => (u, v) => [u, y, v]; // u = x, v = z
const onRight = (x) => (u, v) => [x, u, v]; // u = y, v = z
const onTop = (z) => (u, v) => [u, v, z];

// ---------------------------------------------------------------- recorder
const R = A.recorder(P);
const record = R.solid;
function put(name, centre, svg, shapes = [], { bias = 0 } = {}) {
  const id = R.nameFor(name);
  R.put({ at: centre, bias, svg, name: id, shapes });
  return id;
}
function box(name, plan, z, h, { tone = "mid", steps = 3, bevel = 0.5, extra = "", inner = "", lit = false, crease, bias = 0, owner } = {}) {
  const id = R.nameFor(name);
  const shape = record(A.slab(plan, z, h, { name: id, owner }, steps));
  R.put({ at: [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], bias, name: id, svg: S(k.slabOf(plan, z, h, P, steps, bevel), { tone, inner, lit, crease }) + extra, shapes: [shape] });
  return shape;
}
function cyl(name, cx, cy, r, z, h, { tone = "mid", steps, bevel = 0, extra = "", inner = "", crease, bias = 0, owner } = {}) {
  const id = R.nameFor(name);
  const shape = record(A.cylinder(cx, cy, r, z, h, { name: id, owner }));
  R.put({ at: [cx, cy, z + h / 2], bias, name: id, svg: S(k.cylinder(cx, cy, r, z, h, P, steps ?? G.stepsFor(r, 20, 72, KS), bevel), { tone, inner, crease }) + extra, shapes: [shape] });
  return shape;
}
function discAt(name, F, s0, s1, r, { tone = "mid", extra = "", inner = "", bias = 0, owner, bevel = 0, lit = false } = {}) {
  const id = R.nameFor(name);
  const shape = record(A.disc(F, s0, s1, r, { name: id, owner }));
  R.put({ at: G.pointOf(F, (s0 + s1) / 2, 0, 0), bias, name: id, svg: S(G.disc(s0, s1, r, F, P, { bevel }), { tone, inner, lit }) + extra, shapes: [shape] });
  return shape;
}
function ballAt(name, c, r, { tone = "mid", owner } = {}) {
  const id = R.nameFor(name);
  const shape = record(A.ball(c, r, { name: id, owner }));
  R.put({ at: c, name: id, svg: S(G.sphereOf(c, r, P, { steps: G.stepsFor(r, 24) }), { tone }), shapes: [shape] });
  return shape;
}

// pipes: fillet the legs, gap the end fittings, chunk and record every run
const ROUTES = [];
function tubeItems(name, route, r, { tone = "hi", gaps = [], rims, limp = false, maxLength = 18, spacing = 1, caps = true, owner, touch } = {}) {
  const id = R.nameFor(name);
  R.route(id, route, r, { owner: owner ?? id, gaps, rims, limp, touch });
  tubePieces(route, r, P, { maxLength, spacing, gaps, caps }).forEach((part, index) =>
    R.put({ at: part.mid, name: `${id}:${index}`, route: id, chunk: index, svg: tubeSvg(part, { tone }), shapes: [A.tube(part.points, part.radii)] }),
  );
  return id;
}
function pipe(name, control, r, { bend = 3.4, tone = "hi", ends = ["nut", "nut"], nutR = 1.6, maxLength = 18 } = {}) {
  const line = G.fillet(control, Math.max(r * bend, 3), 12, { P, tube: r });
  const total = G.pathLength(line);
  const collars = [];
  [[0, -1], [total, 1]].forEach(([along, sign], index) => {
    if (ends[index] !== "nut") return;
    const thick = 1.6;
    const tangent = G.tangentAlong(line, along);
    collars.push({ centre: G.add3(G.pointAlong(line, along), G.mul3(tangent, (-sign * thick) / 2)), tangent, thick, gap: sign < 0 ? [0, thick] : [total - thick, total] });
  });
  const id = tubeItems(name, line, r, { tone, gaps: collars.map((c) => c.gap), rims: ends.map((e) => (e === "nut" ? nutR : r)), maxLength });
  for (const c of collars) {
    const F = G.frameAlong(c.centre, c.tangent);
    discAt(`${id}.nut`, F, -c.thick / 2, c.thick / 2, nutR, { tone: "mid", owner: id, bevel: 0.2 });
  }
  ROUTES.push({ id, line, r });
  return line;
}
// rim of a tube of radius a meeting a ball of radius b at c, toward direction d
const onBall = (c, b, a, d) => G.add3(c, G.mul3(G.unit3(d), Math.sqrt(b * b - a * a)));

// ---------------------------------------------------------------- bench (back layer, ground)
const back = [];
back.push(`<path class="iso-halo" d="${k.haloOf(BENCH, -BENCH_H - FOOT_H, BENCH_H, P)}"/>`);
const feet = k.corners(BENCH, 20).concat([[BENCH.x + BENCH.w / 2, BENCH.y + 20], [BENCH.x + BENCH.w / 2, BENCH.y + BENCH.d - 20]]);
for (const [x, y] of feet.sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P))) {
  back.push(S(k.cylinder(x, y, 8, -BENCH_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 6, -BENCH_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
}
back.push(S(k.slabOf(BENCH, -BENCH_H, BENCH_H, P, 8, 1.6), { tone: "mid" }));
record(A.slab(BENCH, -BENCH_H, BENCH_H, { name: "stand.bench" }, 8));
back.push(L(k.planOutline(k.insetPlan(BENCH, 5), 0, P), { tone: "lo" }));
const benchScrews = k.corners(BENCH, 10);
back.push(L(benchScrews.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
back.push(D(benchScrews.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
{
  const strip = { x: -58, y: BENCH.y + BENCH.d - 11, w: 236, d: 7, r: 1 };
  back.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  back.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  back.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  const label = { x: -200, y: BENCH.y + BENCH.d - 12, w: 40, d: 9, r: 1.2 };
  back.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  back.push(L(k.planOutline(k.insetPlan(label, 1.4), 0.8, P, 3), { tone: "faint" }));
  back.push(L([24, 16].map((w, i) => k.lineOnTop([label.x + 4, label.y + 3.6 + i * 3], [label.x + 4 + w, label.y + 3.6 + i * 3], 0.8, P)).join(""), { tone: "lo", free: true }));
  back.push(D([at([label.x + label.w - 3.4, label.y + label.d / 2, 0.8])], { size: 0.45 }));
}
// soft shadows under the stacks and the free-standing parts
for (const [plan, h] of [[DEGAS, 8], [RS, 8], [{ x: WASTE[0] - 12, y: WASTE[1] - 12, w: 24, d: 24, r: 12 }, 4], [{ x: 140, y: -18, w: 44, d: 32, r: 3 }, 3], [{ x: DAMPER[0] - 8, y: DAMPER[1] - 8, w: 16, d: 16, r: 8 }, 3]])
  back.push(`<path class="iso-halo" d="${k.haloOf(plan, 0, h, P)}" style="opacity:calc(var(--anatomy-halo-opacity)*.7)"/>`);

// ---------------------------------------------------------------- left stack: degasser
{
  const [z0, z1] = Z_DEGAS;
  box("degasser.plinth", k.insetPlan(DEGAS, 2), z0, 2, { tone: "lo", crease: "none" });
  const front = DEGAS.y + DEGAS.d;
  const face = [
    rounded(-194, 6, -150, 20, 2, onFront(front)),
    rounded(-144, 6, -100, 20, 2, onFront(front)),
  ].join("");
  const vents = Array.from({ length: 6 }, (_, i) => rounded(-46 + i * 4.4, 6, -44.6 + i * 4.4, 20, 0.7, onRight(DEGAS.x + DEGAS.w))).join("");
  box("degasser.case", DEGAS, z0 + 2, z1 - z0 - 2, {
    tone: "mid",
    bevel: 0.8,
    inner: L(k.sideSeam(DEGAS, z1 - 3, P, 3), { tone: "faint" }),
    extra: L(face, { tone: "faint" }) + L(coilsD(), { tone: "lo" }) + L(vents, { tone: "faint" }) + D([at([-97, front, 23]), at([-197, front, 23])], { size: 0.45 }) + D([at([-147, front, 13])], { size: 0.7, tone: "hi" }),
  });
  // vacuum chamber windows: two coiled membranes seen through the front
  function coilsD() {
    return [[-192, -152], [-142, -102]].map(([x0]) => Array.from({ length: 7 }, (_, i) => rounded(x0 + 2 + i * 5.4, 8.5, x0 + 5.6 + i * 5.4, 17.5, 1.6, onFront(front))).join("")).join("");
  }
}
const DEG_PORTS = { inA: [-190, TY], inB: [-195, TY], outA: [CH[0].xv, TY], outB: [CH[1].xv, TY] };
for (const [name, [x, y]] of Object.entries(DEG_PORTS)) cyl(`degasser.port-${name}`, x, y, 2.2, Z_DEGAS[1], 2, { tone: "mid", extra: L(k.ring(x, y, 1.1, Z_DEGAS[1] + 2, P, 12), { tone: "faint" }) });

// ---------------------------------------------------------------- left stack: binary pump
{
  const [z0, z1] = Z_PUMP;
  const slots = Array.from({ length: 8 }, (_, i) => rounded(-44 + i * 4.4, z0 + 30, -42.6 + i * 4.4, z0 + 46, 0.7, onRight(LS.x + LS.w))).join("");
  box("pump.case", LS, z0, z1 - z0, {
    tone: "mid",
    bevel: 0.8,
    inner: L(k.sideSeam(LS, z1 - 4, P, 3) + k.sideSeam(LS, z0 + 4, P, 3), { tone: "faint" }),
    extra: L(slots, { tone: "faint" }) + D([at([-97, FRONT, z0 + 22])], { size: 0.8, tone: "hi" }) + D([at([-197, FRONT, z1 - 2]), at([-93, FRONT, z1 - 2]), at([-197, FRONT, z0 + 2]), at([-93, FRONT, z0 + 2])], { size: 0.45 }),
  });
  // drive cover seam round the pump heads, with its four screws
  put("pump.cover", [-145, FRONT, 53], L(rounded(-196, z0 + 6, -92, z1 - 8, 3, onFront(FRONT)), { tone: "faint" }) + D([[-193, z0 + 9], [-95, z0 + 9], [-193, z1 - 11], [-95, z1 - 11]].map(([x, z]) => at([x, FRONT, z])), { size: 0.45, tone: "mid" }), [record(A.box([-196, FRONT, z0 + 6], [-92, FRONT + 0.05, z1 - 8], { name: "pump.cover" }))], { bias: 0.2 });
  box("pump.model-plate", { x: -186, y: FRONT, w: 22, d: 0.6, r: 0.2 }, z1 - 7, 5, {
    tone: "lo",
    steps: 2,
    bevel: 0,
    crease: "none",
    extra: L([14, 9].map((w, i) => k.segment([-184, FRONT + 0.6, z1 - 3.6 - i * 2], [-184 + w, FRONT + 0.6, z1 - 3.6 - i * 2], P)).join(""), { tone: "faint", free: true }),
  });
  // a rating plate and a status LED low on the right of the front
  box("pump.plate", { x: -104, y: FRONT, w: 12, d: 0.6, r: 0.2 }, z0 + 8, 9, {
    tone: "lo",
    steps: 2,
    bevel: 0,
    crease: "none",
    extra: L([8, 6, 7].map((w, i) => k.segment([-102, FRONT + 0.6, z0 + 14.6 - i * 2.4], [-102 + w, FRONT + 0.6, z0 + 14.6 - i * 2.4], P)).join(""), { tone: "faint", free: true }),
  });
}
const PISTON = [];
for (const c of CH) {
  const camF = G.frameAlong([c.xc, FRONT, ZC], [0, 1, 0]);
  discAt(`pump.cam-housing-${c.id}`, camF, 0, 3, 9, {
    tone: "mid",
    extra: D(G.dotsOf(camF, 3, 7.6, 6, P, { all: true, phase: 0.3 }), { size: 0.45 }),
  });
  // eccentric: built at θ = 0 (centre + ECC along x), moved in the page
  const eccF = G.frameAlong([c.xc + ECC, FRONT, ZC], [0, 1, 0]);
  const eccId = R.nameFor(`pump.eccentric-${c.id}`);
  const eccShape = record(A.disc(eccF, 3, 8, CAM_R, { name: eccId }));
  R.put({ at: G.pointOf(eccF, 5.5, 0, 0), name: eccId, shapes: [eccShape], svg: `<g data-part="cam${c.id}">${S(G.disc(3, 8, CAM_R, eccF, P), { tone: "hi" })}${L(G.circleOf(eccF, 8, 1.4, P, 16), { tone: "lo" })}${D([at(G.pointOf(eccF, 8, 0, 0))], { size: 0.5, tone: "mid" })}</g>` });
  // head block with gland nut, inlet and outlet check valves
  const headPlan = { x: c.xh, y: FRONT, w: HEAD.w, d: 2 * (TY - FRONT), r: 1.2 };
  box(`pump.head-${c.id}`, headPlan, HEAD.z0, HEAD.z1 - HEAD.z0, {
    tone: "hi",
    bevel: 0.6,
    crease: "lo",
    extra: D([[c.xh + 2.4, HEAD.z0 + 2.4], [c.xh + HEAD.w - 2.4, HEAD.z0 + 2.4], [c.xh + 2.4, HEAD.z1 - 2.4], [c.xh + HEAD.w - 2.4, HEAD.z1 - 2.4]].map(([x, z]) => at([x, headPlan.y + headPlan.d, z])), { size: 0.5, tone: "mid" }),
  });
  const rodF = G.frameAlong([c.xh, TY, ZC], [-1, 0, 0]);
  discAt(`pump.gland-${c.id}`, rodF, 0, 2, 2.6, { tone: "mid" });
  cyl(`pump.inlet-valve-${c.id}`, c.xv, TY, 2.4, HEAD.z0 - 7, 7, { tone: "mid", inner: L(k.sideArc(c.xv, TY, 2.4, HEAD.z0 - 3.5, P, 12), { tone: "faint" }) });
  cyl(`pump.outlet-valve-${c.id}`, c.xv, TY, 2.4, HEAD.z1, 7, { tone: "mid", inner: L(k.sideArc(c.xv, TY, 2.4, HEAD.z1 + 3.5, P, 12), { tone: "faint" }) });
  // piston: a rod out of the gland whose tip carries a flat follower riding the eccentric
  const sTip = c.xh - (c.xc + ECC + CAM_R) - 1.6;
  const rod = G.rodOut(rodF, 2, sTip, 1.2, P, { stroke: 2 * ECC });
  const rodId = R.nameFor(`pump.piston-${c.id}`);
  const clipId = `hp-rod-${c.id}`;
  const rodShape = record(A.disc(rodF, 2, sTip, 1.2, { name: rodId }));
  const follower = record(A.disc(rodF, sTip, sTip + 1.6, 2.4, { name: `${rodId}.follower` }));
  R.put({
    at: G.pointOf(rodF, sTip / 2, 0, 0),
    name: rodId,
    shapes: [rodShape, follower],
    svg: `<g data-part="piston${c.id}"><clipPath id="${clipId}"><path data-hold d="${rod.clip}"/></clipPath><g clip-path="url(#${clipId})">${S(rod.paths, { tone: "hi" })}</g>${S(G.disc(sTip, sTip + 1.6, 2.4, rodF, P, { bevel: 0.2 }), { tone: "mid" })}</g>`,
  });
  PISTON.push({ id: c.id, camAt: [c.xc, ZC], screenX: G.sub3(at([-1, 0, 0]), at([0, 0, 0])) });
}
// short feed tubes from the degasser outlets up into the inlet check valves
for (const c of CH) pipe(`pump.feed-${c.id}`, [[c.xv, TY, Z_DEGAS[1] + 2], [c.xv, TY, HEAD.z0 - 7]], 0.9, { tone: "hi" });

// outlets join in a tee above head B, then drop to the pulse damper
const TEE = [CH[1].xv, TY, 76];
const TEE_R = 2.2;
ballAt("pump.tee", TEE, TEE_R, { tone: "hi" });
pipe("pump.out-A", [[CH[0].xv, TY, HEAD.z1 + 7], [CH[0].xv, TY, TEE[2]], onBall(TEE, TEE_R, 0.9, [-1, 0, 0])], 0.9, { ends: ["nut", "none"] });
pipe("pump.out-B", [[CH[1].xv, TY, HEAD.z1 + 7], onBall(TEE, TEE_R, 0.9, [0, 0, -1])], 0.9, { ends: ["nut", "none"] });

// ---------------------------------------------------------------- pulse damper with pressure gauge (in the gap)
const DAMP = { r: 7, z1: 40 };
{
  const [x, y] = DAMPER;
  cyl("damper.foot", x, y, 8.6, 0, 2, { tone: "lo" });
  cyl("damper.can", x, y, DAMP.r, 2, DAMP.z1 - 2, { tone: "mid", inner: L([12, 30].map((z) => k.sideArc(x, y, DAMP.r, z, P, 24)).join(""), { tone: "faint" }) });
  cyl("damper.gauge", x, y, 7.8, DAMP.z1, 4, {
    tone: "hi",
    crease: "lo",
    bevel: 0.6,
    extra: (() => {
      const top = DAMP.z1 + 4;
      const t = k.radialTicks(x, y, 6.2, 28, 7, top, [0.9, 1.8], P, -135 * DEG, 270 * DEG);
      return L(k.ring(x, y, 6.6, top, P, 48), { tone: "lo" }) + L(t.minor, { tone: "lo" }) + L(t.major, { tone: "mid" }) + `<path data-part="gauge" class="iso-line" data-tone="hi" data-free="start" style="stroke-width:.9" d=""/>` + L(k.ring(x, y, 0.9, top, P, 12), { tone: "mid" });
    })(),
  });
}
const GAUGE = { x: DAMPER[0], y: DAMPER[1], z: DAMP.z1 + 4.15, r: 5.4 };
const DAMP_IN_F = G.frameAlong([DAMPER[0] - DAMP.r, TY, 34], [-1, 0, 0]);
discAt("damper.in-boss", DAMP_IN_F, -0.36, 3, 2.2, { tone: "mid" });
const DAMP_OUT_F = G.frameAlong([DAMPER[0], TY - DAMP.r, 20], [0, -1, 0]);
discAt("damper.out-boss", DAMP_OUT_F, -0.36, 3, 2.2, { tone: "mid" });
pipe("pump.to-damper", [onBall(TEE, TEE_R, 0.9, [1, 0, 0]), [-92, TY, TEE[2]], [-92, TY, 34], G.pointOf(DAMP_IN_F, 3, 0, 0)], 0.9, { ends: ["none", "nut"] });

// ---------------------------------------------------------------- left stack: solvent tray and bottles
{
  box("tray.floor", TRAY, Z_TRAY, 2, { tone: "lo", bevel: 0.4, extra: L(k.planOutline(k.insetPlan(TRAY, 6), Z_TRAY + 2, P, 3), { tone: "faint" }) });
  const z = Z_TRAY + 2;
  const h = 7;
  box("tray.wall-back", { x: TRAY.x, y: TRAY.y, w: TRAY.w, d: 2, r: 0.6 }, z, h, { tone: "mid", steps: 2, bevel: 0.3 });
  box("tray.wall-left", { x: TRAY.x, y: TRAY.y + 2, w: 2, d: TRAY.d - 4, r: 0.6 }, z, h, { tone: "mid", steps: 2, bevel: 0.3 });
  box("tray.wall-right", { x: TRAY.x + TRAY.w - 2, y: TRAY.y + 2, w: 2, d: TRAY.d - 4, r: 0.6 }, z, h, { tone: "mid", steps: 2, bevel: 0.3 });
  box("tray.wall-front", { x: TRAY.x, y: TRAY.y + TRAY.d - 2, w: TRAY.w, d: 2, r: 0.6 }, z, h, { tone: "mid", steps: 2, bevel: 0.3, extra: D([at([TRAY.x + 6, TRAY.y + TRAY.d, z + 3.5]), at([TRAY.x + TRAY.w - 6, TRAY.y + TRAY.d, z + 3.5])], { size: 0.4 }) });
}
const BOTTLES = [
  { id: "A", x: -172, y: -15, level: 104, port: DEG_PORTS.inA, lift: 150 },
  { id: "B", x: -120, y: -15, level: 98, port: DEG_PORTS.inB, lift: 172 },
];
const BOT = { r: 14, z0: Z_TRAY + 2, body: 34, shoulder: 10, neck: 6.2, neckH: 3, cap: 8, capH: 8 };
const shoulderR = (s) => BOT.neck + (BOT.r - BOT.neck) * Math.cos((Math.PI / 2) * Math.min(1, Math.max(0, s / BOT.shoulder)));
const shoulderSlope = (s) => -(BOT.r - BOT.neck) * (Math.PI / 2 / BOT.shoulder) * Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, s / BOT.shoulder)));
for (const b of BOTTLES) {
  const zb = BOT.z0;
  const zs = zb + BOT.body;
  cyl(`bottle-${b.id}.body`, b.x, b.y, BOT.r, zb, BOT.body, {
    tone: "mid",
    inner: L(k.sideArc(b.x, b.y, BOT.r, b.level, P, 40), { tone: "lo" }) + L([zb + 8, zb + 20].map((z) => k.sideArc(b.x, b.y, BOT.r, z, P, 40)).join(""), { tone: "faint" }),
  });
  const F = G.frameOf([b.x, b.y, zs], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const prof = Array.from({ length: 21 }, (_, i) => {
    const s = (i / 20) * BOT.shoulder;
    return [s, shoulderR(s), i > 0 && i < 20 ? 1 : 0];
  });
  const id = R.nameFor(`bottle-${b.id}.shoulder`);
  const shape = record(A.solid(F, prof.map(([s, r]) => [s, r]), { name: id, radius: shoulderR }));
  R.put({ at: [b.x, b.y, zs + BOT.shoulder / 2], name: id, shapes: [shape], svg: S(G.solidOf(prof, F, P, { smooth: { slope: shoulderSlope, radius: shoulderR } }), { tone: "mid" }) });
  const zn = zs + BOT.shoulder;
  cyl(`bottle-${b.id}.neck`, b.x, b.y, BOT.neck, zn, BOT.neckH, { tone: "mid" });
  const zc = zn + BOT.neckH;
  cyl(`bottle-${b.id}.cap`, b.x, b.y, BOT.cap, zc, BOT.capH, { tone: "lo", bevel: 0.5, extra: L(k.knurl(b.x, b.y, BOT.cap, zc, zc + BOT.capH, 40, P), { tone: "faint" }) + D([at([b.x + 4.2, b.y - 1.4, zc + BOT.capH])], { size: 0.5, tone: "mid" }) });
  cyl(`bottle-${b.id}.cap-port`, b.x, b.y, 2.2, zc + BOT.capH, 2, { tone: "mid" });
  b.top = [b.x, b.y, zc + BOT.capH + 2];
}
// aspiration lines: up out of each cap, across, and down to the degasser inlets
for (const b of BOTTLES) pipe(`line-${b.id}`, [b.top, [b.x, b.y, b.lift], [b.port[0], b.port[1], b.lift], [b.port[0], b.port[1], Z_DEGAS[1] + 2]], 1.25, { bend: 4, tone: "hi", nutR: 2, maxLength: 16 });

// ---------------------------------------------------------------- right stack: detector
{
  const [z0, z1] = Z_DET;
  box("detector.plinth", k.insetPlan(RS, 2), z0, 2, { tone: "lo", crease: "none" });
  const vents = Array.from({ length: 9 }, (_, i) => rounded(-44 + i * 4.4, 10, -42.6 + i * 4.4, 30, 0.7, onRight(RS.x + RS.w))).join("");
  box("detector.case", RS, z0 + 2, z1 - z0 - 2, {
    tone: "mid",
    bevel: 0.8,
    inner: L(k.sideSeam(RS, z1 - 3, P, 3), { tone: "faint" }),
    extra: L(rounded(-6, 8, 50, 38, 2.4, onFront(FRONT)), { tone: "faint" }) + L(Array.from({ length: 8 }, (_, i) => rounded(27 + i * 2.6, 12, 28.2 + i * 2.6, 22, 0.6, onFront(FRONT))).join(""), { tone: "faint" }) + L(vents, { tone: "faint" }) + D([at([44, FRONT, 32])], { size: 0.8, tone: "hi" }) + D([at([-54, FRONT, 40]), at([52, FRONT, 40])], { size: 0.45 }),
  });
  box("detector.plate", { x: 4, y: FRONT, w: 20, d: 0.6, r: 0.2 }, 12, 9, {
    tone: "lo",
    steps: 2,
    bevel: 0,
    crease: "none",
    extra: L([14, 10, 12].map((w, i) => k.segment([6, FRONT + 0.6, 18.6 - i * 2.4], [6 + w, FRONT + 0.6, 18.6 - i * 2.4], P)).join(""), { tone: "faint", free: true }),
  });
  // deuterium lamp housing on the front, with cooling fins and a retaining ring
  const lampF = G.frameAlong([-26, FRONT, 22], [0, 1, 0]);
  discAt("detector.lamp-housing", lampF, 0, 5, 11, {
    tone: "mid",
    bevel: 0.4,
    extra: L(G.circleOf(lampF, 5, 8.6, P, 48), { tone: "lo" }) + k.fadedSvg(G.ribsOf(lampF, 0.6, 4.4, 11, 30, P, { fade: [0.1, 0.55] }), { tone: "faint" }),
  });
  discAt("detector.lamp-cap", lampF, 5, 7, 6.4, { tone: "hi", extra: D(G.dotsOf(lampF, 7, 4.8, 4, P, { all: true, phase: Math.PI / 4 }), { size: 0.45 }) + L(G.circleOf(lampF, 7, 2.2, P, 20), { tone: "lo" }) });
}
// flow cell block on the detector's right face
const FC = { x: RS.x + RS.w, x1: RS.x + RS.w + 18, y0: COL_Y - 7, y1: COL_Y + 7, z0: 14, z1: 30 };
box("detector.flow-cell", { x: FC.x, y: FC.y0, w: FC.x1 - FC.x, d: FC.y1 - FC.y0, r: 1.2 }, FC.z0, FC.z1 - FC.z0, {
  tone: "hi",
  crease: "lo",
  bevel: 0.6,
  extra: L(k.sideRing([FC.x + 7, FC.y1, 21], 3, "y", P, 28) + k.sideRing([FC.x + 7, FC.y1, 21], 1.5, "y", P, 18), { tone: "lo" }) + D([at([FC.x + 7, FC.y1, 21])], { size: 0.5, tone: "hi" }) + D([[FC.y0 + 2, FC.z0 + 2], [FC.y1 - 2, FC.z0 + 2], [FC.y0 + 2, FC.z1 - 2], [FC.y1 - 2, FC.z1 - 2]].map(([y, z]) => at([FC.x1, y, z])), { size: 0.45 }),
});
const FC_IN = [FC.x + 11, COL_Y, FC.z1];
cyl("detector.cell-in", FC_IN[0], COL_Y, 2, FC.z1, 2, { tone: "mid" });
const FC_OUT_F = G.frameAlong([FC.x1, COL_Y + 2.6, 24.6], [1, 0, 0]);
discAt("detector.cell-out", FC_OUT_F, 0, 2, 2, { tone: "mid" });

// ---------------------------------------------------------------- right stack: column oven (open front)
const OV = { z0: Z_OVEN[0], z1: Z_OVEN[1], wall: 4 };
{
  const { z0, z1, wall } = OV;
  box("oven.floor", RS, z0, wall, { tone: "mid", bevel: 0.6, extra: L(k.planOutline({ x: RS.x + wall + 2, y: RS.y + wall + 2, w: RS.w - 2 * wall - 4, d: RS.d - wall - 4, r: 1.5 }, z0 + wall, P, 3), { tone: "faint" }) });
  box("oven.back", { x: RS.x, y: RS.y, w: RS.w, d: wall, r: 0.8 }, z0 + wall, z1 - z0 - 2 * wall, { tone: "mid", steps: 2, bevel: 0 });
  box("oven.left", { x: RS.x, y: RS.y + wall, w: wall, d: RS.d - wall, r: 0.8 }, z0 + wall, z1 - z0 - 2 * wall, { tone: "mid", steps: 2, bevel: 0 });
  box("oven.right", { x: RS.x + RS.w - wall, y: RS.y + wall, w: wall, d: RS.d - wall, r: 0.8 }, z0 + wall, z1 - z0 - 2 * wall, {
    tone: "mid",
    steps: 2,
    bevel: 0,
    extra: L(Array.from({ length: 5 }, (_, i) => rounded(-40 + i * 4.4, z0 + 12, -38.6 + i * 4.4, z1 - 12, 0.7, onRight(RS.x + RS.w))).join(""), { tone: "faint" }),
  });
  box("oven.top", RS, z1 - wall, wall, { tone: "mid", bevel: 0.6, inner: L(k.sideSeam(RS, z1 - 1.5, P, 3), { tone: "faint" }) });
  // heater plate on the back wall with fins
  const heater = { x: -36, y: RS.y + wall, w: 72, d: 3, r: 0.6 };
  box("oven.heater", heater, z0 + wall + 6, 28, {
    tone: "lo",
    steps: 2,
    bevel: 0,
    extra: L(Array.from({ length: 11 }, (_, i) => k.segment([heater.x + 6 + i * 6, heater.y + 3, z0 + wall + 6], [heater.x + 6 + i * 6, heater.y + 3, z0 + wall + 34], P)).join(""), { tone: "faint" }),
  });
}
// column on two cradles
const COLF = G.frameOf([COL.x0, COL_Y, COL_Z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
for (const s of [14, 56]) {
  const x = COL.x0 + s;
  cyl("oven.post", x, COL_Y, 1.8, OV.z0 + OV.wall, COL_Z - COL.r - 2.5 - OV.z0 - OV.wall, { tone: "mid" });
  box("oven.cradle", { x: x - 3, y: COL_Y - 4, w: 6, d: 8, r: 0.8 }, COL_Z - COL.r - 2.5, 2.5, { tone: "mid", steps: 2, bevel: 0.3 });
}
// the window patch: a strip of the column's near surface between two angles
function patchOf(iso, P, F, r, s0, s1, a0, a1, n) {
  const pt = (s, a) => iso([F.o[0] + F.a[0] * s + r * (F.u[0] * Math.cos(a) + F.v[0] * Math.sin(a)), F.o[1] + F.a[1] * s + r * (F.u[1] * Math.cos(a) + F.v[1] * Math.sin(a)), F.o[2] + F.a[2] * s + r * (F.u[2] * Math.cos(a) + F.v[2] * Math.sin(a))], P);
  const out = [];
  for (let i = 0; i <= n; i++) out.push(pt(s0, a0 + ((a1 - a0) * i) / n));
  for (let i = n; i >= 0; i--) out.push(pt(s1, a0 + ((a1 - a0) * i) / n));
  return "M" + out.map(([x, y]) => x.toFixed(2) + " " + y.toFixed(2)).join("L") + "Z";
}
const FACE = G.angleToward(COLF, V);
const WA = [FACE - WIN.half, FACE + WIN.half];
{
  const id = R.nameFor("column");
  const profile = [[0, COL.r], [COL.len, COL.r]];
  const shape = record(A.disc(COLF, 0, COL.len, COL.r, { name: id }));
  const windowD = patchOf(k.iso, P, COLF, COL.r, WIN.s0, WIN.s1, WA[0], WA[1], 16);
  const frits = patchOf(k.iso, P, COLF, COL.r, WIN.s0, WIN.s0 + WIN.frit, WA[0], WA[1], 12) + patchOf(k.iso, P, COLF, COL.r, WIN.s1 - WIN.frit, WIN.s1, WA[0], WA[1], 12);
  const bed = [];
  for (let s = WIN.s0 + WIN.frit + 1.1; s < WIN.s1 - WIN.frit - 0.6; s += 1.7)
    for (let j = 1; j < 8; j++) {
      const a = WA[0] + ((WA[1] - WA[0]) * (j + ((Math.round(s / 1.7) % 2) * 0.5 - 0.25))) / 8;
      const p = G.pointOf(COLF, s, COL.r, a);
      bed.push([...at(p), 0.35 + 0.65 * Math.max(0, Math.cos(a - FACE))]);
    }
  const svg = [
    S(G.disc(0, COL.len, COL.r, COLF, P), { tone: "hi", inner: L([1.6, COL.len - 1.6].map((s) => G.arcOf(COLF, s, COL.r, P)).join(""), { tone: "faint" }) }),
    `<clipPath id="hp-window"><path d="${windowD}"/></clipPath>`,
    `<path class="hp-bed" d="${windowD}"/>`,
    `<g clip-path="url(#hp-window)">${D(bed, { size: 0.32, tone: "lo" })}<path class="hp-frit" d="${frits}"/><path data-part="bands" class="hp-band" d=""/></g>`,
    L(frits, { tone: "faint" }),
    L(windowD, { tone: "lo" }),
  ].join("");
  R.put({ at: G.pointOf(COLF, COL.len / 2, 0, 0), name: id, shapes: [shape], svg });
  void profile;
}
for (const [s0, s1] of [[-COL.nutL, 0], [COL.len, COL.len + COL.nutL]]) {
  const face = s0 < 0 ? s0 : s1;
  discAt("column.nut", COLF, s0, s1, COL.nut, { tone: "mid", bevel: 0.3, extra: D(G.dotsOf(COLF, face, COL.nut * 0.7, 6, P, { all: true }), { size: 0.35 }) + k.fadedSvg(G.ribsOf(COLF, s0, s1, COL.nut, 6, P, { fade: [0.1, 0.55] }), { tone: "lo" }) });
}
// bulkheads through the oven side walls
const BULK = { r: 2.2 };
const bulkL_in = G.frameOf([RS.x + OV.wall, COL_Y, COL_Z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const bulkR_in = G.frameOf([RS.x + RS.w - OV.wall, COL_Y, COL_Z], [-1, 0, 0], [0, 1, 0], [0, 0, 1]);
const bulkL_out = G.frameOf([RS.x, COL_Y, COL_Z], [-1, 0, 0], [0, 1, 0], [0, 0, 1]);
const bulkR_out = G.frameOf([RS.x + RS.w, COL_Y, COL_Z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
discAt("oven.bulkhead-left-in", bulkL_in, 0, 3, BULK.r, { tone: "mid" });
discAt("oven.bulkhead-right-in", bulkR_in, 0, 3, BULK.r, { tone: "mid" });
discAt("oven.bulkhead-left-out", bulkL_out, 0, 4, BULK.r, { tone: "mid" });
discAt("oven.bulkhead-right-out", bulkR_out, 0, 3, BULK.r, { tone: "mid", extra: D(G.dotsOf(bulkR_out, 3, 1.5, 4, P, { all: true, phase: Math.PI / 4 }), { size: 0.3 }) });
pipe("oven.inlet", [G.pointOf(bulkL_in, 3, 0, 0), G.pointOf(COLF, -COL.nutL, 0, 0)], 0.9);
pipe("oven.outlet", [G.pointOf(COLF, COL.len + COL.nutL, 0, 0), G.pointOf(bulkR_in, 3, 0, 0)], 0.9);
pipe("oven.to-cell", [G.pointOf(bulkR_out, 3, 0, 0), [FC_IN[0], COL_Y, COL_Z], [FC_IN[0], COL_Y, FC.z1 + 2]], 0.9);

// ---------------------------------------------------------------- right stack: autosampler
{
  const [z0, z1] = Z_ALS;
  const door = rounded(-50, z0 + 6, 30, z1 - 6, 2.4, onFront(FRONT));
  const glass = rounded(-44, z0 + 12, 24, z1 - 14, 1.6, onFront(FRONT));
  box("sampler.case", RS, z0, z1 - z0, {
    tone: "mid",
    bevel: 0.8,
    inner: L(k.sideSeam(RS, z0 + 3, P, 3), { tone: "faint" }),
    extra: L(door, { tone: "lo" }) + L(glass, { tone: "faint" }) + D([at([44, FRONT, z1 - 10])], { size: 0.8, tone: "hi" }) + D([at([-54, FRONT, z1 - 3]), at([52, FRONT, z1 - 3])], { size: 0.45 }) + L(planDeck(), { tone: "faint" }),
  });
  box("sampler.handle", { x: 32, y: FRONT, w: 3, d: 2.4, r: 0.6 }, z0 + 14, 16, { tone: "hi", steps: 2, bevel: 0.2 });
}
function planDeck() {
  return k.planOutline({ x: RS.x + 4, y: RS.y + 4, w: RS.w - 8, d: RS.d - 8, r: 2 }, DECK, P, 3);
}
// vial rack and vials
const RACK = { x: -8, y: -21, w: 48, d: 28, r: 2 };
box("sampler.rack", RACK, DECK, 4, { tone: "lo", bevel: 0.4 });
const VIAL = { r: 3.4, h: 10, cap: 3.7, capH: 3 };
for (const [x, y] of VIALS) {
  cyl("sampler.vial", x, y, VIAL.r, DECK + 4, VIAL.h, { tone: "mid", inner: L(k.sideArc(x, y, VIAL.r, DECK + 9, P, 16), { tone: "faint" }) });
  cyl("sampler.vial-cap", x, y, VIAL.cap, DECK + 4 + VIAL.h, VIAL.capH, { tone: "lo", extra: L(k.ring(x, y, 1.6, DECK + 4 + VIAL.h + VIAL.capH, P, 16), { tone: "mid" }) });
}
const VIAL_TOP = DECK + 4 + VIAL.h + VIAL.capH;
// needle seat
cyl("sampler.seat", SEAT[0], SEAT[1], 2.6, DECK, 7, { tone: "mid", extra: L(k.ring(SEAT[0], SEAT[1], 1.1, DECK + 7, P, 14), { tone: "lo" }) });
const SEAT_TOP = DECK + 7;
// gantry: post, arm, carriage with holder and needle (built at the seat)
const ARM = { x: -28, x1: 55, z: 176, h: 5 };
cyl("sampler.post", 51, ARM_Y, 3.2, DECK, ARM.z - DECK, { tone: "mid", inner: L(k.sideArc(51, ARM_Y, 3.2, DECK + 8, P, 16), { tone: "faint" }) });
box("sampler.arm", { x: ARM.x, y: ARM_Y - 3, w: ARM.x1 - ARM.x, d: 6, r: 1 }, ARM.z, ARM.h, {
  tone: "mid",
  bevel: 0.4,
  extra: L(k.lineOnTop([ARM.x, ARM_Y], [ARM.x1, ARM_Y], ARM.z + ARM.h, P), { tone: "faint" }) + D([at([ARM.x + 3, ARM_Y, ARM.z + ARM.h]), at([ARM.x1 - 3, ARM_Y, ARM.z + ARM.h])], { size: 0.45 }),
});
const NEEDLE = { x: SEAT[0], holder: 164, tipRest: 158, down: 12 };
{
  const id = R.nameFor("sampler.carriage");
  const plan = { x: NEEDLE.x - 4, y: ARM_Y - 3.6, w: 8, d: 7.2, r: 0.8 };
  const carriage = record(A.slab(plan, 168, ARM.z - 168, { name: id }, 2));
  const holder = record(A.cylinder(NEEDLE.x, ARM_Y, 1.5, NEEDLE.holder, 168 - NEEDLE.holder, { name: `${id}.holder` }));
  const nF = G.frameAlong([NEEDLE.x, ARM_Y, NEEDLE.holder], [0, 0, -1]);
  const rod = G.rodOut(nF, 0, NEEDLE.holder - NEEDLE.tipRest, 0.45, P, { stroke: NEEDLE.down + 2 });
  const needle = record(A.disc(nF, 0, NEEDLE.holder - NEEDLE.tipRest, 0.45, { name: `${id}.needle` }));
  const svg = `<g data-part="carriage"><g data-part="needle-cut" clip-path="url(#hp-needle-cut)"><g data-part="needle"><clipPath id="hp-needle"><path data-hold d="${rod.clip}"/></clipPath><g clip-path="url(#hp-needle)">${S(rod.paths, { tone: "hi", crease: "none" })}</g></g></g>${S(k.cylinder(NEEDLE.x, ARM_Y, 1.5, NEEDLE.holder, 168 - NEEDLE.holder, P, 16), { tone: "mid" })}${S(k.slabOf(plan, 168, ARM.z - 168, P, 2, 0.3), { tone: "hi", crease: "lo" })}${D([at([NEEDLE.x - 2, ARM_Y + 3.6, 172]), at([NEEDLE.x + 2, ARM_Y + 3.6, 172])], { size: 0.4 })}</g>`;
  R.put({ at: [NEEDLE.x, ARM_Y, 170], bias: 120, name: id, shapes: [carriage, holder, needle], svg });
}
// six-port injection valve
{
  const { x, y, r, z } = VALVE;
  cyl("valve.body", x, y, r + 1.2, z, 4, { tone: "mid", bevel: 0.4 });
  cyl("valve.stator", x, y, r, z + 4, 4, {
    tone: "hi",
    crease: "lo",
    bevel: 0.5,
    extra: `<path data-part="grooves" class="iso-line hp-groove" data-tone="hi" d=""/>` + L(k.ring(x, y, r - 1.2, z + 8, P, 48), { tone: "faint" }) + D([at([x, y, z + 8])], { size: 0.6, tone: "mid" }),
  });
  for (const a of PORT_ANG) {
    const [px, py] = portAt(a);
    cyl("valve.port", px, py, 1.55, z + 8, 1.2, { tone: "mid", steps: 16 });
  }
  for (const a of [25, 85]) {
    const [px, py] = portAt(a);
    cyl("valve.plug", px, py, 1.5, z + 9.2, 1.6, { tone: "lo", steps: 16, extra: L(k.ring(px, py, 0.6, z + 10.8, P, 10), { tone: "faint" }) });
  }
}
// sample loop: an arch standing in a plane that faces the viewer
{
  const a = portAt(145);
  const b = portAt(325);
  pipe("valve.loop", [a, [a[0], a[1], a[2] + 15], [b[0], b[1], b[2] + 15], b], 0.8, { bend: 6, nutR: 1.45 });
}
// pump line: damper back boss, up the gap, over the deck, down into port 265
pipe("line.damper-to-valve", [G.pointOf(DAMP_OUT_F, 3, 0, 0), [DAMPER[0], 16, 20], [DAMPER[0], 16, 182], [P265[0], P265[1], 182], P265], 0.9, { bend: 5, nutR: 1.5 });
// column line: port 205, over to the gap, down to the left bulkhead
pipe("line.valve-to-column", [P205, [P205[0], P205[1], 170], [-70, COL_Y, 170], [-70, COL_Y, COL_Z], G.pointOf(bulkL_out, 4, 0, 0)], 0.9, { bend: 4, nutR: 1.5 });

// ---------------------------------------------------------------- waste bottle
{
  const [x, y] = WASTE;
  cyl("waste.body", x, y, 12, 0, 34, { tone: "mid", inner: L(k.sideArc(x, y, 12, 14, P, 36), { tone: "lo" }) + L(k.sideArc(x, y, 12, 26, P, 36), { tone: "faint" }) });
  const F = G.frameOf([x, y, 34], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const R0 = 12;
  const N = 5;
  const rad = (s) => N + (R0 - N) * Math.cos((Math.PI / 2) * Math.min(1, Math.max(0, s / 8)));
  const slope = (s) => -(R0 - N) * (Math.PI / 16) * Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, s / 8)));
  const prof = Array.from({ length: 17 }, (_, i) => [(i / 16) * 8, rad((i / 16) * 8), i > 0 && i < 16 ? 1 : 0]);
  const id = R.nameFor("waste.shoulder");
  const shape = record(A.solid(F, prof.map(([s, r]) => [s, r]), { name: id, radius: rad }));
  R.put({ at: [x, y, 38], name: id, shapes: [shape], svg: S(G.solidOf(prof, F, P, { smooth: { slope, radius: rad } }), { tone: "mid" }) });
  cyl("waste.cap", x, y, 6, 42, 6, { tone: "lo", bevel: 0.4, extra: L(k.knurl(x, y, 6, 42, 48, 28, P), { tone: "faint" }) });
  cyl("waste.port", x, y, 1.8, 48, 2, { tone: "mid" });
}
pipe("line.cell-to-waste", [G.pointOf(FC_OUT_F, 2, 0, 0), [86, FC_OUT_F.o[1], FC_OUT_F.o[2]], [86, FC_OUT_F.o[1], 60], [WASTE[0], FC_OUT_F.o[1], 60], [WASTE[0], FC_OUT_F.o[1], 50]], 0.9, { bend: 4 });

// ---------------------------------------------------------------- control panel with the chromatogram
{
  box("panel.base", { x: 140, y: -18, w: 44, d: 32, r: 3 }, 0, 5, { tone: "lo", bevel: 0.6, extra: D(k.corners({ x: 140, y: -18, w: 44, d: 32, r: 3 }, 4).map(([x, y]) => at([x, y, 5])), { size: 0.45 }) });
  cyl("panel.neck", 162, 0, 3.4, 5, PANEL.z0 - 5, { tone: "mid", inner: L(k.sideArc(162, 0, 3.4, 12, P, 16), { tone: "faint" }) });
  const plan = { x: PANEL.x, y: PANEL.y, w: PANEL.x1 - PANEL.x, d: PANEL.y1 - PANEL.y, r: 1.4 };
  const buttons = [[140, 26], [147, 26], [154, 26]];
  box("panel.body", plan, PANEL.z0, PANEL.z1 - PANEL.z0, {
    tone: "mid",
    bevel: 0.6,
    extra: L(rounded(SCREEN.x0 - 2, SCREEN.z0 - 2, SCREEN.x1 + 2, SCREEN.z1 + 2, 3, onFront(PANEL.y1)), { tone: "lo" }) + L(buttons.map(([x, z]) => rounded(x - 2.4, z - 1.2, x + 2.4, z + 1.2, 1.1, onFront(PANEL.y1))).join(""), { tone: "lo" }) + D([at([186, PANEL.y1, 26])], { size: 0.8, tone: "hi" }),
  });
}

// data cable from the detector to the control panel, lying on the bench
{
  const detF = G.frameAlong([RS.x + RS.w, -38, 5], [1, 0, 0]);
  discAt("detector.data-port", detF, 0, 2.5, 1.9, { tone: "mid", extra: L(G.circleOf(detF, 2.5, 0.9, P, 12), { tone: "faint" }) });
  const panF = G.frameAlong([140, -6, 2.6], [-1, 0, 0]);
  discAt("panel.data-port", panF, 0, 2.5, 1.9, { tone: "mid" });
  const route = G.fillet([G.pointOf(detF, 2.5, 0, 0), [68, -38, 5], [76, -38, 0.62], [124, -6, 0.62], [130, -6, 2.6], G.pointOf(panF, 2.5, 0, 0)], 3, 12, { P, tube: 0.62 });
  tubeItems("panel.cable", route, 0.62, { tone: "mid", limp: true, maxLength: 14, rims: [0.62, 0.62], touch: ["stand.bench"] });
}

// ---------------------------------------------------------------- the screen, drawn in the plane of the panel front
const PLOT = { x0: SCREEN.x0 + 4, x1: SCREEN.x1, z0: SCREEN.z0 + 5, z1: SCREEN.z1 - 7 };
{
  const plane = k.sideMatrix([0, PANEL.y1], 0, P, "left");
  const flat = (x0, z0, x1, z1, r) => k.pathOf(k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, 6).map(([u, z]) => [u, -z]), true);
  const win = flat(SCREEN.x0, SCREEN.z0, SCREEN.x1, SCREEN.z1, SCREEN.r);
  const grid = [0.25, 0.5, 0.75, 1].map((f) => `M${SCREEN.x0} ${-(PLOT.z0 + f * (PLOT.z1 - PLOT.z0)).toFixed(2)}H${SCREEN.x1}`).join("");
  const svg = `<g transform="${plane}"><clipPath id="hp-screen"><path d="${win}"/></clipPath><path class="hp-lcd" d="${win}"/><g clip-path="url(#hp-screen)"><path class="iso-line" data-tone="faint" d="${grid}"/><path class="iso-line" data-tone="lo" d="M${PLOT.x0} ${-SCREEN.z0}V${-SCREEN.z1}M${SCREEN.x0} ${-PLOT.z0}H${SCREEN.x1}"/><path data-part="ticks" class="iso-line" data-tone="lo" d=""/><path data-part="gradient" class="iso-line" data-tone="lo" data-dashed d=""/><clipPath id="hp-reveal"><rect data-part="reveal" x="${SCREEN.x0}" y="${-SCREEN.z1}" width="0" height="${SCREEN.z1 - SCREEN.z0}"/></clipPath><g clip-path="url(#hp-reveal)"><path data-part="trace" class="iso-line hp-trace" data-tone="hi" d=""/></g><circle data-part="pen" class="hp-pen" r="0.9" cx="${PLOT.x0}" cy="${-PLOT.z0}"/><text class="hp-lcd-text" data-part="clock" x="${SCREEN.x0 + 4.6}" y="${-(SCREEN.z1 - 4.6)}" font-size="3.6">t 0.00 min</text><text class="hp-lcd-text" data-part="phase" x="${SCREEN.x1 - 2.6}" y="${-(SCREEN.z1 - 4.6)}" font-size="3.6" text-anchor="end">20 %B</text></g><path class="iso-line" data-tone="lo" d="${win}"/></g>`;
  put("panel.screen", [162, PANEL.y1 + 0.1, 54], svg, [record(A.box([SCREEN.x0, PANEL.y1, SCREEN.z0], [SCREEN.x1, PANEL.y1 + 0.1, SCREEN.z1], { name: "panel.screen" }))], { bias: 0.5 });
}

// ---------------------------------------------------------------- settle, sort, page
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const body = R.items.map((item) => `<g class="it" data-n="${item.name}">${item.svg}</g>`).join("");
const LABEL =
  "A high-performance liquid chromatograph on a bench, in two stacks. Left: two solvent bottles on a tray feed a vacuum degasser, which feeds a binary pump whose two pistons are driven by eccentric cams; their outlets meet in a tee and pass a pulse damper with a pressure gauge. Right: an autosampler with a vial rack, a needle on a gantry and a six-port injection valve with its sample loop; below it an open column oven holding a C18 column whose packed bed and frits show through a cut-away window; below that a UV detector with its lamp and a flow cell, and a waste bottle. A control panel shows the chromatogram as it is recorded.";
const needleCut = `<clipPath id="hp-needle-cut"><rect data-part="cut" x="-2000" y="-2000" width="4000" height="0"/></clipPath>`;
const svg = k.figureSvg({ width: W, height: H, label: LABEL, body: [`<defs>${needleCut}</defs>`, ...back, body] });

// ---------------------------------------------------------------- live data
const DATA = {
  P,
  ecc: ECC,
  strokeML: PUMP_STROKE_UL / 1000,
  pistons: PISTON.map((p) => p.id),
  gauge: GAUGE,
  colF: COLF,
  colR: COL.r,
  win: { s0: WIN.s0 + WIN.frit, s1: WIN.s1 - WIN.frit, a0: WA[0], a1: WA[1] },
  colLen: COL.len,
  valve: VALVE,
  portR: PORT_R,
  portAng: PORT_ANG,
  needle: { x: NEEDLE.x, y: ARM_Y, down: NEEDLE.down, tipRest: NEEDLE.tipRest, vials: VIALS.filter(([, y]) => y === ARM_Y).map(([x]) => x), vialTop: VIAL_TOP, seatTop: SEAT_TOP },
  plot: PLOT,
  screen: SCREEN,
  defaults: M.DEFAULTS,
  limits: M.LIMITS,
  speed: 0.6, // run minutes shown per second of page time
};
const MODEL = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const CSS = readFileSync(join(HERE, "hplc.css"), "utf8");

const r0 = M.run(M.DEFAULTS);
const readout0 = `${M.DEFAULTS.flow.toFixed(2)} mL/min · ${Math.round(M.pressure(M.DEFAULTS.flow, M.DEFAULTS.phi0))} bar · ${Math.round(M.DEFAULTS.phi0 * 100)} %B`;
const controls = `<div class="hp-controls">
<label class="hp-ctl"><span class="hp-ctl-name">Flow</span><input type="range" data-ctl="flow" min="${M.LIMITS.flow[0]}" max="${M.LIMITS.flow[1]}" step="0.05" value="${M.DEFAULTS.flow}" aria-valuetext="${M.DEFAULTS.flow.toFixed(2)} mL/min"><output data-out="flow">${M.DEFAULTS.flow.toFixed(2)} mL/min</output></label>
<label class="hp-ctl"><span class="hp-ctl-name">Final %B</span><input type="range" data-ctl="phi1" min="40" max="${Math.round(M.LIMITS.phi1[1] * 100)}" step="1" value="${Math.round(M.DEFAULTS.phi1 * 100)}" aria-valuetext="${Math.round(M.DEFAULTS.phi1 * 100)} percent acetonitrile"><output data-out="phi1">${Math.round(M.DEFAULTS.phi1 * 100)} %</output></label>
<span class="hp-method" data-method>t0 ${r0.t0.toFixed(2)} · tR ${r0.peaks.map((p) => `${p.name} ${p.tR.toFixed(2)}`).join(" · ")} min</span>
</div><span class="hp-live" aria-live="polite" data-live></span>`;
const stage = `<div class="iso-stage hp-stage" tabindex="0" role="slider" aria-label="HPLC system. Left and right arrow keys change the pump flow; Shift for bigger steps, Home and End for the limits." aria-valuemin="${M.LIMITS.flow[0]}" aria-valuemax="${M.LIMITS.flow[1]}" aria-valuenow="${M.DEFAULTS.flow}" aria-valuetext="Flow ${M.DEFAULTS.flow.toFixed(2)} mL/min, ${Math.round(r0.pMax)} bar, peaks at ${r0.peaks.map((p) => p.tR.toFixed(2)).join(", ")} min">${svg}</div>`;
const page = k.pageHtml({
  title: "HPLC system",
  theme: THEME,
  width: 940,
  body:
    `<style>${CSS}</style>` +
    k.plateHtml({
      fig: "Fig 1",
      title: "HPLC · reversed phase C18",
      hint: "← → flow · sliders below",
      readout: readout0,
      keys: [
        { mark: "lit", label: "Analyte bands in the C18 bed: each travels at 1/(1+k) of the eluent speed" },
        { mark: "raised", label: "Pistons, cams, needle and valve rotor: what the pump and sampler do" },
        { mark: "edge", label: "Capillaries in flow order: bottles, degasser, pump, damper, valve, column, flow cell, waste" },
      ],
      caption: `Reversed-phase HPLC with a ${COLUMN_TEXT()} column (${M.COLUMN.plates.toLocaleString("en-US")} plates) and a water/acetonitrile gradient from ${Math.round(M.DEFAULTS.phi0 * 100)} % B to the final %B over ${M.DEFAULTS.tG} min. Each pump piston strokes at its own share of the flow (${PUMP_STROKE_UL} µL per stroke, real time); the run clock on the screen and in the column is sped up ${Math.round(60 * DATA.speed)}×. Backpressure is Kozeny–Carman through the bed (${Math.round(M.pressure(M.DEFAULTS.flow, M.DEFAULTS.phi0))} bar at ${M.DEFAULTS.flow.toFixed(1)} mL/min); the dead time is ${r0.t0.toFixed(2)} min, and each band moves down the column at a speed set by its retention factor in the eluent of that moment, so it reaches the flow cell at its retention time.`,
      body: stage + controls,
    }),
  script: kitScript() + "\n" + MODEL + "\n" + LIVE,
});
function COLUMN_TEXT() {
  return `${M.COLUMN.L * 1000} × ${(M.COLUMN.d * 1000).toFixed(1)} mm, ${M.COLUMN.dp * 1e6} µm`;
}
const name = THEME === "light" ? "hplc-light.html" : "hplc.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${R.solids.length} solids`, `${R.tubes.length} tube runs`);

A.auditOrExit(R, P);
