// Scanning electron microscope on its plinth: an isometric Hero figure built with the anatomy kit.
// node sem/build.mjs [--light] [--audit]
// The column, the chamber, the BSE ring and the specimen are drawn with the front-right quarter cut away
// (planes y = 0 and x = 0 through the electron-optical axis), so the beam can be seen inside.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import * as A from "../kit/audit.mjs";
import { kitScript } from "../scripts/inline-kit.mjs";
import { makeBench, moduleText, LIVE_CORE, controlsHtml, stageHtml, pageOf, scriptOf } from "../common/bench.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- world plan (x right-back, y left-back toward the viewer, z up)
const W = 900;
const H = 660;
const AZIMUTH = 45;
const ELEVATION = 30;

const BENCH = { x: -252, y: -150, w: 420, d: 222, r: 8 };
const BENCH_H = 10;
const FOOT_H = 5;

// cut-away quarter: angles 0 (+x) to 90° (+y) about the axis are removed
const A0 = 0;
const A1 = Math.PI / 2;
const LIMB = [A1 + Math.PI / 4, A0 - Math.PI / 4]; // limbs of a vertical cylinder seen from azimuth 45°
const FZ = G.frameOf([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const pol = (r, a, z) => [r * Math.cos(a), r * Math.sin(a), z];

// chamber
const CH = { x0: -60, x1: 60, y0: -60, y1: 60, z0: 36, floor: 5, z1: 126, roof: 6, wall: 5 };
const ZF = CH.z0 + CH.floor; // chamber floor top 41
const ZR = CH.z1 - CH.roof; // roof underside 120
const HOLE = 14; // square hole in the roof for the pole piece
// column stack (z ranges), radii
const POLE = { z0: 104, z1: ZR, r0: 6, r1: 14, bore: 2.5, top: CH.z1 };
const OL = { z0: CH.z1, z1: 162, R: 30, bore: 4, coil: [12, 26, 131, 157] };
const SC = { z0: 162, z1: 182, R: 16, bore: 4, coils: [[6.5, 12.5, 173, 179], [6.5, 12.5, 165, 171]] };
const APH = { z0: 182, z1: 188, R: 22, bore: 4, strip: [184.6, 185.4], hole: 1 };
const C2 = { z0: 188, z1: 214, R: 24, bore: 4, coil: [9, 20, 192, 210], flange: 3 };
const SPACER = { z0: 214, z1: 222, R: 10, bore: 4 };
const C1 = { z0: 222, z1: 248, R: 24, bore: 4, coil: [9, 20, 226, 244], flange: 3 };
const VALVE = { z0: 248, z1: 258, R: 12, bore: 4 };
const ANODE = { z0: 258, z1: 276, R: 22, bore: 10, plate: [265, 266.6], hole: 1, flange: 3 };
const GUN = { z0: 276, z1: 312, R: 24, bore: 14, lid: 5, flange: 3 };
const BUSH = { z0: 312, z1: 328, r0: 10, r1: 6 };
const TIP = { z: 284, suppressor: [284.4, 289, 4.2], insulator: [292, GUN.z1 - GUN.lid, 6.5, 11], extractor: [280.2, 281.4, 1] };
// specimen on a stage whose upper part lifts with the working distance (WD 20 mm at rest, 16 units of lift)
const WD_UNIT = 1; // drawn units per mm of working distance
const LIFT = (M.LIMITS.wd[1] - M.LIMITS.wd[0]) * WD_UNIT;
const ZS_REST = POLE.z0 - M.LIMITS.wd[1] * WD_UNIT; // specimen top at the longest WD (84)
const SPEC = { R: 13, h: 11 };
const STUB = { R: 12.5, h: 1.5, pin: [2, 3] };
const HOLDER = { R: 7, h: 2 };
const ROT = { R: 15, h: 3 };
const BSE = { z0: 101.5, z1: POLE.z0, R: 11, bore: 3 };

const P = k.fitProjection(
  [...k.boxCorners(BENCH, -BENCH_H - FOOT_H, 0), [0, 0, 336], [-72, 0, 344], [-150, -140, 200]],
  W,
  H,
  { pad: 18, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const R = A.recorder(P, { order: ["lift"], spring: {} });
const B = makeBench(P, R, KS, { bench: BENCH, benchH: BENCH_H, footH: FOOT_H, ns: "sm" });
const { at, S, L, D, rounded, onFront, onRight, record, put, box, cyl, discAt, ballAt, tubeItems } = B;
const iso3 = (p) => k.iso(p, P);
const pts = (list) => k.pathOf(list.map(iso3), true);
const arcPts = (r, z, from, to, n = 40) => Array.from({ length: n + 1 }, (_, i) => pol(r, from + ((to - from) * i) / n, z));
const LIFT_MOVE = [0, 0, LIFT];

// ---------------------------------------------------------------- the cut-away round body
// prof: outer [[z, R]] rising; section: the meridian half-section [[r, z]] drawn on both cut planes;
// cavity { r, z0, z1 }: the bore seen through the cut; hole: radius of the opening in the top face (0 for a lid).
let CLIPS = 0;
function faceSvg(section, a, tone, cls = "") {
  const d = pts(section.map(([r, z]) => pol(r, a, z)));
  return `<path class="iso-fill${cls}" d="${d}"/><path class="${a === A0 ? "sm-cut" : "sm-cut-2"}" d="${d}"/><path class="iso-line iso-edge" data-tone="${tone}" d="${d}"/>`;
}
function coilSvg([r0, r1, z0, z1], a) {
  const box = pts([pol(r0, a, z0), pol(r1, a, z0), pol(r1, a, z1), pol(r0, a, z1)]);
  const nr = Math.max(2, Math.round((r1 - r0) / 1.5));
  const nz = Math.max(2, Math.round((z1 - z0) / 1.5));
  const wires = [];
  for (let i = 0; i < nr; i++) for (let j = 0; j < nz; j++) wires.push(iso3(pol(r0 + ((i + 0.5) * (r1 - r0)) / nr, a, z0 + ((j + 0.5) * (z1 - z0)) / nz)));
  return `<path class="sm-coil" d="${box}"/>` + D(wires, { size: 0.32, tone: "mid" }) + `<path class="iso-line iso-edge" data-tone="lo" d="${box}"/>`;
}
function topSector(z, rOut, rIn, tone) {
  const outer = arcPts(rOut, z, A1, A0 + TAU, 60);
  const inner = rIn > 0 ? arcPts(rIn, z, A0 + TAU, A1, 40) : [[0, 0, z]];
  const d = pts([...outer, ...inner]);
  return `<path class="iso-top sm-top" d="${d}"/><path class="iso-line iso-edge" data-tone="${tone}" d="${d}"/>`;
}
function voidSvg(r, z0, z1) {
  if (r <= 0 || z1 <= z0) return "";
  const top = arcPts(r, z1, LIMB[0], LIMB[1] + TAU, 40);
  const low = arcPts(r, z0, LIMB[1] + TAU, LIMB[0], 40);
  return `<path class="sm-void" d="${pts([...top, ...low])}"/>`;
}
function wedgeClip(prof) {
  const z0 = prof[0][0];
  const z1 = prof[prof.length - 1][0];
  const r0 = prof[0][1];
  const r1 = prof[prof.length - 1][1];
  const list = [[0, 0, z0], [0, 0, z1], ...arcPts(r0, z0, A0, A1, 24), ...arcPts(r1, z1, A0, A1, 24), ...prof.flatMap(([z, r]) => [pol(r, A0, z), pol(r, A1, z)])].map(iso3);
  const hull = G.hullOf(list);
  const id = `sm-cut${++CLIPS}`;
  return { id, def: `<clipPath id="${id}"><path clip-rule="evenodd" d="M-60 -60H${W + 60}V${H + 60}H-60Z${k.pathOf(hull, true)}"/></clipPath>` };
}
// the drawn pieces of one cut body, as markup (no recording)
function cutMarkup({ prof, section, cavity = null, hole = 0, tone = "hi", seams = [], coils = [], inside = "", after = "", bolts = null }) {
  const clip = wedgeClip(prof);
  const solid = S(G.solidOf(prof, FZ, P), { tone, inner: seams.length ? L(seams.map(([z, r]) => G.arcOf(FZ, z, r, P)).join(""), { tone: "faint" }) : "" });
  const z1 = prof[prof.length - 1][0];
  const r1 = prof[prof.length - 1][1];
  let svg = clip.def + `<g clip-path="url(#${clip.id})">${solid}</g>`;
  if (cavity) svg += voidSvg(cavity.r, cavity.z0, cavity.z1);
  svg += inside;
  svg += topSector(z1, r1, hole, tone);
  if (bolts) svg += D(Array.from({ length: bolts.n }, (_, i) => A1 + ((i + 0.5) * (TAU - (A1 - A0))) / bolts.n).map((a) => iso3(pol(bolts.r, a, z1))), { size: 0.45 });
  for (const a of [A0, A1]) svg += faceSvg(section, a, tone) + coils.map((c) => coilSvg(c, a)).join("");
  return svg + after;
}
// a simple cut ring (housing) z0..z1, outer R, bore r, optional flange at the bottom
function ringSection(z0, z1, Rr, bore) {
  return [[bore, z0], [Rr, z0], [Rr, z1], [bore, z1]];
}
function cutRing(name, { z0, z1, R: Rr, bore, tone = "hi", coils = [], seams = [], inside = "", after = "", bolts = null, piece = "", move, bias = 0, extraShapes = [] }) {
  const id = R.nameFor(name);
  const shape = record(A.ring(FZ, z0, z1, bore, Rr, { name: id, owner: id }));
  R.put({ at: [0, 0, (z0 + z1) / 2], bias, name: id, piece, move, shapes: [shape, ...extraShapes], svg: cutMarkup({ prof: [[z0, Rr], [z1, Rr]], section: ringSection(z0, z1, Rr, bore), cavity: { r: bore, z0, z1 }, hole: bore, tone, coils, seams, inside, after, bolts }) });
  return shape;
}
// a plate across a bore (aperture strip, anode, extractor): its remaining three quarters, top and two cut faces
function platePieces(z0, z1, rOut, hole, tone = "mid") {
  return topSector(z1, rOut, hole, tone) + faceSvg(ringSection(z0, z1, rOut, hole), A0, tone) + faceSvg(ringSection(z0, z1, rOut, hole), A1, tone);
}

// ---------------------------------------------------------------- small helpers
const ventsFront = (y, x0, n, gap, z0, z1) => L(Array.from({ length: n }, (_, i) => rounded(x0 + i * gap, z0, x0 + i * gap + 1.4, z1, 0.7, onFront(y))).join(""), { tone: "faint" });
const ventsRight = (x, y0, n, gap, z0, z1) => L(Array.from({ length: n }, (_, i) => rounded(y0 + i * gap, z0, y0 + i * gap + 1.4, z1, 0.7, onRight(x))).join(""), { tone: "faint" });
function plate(name, x, y, z, w, h, rules) {
  box(name, { x, y, w, d: 0.6, r: 0.2 }, z, h, {
    tone: "lo",
    steps: 2,
    bevel: 0,
    crease: "none",
    extra: L(rules.map((rw, i) => k.segment([x + 2, y + 0.6, z + h - 2.6 - i * 2.2], [x + 2 + rw, y + 0.6, z + h - 2.6 - i * 2.2], P)).join(""), { tone: "faint", free: true }),
  });
}
// a line between two ports: each end a port disc (2.5 deep) facing along dir, the route filleted between them
function line(name, from, to, via, { r, tone = "mid", touch = [], bend } = {}) {
  const ends = [from, to].map((end) => {
    const F = G.frameAlong(end.at, end.dir);
    discAt(end.name, F, 0, 2.5, end.portR ?? r + 0.9, { tone: "mid", extra: end.ring ? L(G.circleOf(F, 2.5, r + 0.3, P, 16), { tone: "faint" }) : "" });
    return G.pointOf(F, 2.5, 0, 0);
  });
  const route = G.fillet([ends[0], ...via, ends[1]], bend ?? Math.max(3, r * 3.4), 12, { P, tube: r });
  return B.tubeItems(name, route, r, { tone, limp: true, maxLength: 14, rims: [r, r], touch });
}
// a turned part on frame F from profile [[s, r]]
function turned(name, F, profile, { tone = "mid", extra = "", inner = "", bias = 0, owner, piece = "", move, lit = false } = {}) {
  const id = R.nameFor(name);
  const shape = record(A.solid(F, profile.map(([s, r]) => [s, r]), { name: id, owner }));
  const s0 = profile[0][0];
  const s1 = profile[profile.length - 1][0];
  R.put({ at: G.pointOf(F, (s0 + s1) / 2, 0, 0), bias, name: id, piece, move, shapes: [shape], svg: S(G.solidOf(profile, F, P), { tone, inner, lit }) + extra });
  return shape;
}

// ---------------------------------------------------------------- 0 plinth
const back = B.stand({
  strip: { x: -30, w: 150 },
  label: { x: 96 },
  shadows: [[{ x: CH.x0, y: CH.y0, w: 120, d: 120, r: 3 }, 6], [{ x: -242, y: -42, w: 68, d: 72, r: 2 }, 8], [{ x: 70, y: -50, w: 50, d: 32, r: 2 }, 5], [{ x: -97, y: 19, w: 22, d: 22, r: 11 }, 4], [{ x: -228, y: 44, w: 46, d: 22, r: 2 }, 3]],
});

// ---------------------------------------------------------------- 1 chamber on four isolator legs
const LEGS = [[-48, -48], [48, -48], [-48, 48], [48, 48]];
for (const [x, y] of LEGS) {
  cyl("frame.isolator", x, y, 8, 0, 6, { tone: "lo", bevel: 0.4, inner: L(k.sideArc(x, y, 8, 3, P, 32), { tone: "faint" }) });
  cyl("frame.leg", x, y, 5, 6, CH.z0 - 6 - 3, { tone: "mid", inner: L(k.sideArc(x, y, 5, 12, P, 24), { tone: "faint" }) });
  cyl("frame.pad", x, y, 7, CH.z0 - 3, 3, { tone: "lo", bevel: 0.3 });
}
const CHP = { x: CH.x0, y: CH.y0, w: CH.x1 - CH.x0, d: CH.y1 - CH.y0, r: 2 };
box("chamber.floor", CHP, CH.z0, CH.floor, {
  tone: "mid",
  bevel: 0.6,
  inner: L(k.sideSeam(CHP, CH.z0 + 2, P, 3), { tone: "faint" }),
  extra: L(k.planOutline(k.insetPlan(CHP, 7), ZF, P, 3), { tone: "faint" }),
});
const wallH = ZR - ZF;
const boltsOn = (list) => D(list.map(iso3), { size: 0.42 });
box("chamber.back", { x: CH.x0, y: CH.y0, w: CH.x1 - CH.x0, d: CH.wall, r: 0.6 }, ZF, wallH, { tone: "mid", steps: 2, bevel: 0.3, extra: boltsOn([-40, -10, 20, 40].map((x) => [x, CH.y0 + CH.wall, ZF + 6])) });
box("chamber.left", { x: CH.x0, y: CH.y0 + CH.wall, w: CH.wall, d: CH.y1 - CH.y0 - CH.wall, r: 0.6 }, ZF, wallH, { tone: "mid", steps: 2, bevel: 0.3 });
// front wall, left half: the door frame, the door and its hinges
const FRONT = { x: CH.x0 + CH.wall, y: CH.y1 - CH.wall, w: -CH.x0 - CH.wall, d: CH.wall, r: 0.4 };
box("chamber.front", FRONT, ZF, wallH, {
  tone: "mid",
  steps: 2,
  bevel: 0.3,
  extra: L(rounded(-52, 50, -6, 112, 2.4, onFront(CH.y1)), { tone: "lo" }) + boltsOn([[-55, CH.y1, ZF + 4], [-3, CH.y1, ZF + 4], [-55, CH.y1, ZR - 3], [-3, CH.y1, ZR - 3]]),
});
// right wall, back half
const RIGHT = { x: CH.x1 - CH.wall, y: CH.y0 + CH.wall, w: CH.wall, d: -CH.y0 - CH.wall, r: 0.4 };
box("chamber.right", RIGHT, ZF, wallH, {
  tone: "mid",
  steps: 2,
  bevel: 0.3,
  extra: ventsRight(CH.x1, -48, 6, 6, 52, 64) + boltsOn([[CH.x1, -52, ZF + 4], [CH.x1, -52, ZR - 3]]),
});
// door on the front wall: panel, viewport, handle, two hinges and a clamp
const DOOR = { x: -50, x1: -8, z0: 52, z1: 110 };
box("door.panel", { x: DOOR.x, y: CH.y1, w: DOOR.x1 - DOOR.x, d: 3, r: 1 }, DOOR.z0, DOOR.z1 - DOOR.z0, {
  tone: "hi",
  steps: 3,
  bevel: 0.4,
  crease: "lo",
  extra: L(rounded(DOOR.x + 4, DOOR.z0 + 4, DOOR.x1 - 4, DOOR.z1 - 4, 1.6, onFront(CH.y1 + 3)), { tone: "faint" }) + boltsOn([[DOOR.x + 2.2, CH.y1 + 3, DOOR.z0 + 2.2], [DOOR.x1 - 2.2, CH.y1 + 3, DOOR.z0 + 2.2], [DOOR.x + 2.2, CH.y1 + 3, DOOR.z1 - 2.2], [DOOR.x1 - 2.2, CH.y1 + 3, DOOR.z1 - 2.2]]),
});
{
  const F = G.frameAlong([-29, CH.y1 + 3, 92], [0, 1, 0]);
  discAt("door.viewport-ring", F, 0, 1.6, 9, { tone: "mid", extra: D(G.dotsOf(F, 1.6, 7.6, 8, P, { all: true }), { size: 0.4 }) });
  discAt("door.viewport", F, 1.6, 2.2, 6, { tone: "lo", extra: `<path class="sm-glass" d="${G.circleOf(F, 2.2, 5.4, P, 40)}"/>` });
  for (const z of [62, 100]) {
    cyl("door.hinge", DOOR.x - 1.75, CH.y1 + 1.75, 1.8, z - 5, 10, { tone: "mid", steps: 16, inner: L(k.sideArc(DOOR.x - 1.75, CH.y1 + 1.75, 1.8, z, P, 12), { tone: "faint" }) });
  }
  box("door.handle-post", { x: -14, y: CH.y1 + 3, w: 3, d: 4, r: 0.6 }, 66, 3, { tone: "mid", steps: 2, bevel: 0.2 });
  box("door.handle-post", { x: -14, y: CH.y1 + 3, w: 3, d: 4, r: 0.6 }, 80, 3, { tone: "mid", steps: 2, bevel: 0.2 });
  box("door.handle", { x: -14, y: CH.y1 + 7, w: 3, d: 3, r: 1.2 }, 64, 21, { tone: "hi", steps: 3, bevel: 0.2 });
}
// roof in five pieces round the pole-piece hole, cut along x = 0 and y = 0
const ROOF = [
  { x: CH.x0, y: CH.y0, w: 120, d: 60 - HOLE },
  { x: CH.x0, y: -HOLE, w: 60 - HOLE, d: HOLE },
  { x: HOLE, y: -HOLE, w: 60 - HOLE, d: HOLE },
  { x: CH.x0, y: 0, w: 60 - HOLE, d: 60 },
  { x: -HOLE, y: HOLE, w: HOLE, d: 60 - HOLE },
];
const ROOF_SHAPES = ROOF.map((plan, i) => box("chamber.roof", { ...plan, r: 0.4 }, ZR, CH.roof, {
  tone: "mid",
  steps: 2,
  bevel: 0.3,
  extra: i === 0 ? boltsOn([-50, -25, 25, 50].map((x) => [x, CH.y0 + 3, CH.z1])) + boltsOn([[CH.x0 + 3, -50, CH.z1], [CH.x0 + 3, -20, CH.z1]]) : i === 3 ? boltsOn([[CH.x0 + 3, 20, CH.z1], [CH.x0 + 3, 50, CH.z1], [-30, CH.y1 - 3, CH.z1]]) : "",
}));

// ---------------------------------------------------------------- 2 stage: base, Y and X slides with motors, tilt cradle, Z housing
const STAGE = { base: { x: -32, y: -32, w: 64, d: 64, r: 2 }, z: ZF };
box("stage.base", STAGE.base, ZF, 3, { tone: "lo", bevel: 0.4, extra: D(k.corners(STAGE.base, 3).map(([x, y]) => at([x, y, ZF + 3])), { size: 0.42 }) });
const ZB = ZF + 3;
for (const x of [-22, 18]) box("stage.y-rail", { x, y: -30, w: 4, d: 60, r: 0.6 }, ZB, 1.5, { tone: "mid", steps: 2, bevel: 0 });
const YC = { x: -26, y: -24, w: 52, d: 48, r: 1.5 };
box("stage.y-carriage", YC, ZB + 1.5, 3, { tone: "mid", bevel: 0.4, extra: D([[-24, 22], [24, 22]].map(([x, y]) => at([x, y, ZB + 4.5])), { size: 0.4 }) });
const ZY = ZB + 4.5;
for (const y of [-18, 14]) box("stage.x-rail", { x: -24, y, w: 48, d: 4, r: 0.6 }, ZY, 1.5, { tone: "mid", steps: 2, bevel: 0 });
const XC = { x: -22, y: -22, w: 44, d: 44, r: 1.5 };
box("stage.x-carriage", XC, ZY + 1.5, 3, { tone: "mid", bevel: 0.4 });
const ZX = ZY + 4.5;
// stepper motors on the stage base, back and left
{
  box("stage.bracket-y", { x: -46, y: -4, w: 14, d: 8, r: 0.6 }, ZF, ZB - ZF, { tone: "lo", steps: 2, bevel: 0.2 });
  box("stage.bracket-x", { x: -4, y: -46, w: 8, d: 14, r: 0.6 }, ZF, ZB - ZF, { tone: "lo", steps: 2, bevel: 0.2 });
  const mY = G.frameAlong([-32, 0, ZB + 4.6], [-1, 0, 0]);
  discAt("stage.motor-y", mY, 0, 12, 4.6, { tone: "mid", extra: k.fadedSvg(G.ribsOf(mY, 2, 10, 4.6, 18, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
  discAt("stage.motor-y-cap", mY, 12, 14, 3.6, { tone: "lo" });
  const mX = G.frameAlong([0, -32, ZB + 4.6], [0, -1, 0]);
  discAt("stage.motor-x", mX, 0, 12, 4.6, { tone: "mid", extra: k.fadedSvg(G.ribsOf(mX, 2, 10, 4.6, 18, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
  discAt("stage.motor-x-cap", mX, 12, 14, 3.6, { tone: "lo" });
}
// tilt cradle: two cheeks with trunnion bearings, a tilt table hung between them
const TILT = { cheeks: [-20, 16], y: -10, d: 20, z1: ZX + 14, axis: ZX + 9, table: { x: -16, y: -14, w: 32, d: 28, r: 1.2 }, tz: ZX + 6 };
for (const x of TILT.cheeks) {
  box("stage.cheek", { x, y: TILT.y, w: 4, d: TILT.d, r: 0.8 }, ZX, TILT.z1 - ZX, { tone: "mid", steps: 2, bevel: 0.3 });
}
{
  const F = G.frameAlong([TILT.cheeks[1] + 4, 0, TILT.axis], [1, 0, 0]);
  discAt("stage.trunnion", F, 0, 1.6, 3.4, { tone: "lo", extra: L(G.circleOf(F, 1.6, 1.4, P, 20), { tone: "mid" }) + D([at(G.pointOf(F, 1.6, 0, 0))], { size: 0.45 }) });
  // tilt scale on the right cheek's outer face
  const ticks = k.sideTicks(-8, 8, 2, 4, TILT.cheeks[1] + 4, TILT.z1, [1.2, 2.2], P, "y");
  if (ticks) Object.assign(TILT, { ticks });
}
box("stage.tilt-table", TILT.table, TILT.tz, 4, { tone: "hi", crease: "lo", bevel: 0.3, extra: D(k.corners(TILT.table, 2.4).map(([x, y]) => at([x, y, TILT.tz + 4])), { size: 0.4 }) });
const ZT = TILT.tz + 4;
// Z housing on the tilt table, the lift post slides out of its gland
const GLAND = { z0: ZT, z1: ZS_REST - SPEC.h - STUB.h - HOLDER.h - ROT.h - 0.5, r: 7 };
cyl("stage.z-housing", 0, 0, GLAND.r, GLAND.z0, GLAND.z1 - GLAND.z0, { tone: "mid", inner: L(k.sideArc(0, 0, GLAND.r, GLAND.z0 + 2, P, 32), { tone: "faint" }), extra: L(k.ring(0, 0, 4.4, GLAND.z1, P, 28), { tone: "faint" }) });

// ---------------------------------------------------------------- 3 the lifting group (moves with the working distance)
const ZROT = ZS_REST - SPEC.h - STUB.h - HOLDER.h - ROT.h; // rotation table bottom at rest
{
  const F = G.frameAlong([0, 0, 0], [0, 0, 1]);
  const rod = G.rodOut(F, GLAND.z1, ZROT, 4, P, { stroke: LIFT });
  const id = R.nameFor("lift.post");
  const shape = record(A.slide(F, GLAND.z1, ZROT, 4, { name: id }));
  R.put({ at: [0, 0, (GLAND.z1 + ZROT) / 2], name: id, piece: "lift", move: LIFT_MOVE, shapes: [shape], svg: `<clipPath id="sm-rod"><path data-hold d="${rod.clip}"/></clipPath><g clip-path="url(#sm-rod)">${S(rod.paths, { tone: "hi" })}</g>` });
}
const liftCyl = (name, r, z, h, opts = {}) => {
  const id = R.nameFor(name);
  const shape = record(A.cylinder(0, 0, r, z, h, { name: id }));
  R.put({ at: [0, 0, z + h / 2], name: id, piece: "lift", move: LIFT_MOVE, shapes: [shape], svg: S(k.cylinder(0, 0, r, z, h, P, G.stepsFor(r, 28, 96, KS), opts.bevel ?? 0), { tone: opts.tone ?? "mid", inner: opts.inner ?? "" }) + (opts.extra ?? "") });
};
liftCyl("lift.rotation", ROT.R, ZROT, ROT.h, { tone: "mid", bevel: 0.4, extra: L(k.knurl(0, 0, ROT.R, ZROT + 0.6, ZROT + ROT.h - 0.6, 64, P), { tone: "faint" }) + L(k.radialTicks(0, 0, ROT.R - 0.6, 36, 9, ZROT + ROT.h, [0.9, 1.8], P).minor, { tone: "lo" }) });
liftCyl("lift.holder", HOLDER.R, ZROT + ROT.h, HOLDER.h, { tone: "lo", bevel: 0.3, inner: L(k.sideArc(0, 0, HOLDER.R, ZROT + ROT.h + 1.5, P, 32), { tone: "faint" }) });
const ZSTUB = ZROT + ROT.h + HOLDER.h;
liftCyl("lift.stub", STUB.R, ZSTUB, STUB.h, { tone: "mid", bevel: 0.3 });
// the specimen: a silicon piece with gold particles, cut like the column; the interaction volume is drawn on its cut faces by live.js
{
  const z0 = ZSTUB + STUB.h;
  const z1 = z0 + SPEC.h;
  const id = R.nameFor("lift.specimen");
  const shape = record(A.cylinder(0, 0, SPEC.R, z0, SPEC.h, { name: id }));
  const grains = Array.from({ length: 26 }, (_, i) => {
    const a = A1 + 0.15 + ((i * 0.618034) % 1) * (TAU - (A1 - A0) - 0.3);
    const r = 2.5 + ((i * 0.37) % 1) * (SPEC.R - 3.5);
    return iso3(pol(r, a, z1));
  });
  const svg = cutMarkup({ prof: [[z0, SPEC.R], [z1, SPEC.R]], section: [[0, z0], [SPEC.R, z0], [SPEC.R, z1], [0, z1]], hole: 0, tone: "hi", after: D(grains, { size: 0.42, tone: "hi" }) });
  R.put({ at: [0, 0, (z0 + z1) / 2], name: id, piece: "lift", move: LIFT_MOVE, shapes: [shape], svg: `<g class="sm-specimen">${svg}</g>` });
}

// ---------------------------------------------------------------- 4 column: pole piece, objective, scan coils, aperture, condensers, gun
// pole piece: a cone through the roof hole, cut like the rest
{
  const id = R.nameFor("column.pole-piece");
  const prof = [[POLE.z0, POLE.r0], [POLE.z1, POLE.r1], [POLE.top, POLE.r1]];
  const shape = record(A.body(FZ, [[POLE.z0, POLE.bore], [POLE.z0, POLE.r0], [POLE.z1, POLE.r1], [POLE.top, POLE.r1], [POLE.top, POLE.bore]], { name: id }));
  const section = [[POLE.bore, POLE.z0], [POLE.r0, POLE.z0], [POLE.r1, POLE.z1], [POLE.r1, POLE.top], [POLE.bore, POLE.top]];
  R.put({ at: [0, 0, (POLE.z0 + POLE.z1) / 2], name: id, shapes: [shape], svg: cutMarkup({ prof, section, cavity: { r: POLE.bore, z0: POLE.z0, z1: POLE.top }, hole: POLE.bore, tone: "hi" }) });
}
// BSE ring detector hung under the pole piece on an arm to the right wall
{
  const id = R.nameFor("bse.ring");
  const shape = record(A.ring(FZ, BSE.z0, BSE.z1, BSE.bore, BSE.R, { name: id }));
  const quads = [A1 + Math.PI / 2, A1 + Math.PI].map((a) => k.segment(pol(BSE.bore, a, BSE.z0), pol(BSE.R, a, BSE.z0), P)).join("");
  R.put({ at: [0, 0, (BSE.z0 + BSE.z1) / 2], name: id, shapes: [shape], svg: cutMarkup({ prof: [[BSE.z0, BSE.R], [BSE.z1, BSE.R]], section: ringSection(BSE.z0, BSE.z1, BSE.R, BSE.bore), cavity: { r: BSE.bore, z0: BSE.z0, z1: BSE.z1 }, hole: BSE.bore, tone: "hi", after: "" }) + L(quads, { tone: "faint" }) });
  // arm along (1, -1) from the ring rim to the right wall
  const dir = G.unit3([1, -0.55, 0]);
  const side = [-dir[1], dir[0], 0];
  const r0 = Math.sqrt(BSE.R ** 2 - 1.8 ** 2);
  const x1 = CH.x1 - CH.wall;
  const t1 = (x1 - r0 * dir[0] - 1.8 * Math.abs(side[0])) / dir[0];
  const a = G.add3(G.mul3(dir, r0), [0, 0, 0]);
  const b = G.add3(G.mul3(dir, r0 + t1), [0, 0, 0]);
  const ringPts = [G.add3(a, G.mul3(side, 1.8)), G.add3(b, G.mul3(side, 1.8)), G.add3(b, G.mul3(side, -1.8)), G.add3(a, G.mul3(side, -1.8))].map(([x, y]) => [x, y]);
  const aid = R.nameFor("bse.arm");
  const ashape = record(A.extruded(ringPts, BSE.z0 + 0.4, 1.8, { name: aid }));
  R.put({ at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, BSE.z0 + 1.3], name: aid, shapes: [ashape], svg: S(k.extrude(ringPts, BSE.z0 + 0.4, 1.8, P), { tone: "mid" }) });
}
// objective lens: iron yoke and copper coil, water fittings on the left
cutRing("column.objective", { ...OL, z0: OL.z0, z1: OL.z1, R: OL.R, bore: OL.bore, coils: [OL.coil], seams: [[OL.z0 + 4, OL.R], [OL.z1 - 4, OL.R]], bolts: { n: 9, r: OL.R - 2.6 } });
// scan coils: two deflector pairs (double deflection)
cutRing("column.scan-coils", { z0: SC.z0, z1: SC.z1, R: SC.R, bore: SC.bore, coils: SC.coils, seams: [[SC.z0 + 10, SC.R]] });
// aperture holder with the aperture strip across the bore and its drive out to the right
cutRing("column.aperture-holder", { z0: APH.z0, z1: APH.z1, R: APH.R, bore: APH.bore, bolts: { n: 7, r: APH.R - 2.4 }, inside: platePieces(APH.strip[0], APH.strip[1], APH.bore, APH.hole, "lo") });
{
  const a = -50 * DEG;
  const F = G.frameAlong(pol(APH.R, a, (APH.z0 + APH.z1) / 2), [Math.cos(a), Math.sin(a), 0]);
  discAt("aperture.drive-boss", F, 0, 3, 2.6, { tone: "mid" });
  discAt("aperture.drive-rod", F, 3, 13, 1.4, { tone: "hi" });
  discAt("aperture.micrometer", F, 13, 21, 3.4, { tone: "mid", extra: k.fadedSvg(G.ribsOf(F, 14, 20, 3.4, 22, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
  discAt("aperture.micrometer-cap", F, 21, 22.4, 2.4, { tone: "lo" });
}
// condenser 2, spacer, condenser 1, each lens with a bolted flange at its base
cutRing("column.c2-flange", { z0: C2.z0, z1: C2.z0 + C2.flange, R: C2.R + 3, bore: C2.bore, bolts: { n: 9, r: C2.R + 1.5 } });
cutRing("column.c2", { z0: C2.z0 + C2.flange, z1: C2.z1, R: C2.R, bore: C2.bore, coils: [[C2.coil[0], C2.coil[1], C2.coil[2] + 1, C2.coil[3]]], seams: [[C2.z1 - 4, C2.R]] });
cutRing("column.spacer", { z0: SPACER.z0, z1: SPACER.z1, R: SPACER.R, bore: SPACER.bore });
cutRing("column.c1-flange", { z0: C1.z0, z1: C1.z0 + C1.flange, R: C1.R + 3, bore: C1.bore, bolts: { n: 9, r: C1.R + 1.5 } });
cutRing("column.c1", { z0: C1.z0 + C1.flange, z1: C1.z1, R: C1.R, bore: C1.bore, coils: [[C1.coil[0], C1.coil[1], C1.coil[2] + 1, C1.coil[3]]], seams: [[C1.z1 - 4, C1.R]] });
// gun isolation valve with its pneumatic actuator on the left
{
  const a = 135 * DEG;
  const F = G.frameAlong(pol(Math.sqrt(VALVE.R ** 2 - 4.4 ** 2), a, (VALVE.z0 + VALVE.z1) / 2), [Math.cos(a), Math.sin(a), 0]);
  const parts = [[0, 5, 4.4, "mid"], [5, 26, 4, "hi"], [26, 28, 3.2, "lo"]];
  const after = parts.map(([s0, s1, r, tone]) => S(G.disc(s0, s1, r, F, P), { tone, })).join("") + D([at(G.pointOf(F, 28, 0, 0))], { size: 0.45 });
  const shapes = parts.map(([s0, s1, r], i) => record(A.disc(F, s0, s1, r, { name: `valve.actuator#${i}`, owner: "column.gun-valve" })));
  cutRing("column.gun-valve", { z0: VALVE.z0, z1: VALVE.z1, R: VALVE.R, bore: VALVE.bore, after, extraShapes: shapes });
}
// anode chamber with the anode plate, and the gun with insulator, emitter, suppressor and extractor
cutRing("column.anode-flange", { z0: ANODE.z0, z1: ANODE.z0 + ANODE.flange, R: ANODE.R + 3, bore: VALVE.bore, bolts: { n: 9, r: ANODE.R + 1.5 } });
cutRing("column.anode", { z0: ANODE.z0 + ANODE.flange, z1: ANODE.z1, R: ANODE.R, bore: ANODE.bore, inside: platePieces(ANODE.plate[0], ANODE.plate[1], ANODE.bore, ANODE.hole, "mid"), seams: [[ANODE.z1 - 3, ANODE.R]] });
{
  // gun housing: a cup (wall and lid) round the emitter; inside: ceramic insulator, emitter, suppressor, extractor
  const id = R.nameFor("column.gun");
  const zl = GUN.z1 - GUN.lid;
  const z0 = GUN.z0 + GUN.flange;
  const shape = record(A.body(FZ, [[z0, GUN.bore], [z0, GUN.R], [GUN.z1, GUN.R], [GUN.z1, 0], [zl, 0], [zl, GUN.bore]], { name: id }));
  const [i0, i1, ri0, ri1] = TIP.insulator;
  const insProf = [[i0, ri0], [i1, ri1]];
  const ins = cutMarkup({ prof: insProf, section: [[1.2, i0], [ri0, i0], [ri1, i1], [1.2, i1]], tone: "hi" });
  const insShape = record(A.solid(FZ, insProf, { name: `${id}.insulator`, owner: id }));
  const ext = platePieces(TIP.extractor[0], TIP.extractor[1], GUN.bore, TIP.extractor[2], "mid");
  // emitter: hairpin legs from the insulator, tungsten tip through the suppressor cap
  const legs = [-1.6, 1.6].map((x) => k.segment([x, -0.8, i0], [x * 0.4, -0.8, TIP.suppressor[1]], P)).join("");
  const [s0, s1, sr] = TIP.suppressor;
  const sup = S(G.solidOf([[s0, sr * 0.55], [s0 + 0.8, sr], [s1, sr]], FZ, P), { tone: "hi", crease: "lo" }) + D([iso3([0, 0, s0])], { size: 0.5, tone: "hi" });
  const supShape = record(A.solid(FZ, [[s0, sr], [s1, sr]], { name: `${id}.suppressor`, owner: id }));
  const legShapes = [record(A.tube([[-1.6, -0.8, i0], [-0.64, -0.8, s1]], 0.3, { name: `${id}.leg`, owner: id })), record(A.tube([[1.6, -0.8, i0], [0.64, -0.8, s1]], 0.3, { name: `${id}.leg#2`, owner: id }))];
  const tipD = k.segment([0, 0, s0 + 0.2], [0, 0, TIP.z], P);
  const inside = ext + ins + L(legs, { tone: "mid" }) + sup + L(tipD, { tone: "hi" });
  const section = [[GUN.bore, z0], [GUN.R, z0], [GUN.R, GUN.z1], [0, GUN.z1], [0, zl], [GUN.bore, zl]];
  R.put({ at: [0, 0, (z0 + GUN.z1) / 2], name: id, shapes: [shape, insShape, supShape, ...legShapes], svg: cutMarkup({ prof: [[z0, GUN.R], [GUN.z1, GUN.R]], section, cavity: { r: GUN.bore, z0, z1: zl }, hole: 0, tone: "hi", inside, seams: [[z0 + 4, GUN.R], [GUN.z1 - 3, GUN.R]] }) });
}
cutRing("column.gun-flange", { z0: GUN.z0, z1: GUN.z0 + GUN.flange, R: GUN.R + 3, bore: GUN.bore, bolts: { n: 9, r: GUN.R + 1.5 } });
// HV bushing on the gun lid (not cut), connector and the HV cable to the rack
turned("gun.bushing", FZ, [[BUSH.z0, BUSH.r0], [BUSH.z0 + 3, BUSH.r0], [BUSH.z1, BUSH.r1]], { tone: "hi", inner: L([BUSH.z0 + 7, BUSH.z0 + 11].map((z) => G.arcOf(FZ, z, BUSH.r0 + ((BUSH.r1 - BUSH.r0) * (z - BUSH.z0 - 3)) / (BUSH.z1 - BUSH.z0 - 3), P, { slope: (BUSH.r1 - BUSH.r0) / (BUSH.z1 - BUSH.z0 - 3) })).join(""), { tone: "faint" }) });
const HV_EB = 5;
const HV_C = [0, 0, BUSH.z1 + 5 + Math.sqrt(HV_EB ** 2 - 4.4 ** 2)];
{
  const id = R.nameFor("gun.hv-connector");
  const conn = S(G.disc(BUSH.z1, BUSH.z1 + 5, 4.4, FZ, P), { tone: "mid" }) + k.fadedSvg(G.ribsOf(FZ, BUSH.z1 + 0.6, BUSH.z1 + 4.4, 4.4, 24, P, { fade: [0.1, 0.55] }), { tone: "lo" });
  const ball = S(G.sphereOf(HV_C, HV_EB, P, { steps: G.stepsFor(HV_EB, 24) }), { tone: "mid" });
  R.put({ at: [0, 0, BUSH.z1 + 4], name: id, shapes: [record(A.disc(FZ, BUSH.z1, BUSH.z1 + 5, 4.4, { name: id, owner: "gun.hv" })), record(A.ball(HV_C, HV_EB, { name: `${id}.elbow`, owner: "gun.hv" }))], svg: conn + ball });
}
// ion getter pump on the gun's left, with its magnet yokes and a feed pipe into the gun wall
const IGP = { a: 135 * DEG, z: 294 };
{
  const F = G.frameAlong(pol(GUN.R, IGP.a, IGP.z), [Math.cos(IGP.a), Math.sin(IGP.a), 0]);
  discAt("gun.igp-neck", F, 0, 6, 3.2, { tone: "mid" });
  discAt("gun.igp-flange", F, 6, 8, 6, { tone: "mid", extra: D(G.dotsOf(F, 8, 4.8, 6, P, { fade: [0.04, 0.42] }), { size: 0.4 }) });
  discAt("gun.igp-body", F, 8, 12, 8, { tone: "hi" });
  discAt("gun.igp-magnet", F, 12, 20, 9.2, { tone: "mid", bevel: 0.3 });
  discAt("gun.igp-body", F, 20, 24, 8, { tone: "hi" });
  discAt("gun.igp-cap", F, 24, 26, 6.4, { tone: "lo", extra: L(G.circleOf(F, 26, 2.2, P, 20), { tone: "lo" }) });
  IGP.F = F;
}

// ---------------------------------------------------------------- 5 detectors: Everhart-Thornley (left wall), EDS (through the roof)
const ETD = { y: -10, z: 92, x0: CH.x1 - CH.wall, tip: 16 };
{
  const Fin = G.frameAlong([ETD.x0, ETD.y, ETD.z], [-1, 0, 0]);
  const len = ETD.x0 - ETD.tip;
  discAt("etd.boss", Fin, 0, 2, 6, { tone: "mid" });
  discAt("etd.guide", Fin, 2, len - 7, 2.6, { tone: "hi", inner: L(G.arcOf(Fin, 14, 2.6, P), { tone: "faint" }) });
  discAt("etd.scintillator", Fin, len - 7, len - 5.6, 3.4, { tone: "mid" });
  // Faraday cage: a mesh can round the scintillator, open toward the specimen
  const s0 = len - 5.6;
  const s1 = len;
  const cage = k.fadedSvg(G.ribsOf(Fin, s0, s1, 4.4, 20, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) + L([s0 + 1.9, s0 + 3.8].map((s) => G.arcOf(Fin, s, 4.4, P)).join(""), { tone: "faint" });
  discAt("etd.cage", Fin, s0, s1, 4.4, { tone: "mid", extra: cage });
  // photomultiplier outside the right wall
  const Fout = G.frameAlong([CH.x1, ETD.y, ETD.z], [1, 0, 0]);
  discAt("etd.flange", Fout, 0, 2, 7, { tone: "mid", extra: D(G.dotsOf(Fout, 2, 5.6, 6, P, { fade: [0.04, 0.42] }), { size: 0.4 }) });
  discAt("etd.pmt", Fout, 2, 30, 5.4, { tone: "hi", inner: L([8, 24].map((s) => G.arcOf(Fout, s, 5.4, P)).join(""), { tone: "faint" }) });
  discAt("etd.base", Fout, 30, 38, 4.6, { tone: "lo", inner: L(G.arcOf(Fout, 34, 4.6, P), { tone: "faint" }) });
  ETD.out = G.pointOf(Fout, 38, 0, 0);
}
// EDS: take-off 35°, azimuth -62°; a snout from the roof underside down toward the specimen, the detector above the roof
const EDS = { az: -62 * DEG, el: 35 * DEG, rs: 3.2, gap: 24 };
{
  const zSpot = POLE.z0 - M.DEFAULTS.wd * WD_UNIT;
  const d = [Math.cos(EDS.el) * Math.cos(EDS.az), Math.cos(EDS.el) * Math.sin(EDS.az), Math.sin(EDS.el)];
  const hitAt = (h) => G.add3([0, 0, zSpot], G.mul3(d, (h - zSpot) / d[2]));
  // inner: a boss hanging from the roof underside, a ball joint on it, the snout from the ball toward the specimen
  const bossR = 5;
  const ballR = 7;
  const drop = Math.sqrt(ballR ** 2 - bossR ** 2);
  const cIn = hitAt(ZR - 6 - drop);
  cyl("eds.inner-boss", cIn[0], cIn[1], bossR, ZR - 6, 6, { tone: "mid", owner: "eds.in" });
  ballAt("eds.inner-ball", cIn, ballR, { tone: "mid", owner: "eds.in" });
  const Fs = G.frameAlong(cIn, G.mul3(d, -1));
  const sRim = Math.sqrt(ballR ** 2 - EDS.rs ** 2);
  const snoutLen = (cIn[2] - zSpot) / d[2] - EDS.gap;
  discAt("eds.snout", Fs, sRim, snoutLen, EDS.rs, { tone: "hi", owner: "eds.in", inner: L(G.arcOf(Fs, snoutLen - 3, EDS.rs, P), { tone: "faint" }) });
  discAt("eds.window", Fs, snoutLen, snoutLen + 0.8, EDS.rs - 0.6, { tone: "lo", owner: "eds.in" });
  // outer: a boss on the roof, a ball joint, the slide tube, cooling fins, the head and its cable gland
  const cOut = hitAt(CH.z1 + 6 + drop);
  cyl("eds.outer-boss", cOut[0], cOut[1], bossR, CH.z1, 6, { tone: "mid", owner: "eds.out" });
  ballAt("eds.outer-ball", cOut, ballR, { tone: "mid", owner: "eds.out" });
  const Fo = G.frameAlong(cOut, d);
  const sO = Math.sqrt(ballR ** 2 - 5 ** 2);
  discAt("eds.slide", Fo, sO, 30, 5, { tone: "hi", owner: "eds.out", inner: L(G.arcOf(Fo, 20, 5, P), { tone: "faint" }) });
  discAt("eds.fins", Fo, 30, 42, 7, { tone: "mid", owner: "eds.out", extra: k.fadedSvg(G.ribsOf(Fo, 30, 42, 7, 28, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
  discAt("eds.head", Fo, 42, 52, 6.2, { tone: "hi", owner: "eds.out", inner: L(G.arcOf(Fo, 47, 6.2, P), { tone: "faint" }) });
  EDS.out = G.pointOf(Fo, 52, 0, 0);
  EDS.d = d;
}

// ---------------------------------------------------------------- 6 vacuum: turbo under the floor, rotary pump, gauges, load lock
const TURBO = { x: 24, y: -24, r: 13, flange: 16 };
cyl("turbo.flange", TURBO.x, TURBO.y, TURBO.flange, CH.z0 - 4, 4, { tone: "mid", bevel: 0.4, extra: D(Array.from({ length: 12 }, (_, i) => (i / 12) * TAU + 0.26).filter((a) => Math.cos(a - 45 * DEG) > -0.3).map((a) => at([TURBO.x + (TURBO.flange - 2) * Math.cos(a), TURBO.y + (TURBO.flange - 2) * Math.sin(a), CH.z0 - 4])), { size: 0.45 }) });
cyl("turbo.body", TURBO.x, TURBO.y, TURBO.r, 12, CH.z0 - 4 - 12, { tone: "hi", inner: L([16, 24].map((z) => k.sideArc(TURBO.x, TURBO.y, TURBO.r, z, P, 40)).join(""), { tone: "faint" }) });
cyl("turbo.motor", TURBO.x, TURBO.y, TURBO.r - 3, 6, 6, { tone: "lo", extra: L(k.knurl(TURBO.x, TURBO.y, TURBO.r - 3, 7, 11, 36, P), { tone: "faint" }) });
const TURBO_EX = G.frameAlong([TURBO.x + Math.sqrt(TURBO.r ** 2 - 2.6 ** 2), TURBO.y, 16], [1, 0, 0]);
discAt("turbo.exhaust", TURBO_EX, 0, 4, 2.6, { tone: "mid" });
// rotary vane pump under the load lock, right of the chamber: body, motor out the front, handle, oil window
const RV = { x: 70, y: -50, w: 50, d: 32, r: 3, h: 26 };
box("rotary.body", RV, 0, RV.h, {
  tone: "mid",
  bevel: 0.8,
  inner: L(k.sideSeam(RV, RV.h - 4, P, 3), { tone: "faint" }),
  extra: L(k.sideRing([RV.x + RV.w, RV.y + 10, 11], 3.6, "x", P, 28), { tone: "lo" }) + `<path class="sm-glass" d="${k.pathOf(Array.from({ length: 24 }, (_, i) => iso3([RV.x + RV.w, RV.y + 10 + 3 * Math.cos((i / 24) * TAU), 11 + 3 * Math.min(0, Math.sin((i / 24) * TAU))])), true)}"/>` + D([at([RV.x + 3, RV.y + RV.d, RV.h - 3]), at([RV.x + RV.w - 3, RV.y + RV.d, RV.h - 3])], { size: 0.45 }) + ventsRight(RV.x + RV.w, RV.y + 18, 3, 4, 6, 18),
});
{
  const mF = G.frameAlong([RV.x + 32, RV.y + RV.d, 12], [0, 1, 0]);
  discAt("rotary.motor", mF, 0, 18, 10, { tone: "hi", extra: k.fadedSvg(G.ribsOf(mF, 3, 15, 10, 28, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
  discAt("rotary.fan-cover", mF, 18, 22, 9, { tone: "lo", extra: L(G.circleOf(mF, 22, 4, P, 24), { tone: "faint" }) + D([at(G.pointOf(mF, 22, 0, 0))], { size: 0.5, tone: "mid" }) });
  box("rotary.handle", { x: RV.x + 30, y: RV.y + 4, w: 3, d: 24, r: 1 }, RV.h, 3, { tone: "hi", steps: 2, bevel: 0.2 });
}
const RV_IN = G.frameAlong([RV.x, TURBO.y, 16], [-1, 0, 0]);
discAt("rotary.inlet", RV_IN, 0, 3, 3.2, { tone: "mid" });
// foreline: turbo exhaust straight across to the rotary inlet
B.pipe("foreline", [G.pointOf(TURBO_EX, 4, 0, 0), G.pointOf(RV_IN, 3, 0, 0)], 1.8, { nutR: 2.4, tone: "mid", bend: 3 });
// load lock on the right wall, gate valve, lid, transfer rod
const LL = { x: CH.x1 + 6, y: -52, w: 22, d: 32, r: 1.5, z0: 48, z1: 76 };
box("loadlock.valve", { x: CH.x1, y: LL.y + 4, w: 6, d: LL.d - 8, r: 0.6 }, LL.z0 + 3, LL.z1 - LL.z0 - 6, { tone: "lo", steps: 2, bevel: 0.3, extra: D([[CH.x1 + 3, LL.y + 6, LL.z1 - 3], [CH.x1 + 3, LL.y + LL.d - 6, LL.z1 - 3]].map(at), { size: 0.4 }) });
box("loadlock.body", { x: LL.x, y: LL.y, w: LL.w, d: LL.d, r: LL.r }, LL.z0, LL.z1 - LL.z0, { tone: "hi", crease: "lo", bevel: 0.5, extra: D(k.corners({ x: LL.x, y: LL.y, w: LL.w, d: LL.d, r: 1 }, 2.4).map(([x, y]) => at([x, y, LL.z1])), { size: 0.42 }) + L(rounded(LL.x + 4, LL.z0 + 5, LL.x + LL.w - 4, LL.z1 - 5, 1.4, onFront(LL.y + LL.d)), { tone: "faint" }) });
{
  const F = G.frameAlong([LL.x + LL.w / 2, LL.y + LL.d / 2, LL.z1], [0, 0, 1]);
  discAt("loadlock.lid", F, 0, 2.4, 9, { tone: "mid", bevel: 0.3, extra: D(G.dotsOf(F, 2.4, 7.6, 8, P, { all: true }), { size: 0.4 }) });
  discAt("loadlock.knob", F, 2.4, 5.4, 3, { tone: "lo", extra: L(k.knurl(LL.x + LL.w / 2, LL.y + LL.d / 2, 3, LL.z1 + 2.8, LL.z1 + 5, 20, P), { tone: "faint" }) });
  const rodF = G.frameAlong([LL.x + LL.w, LL.y + LL.d / 2, (LL.z0 + LL.z1) / 2], [1, 0, 0]);
  discAt("loadlock.gland", rodF, 0, 5, 3.6, { tone: "mid" });
  discAt("loadlock.rod", rodF, 5, 28, 1.3, { tone: "hi" });
  discAt("loadlock.handle", rodF, 28, 36, 3.4, { tone: "mid", extra: k.fadedSvg(G.ribsOf(rodF, 29, 35, 3.4, 22, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
}
const LL_PORT = G.frameAlong([LL.x + 6, LL.y + 8, LL.z0], [0, 0, -1]);
discAt("loadlock.rough-port", LL_PORT, 0, 3, 2.2, { tone: "mid" });
const RV_IN2 = G.frameAlong([LL.x + 6, LL.y + 8, RV.h], [0, 0, 1]);
discAt("rotary.inlet-2", RV_IN2, 0, 3, 2.4, { tone: "mid" });
B.pipe("roughing", [G.pointOf(LL_PORT, 3, 0, 0), G.pointOf(RV_IN2, 3, 0, 0)], 1.2, { nutR: 2.0, tone: "mid", bend: 4 });
// vacuum gauges on the roof, and the vent valve fed from the nitrogen bottle at the front left
const GAUGES = [{ x: -40, y: -40, r: 4.2, h: 14, name: "gauge.pirani" }, { x: -46, y: 16, r: 5, h: 16, name: "gauge.penning" }];
for (const g of GAUGES) {
  cyl(`${g.name}-collar`, g.x, g.y, g.r + 1.6, CH.z1, 2, { tone: "lo", bevel: 0.3 });
  cyl(g.name, g.x, g.y, g.r, CH.z1 + 2, g.h, { tone: "mid", inner: L(k.sideArc(g.x, g.y, g.r, CH.z1 + 7, P, 24), { tone: "faint" }), extra: L(k.ring(g.x, g.y, g.r - 1.6, CH.z1 + 2 + g.h, P, 24), { tone: "lo" }) + D([at([g.x, g.y, CH.z1 + 2 + g.h])], { size: 0.5, tone: "mid" }) });
}
const VENT = { x: -24, y: 30 };
cyl("vent.valve", VENT.x, VENT.y, 4, CH.z1, 8, { tone: "mid", bevel: 0.3, inner: L(k.sideArc(VENT.x, VENT.y, 4, CH.z1 + 3, P, 24), { tone: "faint" }) });
cyl("vent.port", VENT.x, VENT.y, 2.2, CH.z1 + 8, 2.5, { tone: "lo" });
const N2 = { x: -86, y: 30, r: 11, h: 120 };
const N2_TOP = B.bottle("n2", { x: N2.x, y: N2.y, z0: 0, r: N2.r, body: N2.h, shoulder: 10, neck: 3.4, neckH: 3, cap: 4, capH: 5, knurl: 22, capDot: null, level: 10, bands: [N2.h - 12], port: 1.8, portName: "valve" });
const N2_REG = { x: N2.x - 5, y: N2.y - 4, w: 10, d: 8, r: 1, z: N2_TOP[2] };
box("n2.regulator", N2_REG, N2_REG.z, 9, { tone: "hi", crease: "lo", bevel: 0.3 });
{
  const F = G.frameAlong([N2.x + 1.5, N2_REG.y + N2_REG.d, N2_REG.z + 4.5], [0, 1, 0]);
  discAt("n2.gauge", F, 0, 2, 2.6, { tone: "mid", extra: L(G.circleOf(F, 2, 2, P, 20), { tone: "lo" }) + L(k.segment(G.pointOf(F, 2, 0, 0), G.pointOf(F, 2, 1.6, 2.2), P), { tone: "hi", free: "end" }) });
}
const N2_OUT = G.frameAlong([N2_REG.x + N2_REG.w, N2.y, N2_REG.z + 4.5], [1, 0, 0]);
discAt("n2.outlet", N2_OUT, 0, 2, 1.4, { tone: "mid" });
B.pipe("vent-line", [G.pointOf(N2_OUT, 2, 0, 0), [VENT.x, N2.y, N2_REG.z + 4.5], [VENT.x, VENT.y, CH.z1 + 10.5]], 0.8, { bend: 5, nutR: 1.4 });

// ---------------------------------------------------------------- 7 electronics rack at the back left
const RACK = { x: -242, y: -42, w: 68, d: 72, r: 2, h: 128 };
{
  const front = RACK.y + RACK.d;
  const side = RACK.x + RACK.w;
  for (const [x, y] of k.corners(RACK, 6)) cyl("rack.foot", x, y, 3.4, 0, 4, { tone: "lo", steps: 16 });
  box("rack.cabinet", RACK, 4, RACK.h - 4, { tone: "mid", bevel: 0.8, inner: L(k.sideSeam(RACK, RACK.h - 8, P, 3), { tone: "faint" }), extra: ventsRight(side, RACK.y + 40, 6, 4.6, RACK.h - 34, RACK.h - 14) + ventsRight(side, RACK.y + 40, 6, 4.6, 16, 36) + D([[side, RACK.y + 4, 8], [side, RACK.y + RACK.d - 4, 8], [side, RACK.y + 4, RACK.h - 6], [side, RACK.y + RACK.d - 4, RACK.h - 6]].map(at), { size: 0.42 }) });
  // modules on the front: HV supply, lens supplies, scan generator, detector amps, vacuum controller
  const mods = [[96, 122, "hv"], [68, 92, "lens"], [40, 64, "scan"], [12, 36, "vac"]];
  for (const [z0, z1, key] of mods) {
    const x0 = RACK.x + 4;
    const x1 = RACK.x + RACK.w - 4;
    box(`rack.${key}`, { x: x0, y: front, w: x1 - x0, d: 1.6, r: 0.4 }, z0, z1 - z0, {
      tone: key === "hv" ? "hi" : "mid",
      steps: 2,
      bevel: 0,
      crease: key === "hv" ? "lo" : "faint",
      extra:
        D([[x0 + 2.4, z0 + 2.4], [x1 - 2.4, z0 + 2.4], [x0 + 2.4, z1 - 2.4], [x1 - 2.4, z1 - 2.4]].map(([x, z]) => at([x, front + 1.6, z])), { size: 0.4 }) +
        L(rounded(x0 + 6, z0 + (z1 - z0) / 2 - 3, x0 + 26, z0 + (z1 - z0) / 2 + 4, 1, onFront(front + 1.6)), { tone: "lo" }) +
        D([at([x1 - 8, front + 1.6, z1 - 6])], { size: 0.75, tone: key === "hv" ? "hi" : "mid" }),
    });
    for (const dx of [36, 48]) {
      const F = G.frameAlong([x0 + dx, front + 1.6, z0 + (z1 - z0) / 2], [0, 1, 0]);
      discAt(`rack.${key}-knob`, F, 0, 2.6, 2.6, { tone: "lo", extra: L(G.circleOf(F, 2.6, 1.2, P, 16), { tone: "mid" }) });
    }
  }
  box("rack.top", { x: RACK.x - 1, y: RACK.y - 1, w: RACK.w + 2, d: RACK.d + 2, r: 2.4 }, RACK.h, 3, { tone: "mid", bevel: 0.5 });
}
const RACK_TOP = RACK.h + 3;
// ports on the rack's right side and top for the cables
const rackPort = (name, y, z) => ({ name, at: [RACK.x + RACK.w, y, z], dir: [1, 0, 0], ring: true });

// ---------------------------------------------------------------- 8 monitor turned toward the viewer, control console
const MB = RACK_TOP; // the monitor stands on the rack
const MON = { c: [-200, 4], half: 56, t: 8, z0: MB + 18, z1: MB + 108, screen: { u0: -50, u1: 50, z0: MB + 23, z1: MB + 103 }, img: { u0: -48, u1: 48, z0: MB + 30, z1: MB + 102 } };
const U = G.unit3([1, -1, 0]);
const N = G.unit3([1, 1, 0]);
const onMon = (u, n, z) => [MON.c[0] + U[0] * u + N[0] * n, MON.c[1] + U[1] * u + N[1] * n, z];
const monRing = (u0, u1, n0, n1) => [[u0, n0], [u1, n0], [u1, n1], [u0, n1]].map(([u, n]) => onMon(u, n, 0).slice(0, 2));
{
  const baseRing = monRing(-26, 26, -26, 4);
  const id = R.nameFor("monitor.base");
  R.put({ at: [...onMon(0, -11, MB + 2.5)], name: id, shapes: [record(A.extruded(baseRing, MB, 5, { name: id }))], svg: S(k.extrude(baseRing, MB, 5, P, { bevel: 0.5 }), { tone: "lo" }) + D([onMon(-22, 0, MB + 5), onMon(22, 0, MB + 5)].map(iso3), { size: 0.45 }) });
  const nc = onMon(0, -14, 0);
  cyl("monitor.neck", nc[0], nc[1], 4.4, MB + 5, MON.z0 + 2 - MB - 5, { tone: "mid", inner: L(k.sideArc(nc[0], nc[1], 4.4, MB + 9, P, 24), { tone: "faint" }) });
  const backRing = monRing(-20, 20, -18, -MON.t);
  const bid = R.nameFor("monitor.back");
  R.put({ at: onMon(0, -13, (MON.z0 + MON.z1) / 2), name: bid, shapes: [record(A.extruded(backRing, MON.z0 + 2, MON.z1 - MON.z0 - 12, { name: bid }))], svg: S(k.extrude(backRing, MON.z0 + 2, MON.z1 - MON.z0 - 12, P, { bevel: 0.4 }), { tone: "mid" }) });
  const bodyRing = monRing(-MON.half, MON.half, -MON.t, 0);
  const mid = R.nameFor("monitor.body");
  const sc = MON.screen;
  const face = (u0, z0, u1, z1, r) => k.pathOf(k.roundedPlan({ x: u0, y: z0, w: u1 - u0, d: z1 - z0, r }, 6).map(([u, z]) => iso3(onMon(u, 0, z))), true);
  const bezel = L(face(sc.u0 - 2.4, sc.z0 - 2.4, sc.u1 + 2.4, sc.z1 + 2.4, 2.4), { tone: "lo" });
  const buttons = L([-44, -37, -30].map((u) => face(u - 2.2, MON.z0 + 1.4, u + 2.2, MON.z0 + 3, 0.8)).join(""), { tone: "lo" });
  R.put({ at: onMon(0, -MON.t / 2, (MON.z0 + MON.z1) / 2), name: mid, shapes: [record(A.extruded(bodyRing, MON.z0, MON.z1 - MON.z0, { name: mid }))], svg: S(k.extrude(bodyRing, MON.z0, MON.z1 - MON.z0, P, { bevel: 0.5 }), { tone: "mid" }) + bezel + buttons + D([iso3(onMon(46, 0, MON.z0 + 2.2))], { size: 0.75, tone: "hi" }) });
  // the screen in the face plane: local (u, -z)
  const o = iso3(onMon(0, 0, 0));
  const eu = G.sub3([...iso3(onMon(1, 0, 0)), 0], [...o, 0]);
  const ez = G.sub3([...iso3(onMon(0, 0, 1)), 0], [...o, 0]);
  const matrix = `matrix(${eu[0].toFixed(5)} ${eu[1].toFixed(5)} ${(-ez[0]).toFixed(5)} ${(-ez[1]).toFixed(5)} ${o[0].toFixed(3)} ${o[1].toFixed(3)})`;
  const im = MON.img;
  const win = k.pathOf(k.roundedPlan({ x: sc.u0, y: -sc.z1, w: sc.u1 - sc.u0, d: sc.z1 - sc.z0, r: 1.6 }, 6), true);
  const text = (x, y, s, anchor = "start", part = "") => `<text class="sm-lcd-text"${part ? ` data-part="${part}"` : ""} x="${x}" y="${y}" font-size="2.9"${anchor !== "start" ? ` text-anchor="${anchor}"` : ""}>${s}</text>`;
  const bar = -(sc.z0 + 3.4);
  const screen =
    `<g transform="${matrix}"><clipPath id="sm-screen"><path d="${win}"/></clipPath><path class="sm-lcd-bg" d="${win}"/><g clip-path="url(#sm-screen)">` +
    `<image class="sm-img" data-part="image" x="${im.u0}" y="${-im.z1}" width="${im.u1 - im.u0}" height="${im.z1 - im.z0}" preserveAspectRatio="none" href=""/>` +
    `<rect class="sm-scanline" data-part="scanline" x="${im.u0}" y="${-im.z1}" width="${im.u1 - im.u0}" height="0.5"/>` +
    text(sc.u0 + 2, bar + 1, "", "start", "lcd-kv") + text(sc.u0 + 19, bar + 1, "", "start", "lcd-mag") + text(sc.u0 + 40, bar + 1, "", "start", "lcd-det") + text(sc.u1 - 14, bar + 1, "", "start", "lcd-bar-text") +
    `<rect class="sm-lcd-bar" data-part="lcd-bar" data-right="${sc.u1 - 16}" x="${sc.u1 - 26}" y="${bar - 0.6}" width="10" height="0.9"/>` +
    `</g></g>` +
    L(face(sc.u0, sc.z0, sc.u1, sc.z1, 1.6), { tone: "lo" });
  const sid = R.nameFor("monitor.screen");
  R.put({ at: onMon(0, 0.1, (sc.z0 + sc.z1) / 2), name: sid, bias: 0.5, shapes: [record(A.extruded(monRing(sc.u0, sc.u1, 0, 0.1), sc.z0, sc.z1 - sc.z0, { name: sid }))], svg: screen });
  Object.assign(MON, { matrix });
}
// control console in front of the monitor: focus, magnification and contrast knobs, a trackball
const CON = { x: -228, y: 44, w: 46, d: 22, r: 2, h: 7 };
box("console.body", CON, 0, CON.h, { tone: "mid", bevel: 0.6, inner: L(k.sideSeam(CON, 2.4, P, 3), { tone: "faint" }), extra: L(k.planOutline(k.insetPlan(CON, 2.6), CON.h, P, 3), { tone: "faint" }) });
for (const [x, i] of [[CON.x + 7, 0], [CON.x + 17, 1], [CON.x + 27, 2]]) {
  cyl("console.knob", x, CON.y + 15, 3.2, CON.h, 3.6, { tone: i === 1 ? "hi" : "mid", extra: L(k.knurl(x, CON.y + 15, 3.2, CON.h + 0.5, CON.h + 3.1, 22, P), { tone: "faint" }) + L(k.lineOnTop([x, CON.y + 15], [x, CON.y + 12.6], CON.h + 3.6, P), { tone: "hi", free: "end" }) });
}
{
  const c = [CON.x + 38, CON.y + 11];
  ballAt("console.trackball", [...c, CON.h + 3.6], 3.6, { tone: "hi" });
}

// ---------------------------------------------------------------- 9 cables
// HV cable: an elbow ball on the gun connector, out to the left and down to the rack's right side
{
  const eb = HV_EB;
  const c = HV_C;
  const start = [-Math.sqrt(eb ** 2 - 1.5 ** 2), 0, c[2]];
  const port = rackPort("rack.hv-port", RACK.y + 12, 100);
  const F = G.frameAlong(port.at, port.dir);
  discAt("rack.hv-port", F, 0, 2.5, 3, { tone: "mid", extra: L(G.circleOf(F, 2.5, 1.8, P, 16), { tone: "faint" }) });
  const end = G.pointOf(F, 2.5, 0, 0);
  const route = G.fillet([start, [-70, 0, c[2]], [end[0] + 30, end[1], end[2]], end], 20, 14, { P, tube: 1.5 });
  tubeItems("cable.hv", route, 1.5, { tone: "mid", limp: true, maxLength: 14, rims: [1.5, 1.5] });
}
// ETD signal: PMT base → rack side
line("cable.etd", { name: "etd.socket", at: ETD.out, dir: [1, 0, 0], portR: 1.6 }, { ...rackPort("rack.etd-port", RACK.y + 34, 8), name: "rack.etd-port" }, [[128, ETD.y, ETD.z], [128, ETD.y, 1.1], [128, -134, 1.1], [-152, -134, 1.1], [-152, RACK.y + 34, 1.1], [-152, RACK.y + 34, 8]], { r: 0.7, tone: "mid", bend: 5 });
// EDS cable: detector head → behind the chamber → rack side
{
  const via = G.add3(EDS.out, G.mul3(EDS.d, 14));
  line("cable.eds", { name: "eds.socket", at: EDS.out, dir: EDS.d, portR: 1.6 }, { ...rackPort("rack.eds-port", RACK.y + 4, 112), name: "rack.eds-port" }, [via, [-128, via[1], via[2]], [-128, via[1], 112], [-128, RACK.y + 4, 112]], { r: 0.7, tone: "mid", bend: 10 });
}
// console → rack front
line("cable.console", { name: "console.port", at: [CON.x + 10, CON.y, 7], dir: [0, -1, 0], portR: 1.4 }, { name: "rack.console-port", at: [CON.x + 10, RACK.y + RACK.d, 7], dir: [0, 1, 0], portR: 1.4, ring: true }, [], { r: 0.55, tone: "mid" });

// ---------------------------------------------------------------- settle, sort, beam layer, page
const BODY = B.settle();
// the lit layer, drawn over everything (nothing in the figure lies in front of the axis): beam, electrons, spot, interaction volume
const BEAM = `<g class="sm-beam" data-part="beam" aria-hidden="true"><path class="sm-env" data-part="env" d=""/><path class="sm-core" data-part="core" d=""/><path class="sm-pear" data-part="pear" d=""/><path class="sm-pear-edge" data-part="pear-edge" d=""/><path class="sm-dots" data-part="dots" d=""/><path class="sm-halo" data-part="halo" d=""/><path class="sm-spot" data-part="spot" d=""/></g>`;
const LABEL =
  "A scanning electron microscope on a vibration-isolated plinth, drawn with the front-right quarter of its column, specimen chamber, backscatter detector and specimen cut away along two planes through the electron-optical axis. From the top: the high-voltage cable on a ceramic bushing, the gun with a Schottky field emitter under its suppressor cap (the Wehnelt), the extractor and anode plates, an ion getter pump on the gun's side, the gun isolation valve, two condenser lenses and the objective lens drawn as copper coils in iron yokes, an aperture strip with its micrometer drive, double-deflection scan coils and the conical pole piece. The lit electron beam runs down the axis through every lens, swings with the scan, and lands as a spot on a silicon specimen dotted with gold particles; the pear-shaped interaction volume shows on the specimen's cut faces. Under the pole piece hangs an annular backscatter detector on an arm; an Everhart-Thornley detector with its Faraday cage comes in through the right wall, its photomultiplier outside, and an EDS detector looks down through the roof on ball joints. The stage has X and Y slides with stepper motors, a tilt cradle, a rotation table and a lift that sets the working distance. A closed door with a viewport is on the front wall; on the right wall a load lock with its gate valve and transfer rod; a turbomolecular pump hangs under the floor and is backed by a rotary pump that also roughs the load lock; two vacuum gauges and a vent valve fed from a nitrogen bottle sit on the roof. At the left an electronics rack carries the monitor, turned toward the viewer, which shows the SEM image building line by line, and a console with focus and magnification knobs and a trackball sits in front of it.";
const svg = k.figureSvg({ width: W, height: H, label: LABEL, body: [...back, BODY, BEAM], className: "sm-svg" });

// ---------------------------------------------------------------- live data
const IMG = { w: 160, h: 120 };
const DATA = {
  P,
  img: IMG,
  axis: { tip: TIP.z, scan: [SC.coils[0][2] / 2 + SC.coils[0][3] / 2, SC.coils[1][2] / 2 + SC.coils[1][3] / 2], pivot: (OL.z0 + OL.z1) / 2 + 6, pole: POLE.z0 },
  // beam envelope half-widths (world units) at heights from the tip down: crossovers under each condenser, aperture cut, focus at the specimen
  envelope: [[TIP.z, 0.12], [C1.z1, 0.9], [C1.z0 + 12, 1.2], [C1.z0 - 3, 0.14], [C2.z1, 0.8], [C2.z0 + 10, 1.0], [C2.z0 - 1, 0.18], [APH.strip[1], 0.55], [APH.strip[0], 0.32], [OL.z1, 0.62], [(OL.z0 + OL.z1) / 2, 0.75]],
  bores: { pole: POLE.bore },
  lift: { rest: ZS_REST, unit: WD_UNIT, wdRest: M.LIMITS.wd[1], move: LIFT_MOVE },
  spec: { R: SPEC.R, h: SPEC.h },
  pearMax: SPEC.h - 0.8, // drawn depth at the deepest interaction volume (30 kV)
  scanA: 2.0, // drawn half-swing of the spot on the specimen (illustrative)
  lineRate: 40, // image lines per second (illustrative)
  defaults: M.DEFAULTS,
  limits: M.LIMITS,
};
const MODEL = moduleText(join(HERE, "model.mjs"));
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const CSS = readFileSync(join(HERE, "sem.css"), "utf8");

const r0 = M.run(M.DEFAULTS);
const fmtMag = (m) => `${Math.round(m).toLocaleString("en-US").replace(/,/g, " ")}×`;
const fmtTorr = (t) => `${(t / 10 ** Math.floor(Math.log10(t))).toFixed(0)}e${Math.floor(Math.log10(t))}`;
const readout0 = `${M.DEFAULTS.kV} kV · ${M.DEFAULTS.pA} pA · probe ${r0.probeNm.toFixed(1)} nm · depth ${r0.depthUm.toFixed(2)} µm · ${fmtMag(M.DEFAULTS.mag)} · ${fmtTorr(r0.pressures[2].torr)} Torr`;
const PA_STEPS = 100; // the current slider is logarithmic: 0..100 → 1..2000 pA
const paToSlider = (pA) => Math.round((Math.log(pA / M.LIMITS.pA[0]) / Math.log(M.LIMITS.pA[1] / M.LIMITS.pA[0])) * PA_STEPS);
let controls = controlsHtml(
  [
    { key: "kV", name: "Beam", min: M.LIMITS.kV[0], max: M.LIMITS.kV[1], step: 1, value: M.DEFAULTS.kV, text: `${M.DEFAULTS.kV} kV`, valuetext: `${M.DEFAULTS.kV} kilovolts` },
    { key: "pA", name: "Probe current", min: 0, max: PA_STEPS, step: 1, value: paToSlider(M.DEFAULTS.pA), text: `${M.DEFAULTS.pA} pA`, valuetext: `${M.DEFAULTS.pA} picoamperes` },
    { key: "wd", name: "Working distance", min: M.LIMITS.wd[0], max: M.LIMITS.wd[1], step: 1, value: M.DEFAULTS.wd, text: `${M.DEFAULTS.wd} mm`, valuetext: `${M.DEFAULTS.wd} millimetres` },
  ],
  `field of view ${(M.fov(M.DEFAULTS.mag) / 1000).toFixed(2)} µm · ${Math.round(r0.electrons)} electrons per pixel · SE yield Si ${M.seYield(M.DEFAULTS.kV, "si").toFixed(2)}`,
);
controls = controls.replace(
  '<span class="bx-note"',
  `<fieldset class="sm-seg" data-group="det"><legend class="bx-ctl-name">Detector</legend><label><input type="radio" name="sm-det" value="se" checked><span>SE</span></label><label><input type="radio" name="sm-det" value="bse"><span>BSE</span></label></fieldset>\n<span class="bx-note"`,
);
const stage = stageHtml(svg, {
  label: "Scanning electron microscope. Left and right arrow keys set the magnification on a log scale; Shift for bigger steps, Home and End for the limits.",
  min: M.LIMITS.mag[0],
  max: M.LIMITS.mag[1],
  now: M.DEFAULTS.mag,
  valuetext: `${fmtMag(M.DEFAULTS.mag)}, field of view ${(M.fov(M.DEFAULTS.mag) / 1000).toFixed(2)} micrometres`,
});
const vol = (kV) => M.volume(kV, "si").depth;
const page = pageOf({
  title: "Scanning electron microscope",
  theme: THEME,
  width: 980,
  css: CSS,
  plate: {
    fig: "Fig 5",
    title: "SEM · Schottky FEG, SE / BSE",
    hint: "← → magnification · sliders · SE/BSE",
    readout: readout0,
    keys: [
      { mark: "lit", label: "Electron beam: from the emitter tip through both condensers, the aperture and the scan coils, swinging with the scan, to the spot and its interaction volume in the specimen" },
      { mark: "raised", label: "Column, chamber, BSE ring and specimen drawn with the front-right quarter cut away; lens coils shown as windings in their iron yokes" },
      { mark: "edge", label: "HV cable, detector and video cables, foreline and roughing line to the rotary pump" },
    ],
    caption: `Interaction depth is the Kanaya-Okayama range in silicon: ${vol(1).toFixed(3)} µm at 1 kV, ${vol(10).toFixed(2)} µm at 10 kV, ${vol(20).toFixed(2)} µm at 20 kV and ${vol(30).toFixed(1)} µm at 30 kV (gold ${M.kanayaRange(20, "au").toFixed(2)} µm at 20 kV); the pear is drawn on a square-root scale so 1 kV still shows. Probe size adds source, spherical, chromatic and diffraction terms in quadrature: ${M.probe({ ...M.DEFAULTS }).total.toFixed(1)} nm at ${M.DEFAULTS.kV} kV, ${M.DEFAULTS.pA} pA and WD ${M.DEFAULTS.wd} mm; more kV shrinks it (${M.probe({ ...M.DEFAULTS, kV: 30 }).total.toFixed(1)} nm at 30 kV), more current fattens it (${M.probe({ ...M.DEFAULTS, pA: 2000 }).total.toFixed(1)} nm at 2000 pA) but brings more electrons per pixel and less shot noise. Backscatter rises with atomic number (η Si ${M.eta(14).toFixed(3)}, Au ${M.eta(79).toFixed(3)}), so BSE shows the gold particles bright; SE shows topography with bright edges. The image is a ${IMG.w} × ${IMG.h} raster of gold spheres on silicon from the model, rescanned at an illustrative ${DATA.lineRate} lines per second (a real ${M.DISPLAY.dwellUs} µs dwell would take ${((IMG.w * IMG.h * M.DISPLAY.dwellUs) / 1e6).toFixed(2)} s); the beam's swing and the electrons' speed are drawn, not to scale. Working distance lifts the stage (1 drawn unit per mm). Vacuum: gun ${fmtTorr(r0.pressures[0].torr)}, column ${fmtTorr(r0.pressures[1].torr)}, chamber ${fmtTorr(r0.pressures[2].torr)} Torr. The cut-away quarter and the door are drawing conventions; in use the chamber is closed and pumped.`,
    body: stage + controls,
  },
  script: scriptOf(kitScript(), MODEL, LIVE_CORE, LIVE),
});
const name = THEME === "light" ? "sem-light.html" : "sem.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${R.solids.length} solids`, `${R.tubes.length} tube runs`);

A.auditOrExit(R, P);
