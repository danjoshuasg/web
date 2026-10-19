// Benchtop powder X-ray diffractometer (Bragg-Brentano, theta-theta): an isometric Hero figure built with the anatomy kit.
// node xrd/build.mjs [--light] [--audit]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import * as A from "../kit/audit.mjs";
import { kitScript } from "../scripts/inline-kit.mjs";
import { makeBench, moduleText, LIVE_CORE, controlsHtml, stageHtml, pageOf, scriptOf } from "../common/bench.mjs";
import * as M from "./model.mjs";
import { makeGonio } from "./gonio.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- world plan (x along the bench, y toward the viewer, z up)
const W = 900;
const H = 600;
const AZIMUTH = 60;
const ELEVATION = 30;

const BENCH = { x: -240, y: -122, w: 490, d: 190, r: 8 };
const BENCH_H = 10;
const FOOT_H = 5;

// shielded enclosure on its plinth: front wall cut away, lead-glass lid raised on its back hinge
const CH = { x0: -122, x1: 122, y0: -86, y1: 24, wall: 5 };
const PLINTH_H = 14;
const ZF = PLINTH_H + 6; // enclosure floor top
const ZW = 176; // wall tops
const CHP = { x: CH.x0, y: CH.y0, w: CH.x1 - CH.x0, d: CH.y1 - CH.y0, r: 2 };
const IN = { x0: CH.x0 + CH.wall, x1: CH.x1 - CH.wall, y0: CH.y0 + CH.wall };
const ROOF_Y = -44; // fixed steel roof over the back, from the back wall to here
const LID = { open: 180 * DEG, hinge: [ROOF_Y, ZW + 2.5], t: 5 }; // flipped back flat onto the roof

// goniometer: axis along y at height ZA; the beam plane (sample centre) at y = YB
const ZA = 74;
const YB = -4;
const HOUSING = { x: -38, y: -54, w: 76, d: 20, r: 2, top: 112 }; // body behind the face plate
const FACE = { y0: -34, y1: -30, r: 34 };
const ARC = { y0: -35, y1: -31, r0: 90, r1: 96, step: 5 };
const UNION = { y0: -60, y1: -54, r: 13 };
const GON = {
  za: ZA,
  yb: YB,
  tube: { slit: [23, 25.5], soller: [29, 39], filter: [41.5, 42.7], be: [44.4, 45, 3.4], nose: [45, 49, 5.5], shield: [49, 79, 8], fins: [51, 54, 57], fin: 10.5, bands: [[67.2, 68.6, 8.5]], cap: [79, 82, 5.5] },
  det: { anti: [23, 25.5], soller: [29, 39], recv: [42, 43.5], body: [46, 68], half: 8, fins: [50, 52, 54, 56, 58, 60, 62, 64], conn: [68, 70.5, 3] },
  tubeArm: {
    wheel: { y0: -25, y1: -21, r: 20, teeth: 56, bolts: 6, nut: [1, 7] },
    plate: { y0: -25, y1: -21, r0: 16, tip: 94, w: 10 },
    rail: [21, 44],
    brackets: [[61, 65], [72, 76]],
    seat: 8,
    jumpers: [
      { name: "water-in", r: 87, w: -4.2, radius: 1, gland: 1.8, from: 82, tone: "mid" },
      { name: "hv", r: 87, w: 0, radius: 1.25, gland: 2, from: 82, tone: "mid" },
      { name: "water-out", r: 87, w: 4.2, radius: 1, gland: 1.8, from: 82, tone: "mid" },
    ],
  },
  detArm: {
    wheel: { y0: -29, y1: -25, r: 26, teeth: 72, bolts: 8, axle: [-30, -29, 6] },
    plate: { y0: -29, y1: -25, r0: 16, tip: 94, w: 10 },
    rail: [21, 44.5],
    brackets: [[51, 55], [61, 65]],
    seat: 8,
    jumpers: [{ name: "signal", r: 75, w: 0, radius: 0.8, gland: 1.6, from: 70.5, tone: "mid" }],
  },
  worm: { y: -25, z: 45, r: 3, x: 14, block: 3, blockY: [-30, -21], blockZ: [39, 51], motor: { x: [17, 35], y: [-30, -18], z: [38, 52] } },
  stage: {
    base: { x: -16, y: -18, w: 32, d: 28, r: 2 },
    z0: ZF,
    baseH: 6,
    column: 5,
    spinZ: 63,
    spinR: 9,
    spinH: 6,
    plateR: 15,
    plateH: 2,
    holderR: 12.5,
    wellR: 8,
    grains: [[-4.2, 1.1], [-1.6, -3.4], [2.4, 2.6], [4.6, -1.2], [0.4, 0.2], [-2.8, 4.4], [1.8, -5.6], [5.4, 3.4], [-5.6, -2.6], [-0.8, 6]],
  },
};
const WORM_RATIO = GON.detArm.wheel.teeth; // single-start worm: one worm turn per tooth

// side units on the bench
const CHILL = { x: -218, y: -44, w: 68, d: 64, r: 3, h: 72 };
const HVG = { x: 160, y: -108, w: 66, d: 68, r: 3, h: 64 };
const TRAY = { x: -226, y: 30, w: 74, d: 28, r: 2, h: 4 };
const POCKETS = [-213, -196, -179, -162].map((x, i) => ({ x, y: 44, sample: Object.keys(M.SAMPLES)[i] }));

const P = k.fitProjection(
  [...k.boxCorners(BENCH, -BENCH_H - FOOT_H, 0), [CH.x0, -114, ZW + 8], [CH.x1, -114, ZW + 8], [BENCH.x + BENCH.w, 46, 84]],
  W,
  H,
  { pad: 22, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const R = A.recorder(P);
const B = makeBench(P, R, KS, { bench: BENCH, benchH: BENCH_H, footH: FOOT_H, ns: "xd" });
const { at, S, L, D, rounded, onFront, onRight, record, box, cyl, discAt, put } = B;
const add = G.add3;
const mul = G.mul3;

// a prism of polygon [[u, v]] in frame F from s0 to s1
function prism(name, F, poly, s0, s1, { tone = "mid", extra = "", inner = "", owner } = {}) {
  const id = R.nameFor(name);
  const shape = record(A.prism(F, poly, s0, s1, { name: id, owner }));
  const cu = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cv = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const c = add(add(F.o, mul(F.a, (s0 + s1) / 2)), add(mul(F.u, cu), mul(F.v, cv)));
  R.put({ at: c, name: id, shapes: [shape], svg: S(G.prismOf(F, poly, s0, s1, P), { tone, inner }) + extra });
  return shape;
}
const ventsFront = (y, x0, n, gap, z0, z1) => L(Array.from({ length: n }, (_, i) => rounded(x0 + i * gap, z0, x0 + i * gap + 1.4, z1, 0.7, onFront(y))).join(""), { tone: "faint" });
const ventsRight = (x, y0, n, gap, z0, z1) => L(Array.from({ length: n }, (_, i) => rounded(y0 + i * gap, z0, y0 + i * gap + 1.4, z1, 0.7, onRight(x))).join(""), { tone: "faint" });
// small label plate standing proud of a front face, rule lines for its text
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
function line(name, from, to, via, { r, tone = "mid", touch = [] }) {
  const ends = [from, to].map((end) => {
    const F = G.frameAlong(end.at, end.dir);
    discAt(end.name, F, 0, 2.5, end.portR ?? r + 0.9, { tone: "mid", extra: end.ring ? L(G.circleOf(F, 2.5, r + 0.3, P, 16), { tone: "faint" }) : "" });
    return G.pointOf(F, 2.5, 0, 0);
  });
  const route = G.fillet([ends[0], ...via, ends[1]], Math.max(3, r * 3.4), 12, { P, tube: r });
  return B.tubeItems(name, route, r, { tone, limp: true, maxLength: 14, rims: [r, r], touch });
}

// ---------------------------------------------------------------- bench
const back = B.stand({
  strip: { x: -132, w: 50 },
  label: { x: 104 },
  shadows: [[CHP, 10], [CHILL, 7], [HVG, 7], [TRAY, 3]],
});

// ---------------------------------------------------------------- 6 enclosure: plinth, floor, walls, linings, hinge, lid with lead glass, interlock
box("enclosure.plinth", CHP, 0, PLINTH_H, {
  tone: "lo",
  bevel: 0.8,
  inner: L(k.sideSeam(CHP, 4, P, 3), { tone: "faint" }),
  extra:
    ventsFront(CH.y1, -112, 18, 4.4, 5, 11) +
    ventsRight(CH.x1, -80, 14, 4.4, 5, 11) +
    D([at([94, CH.y1, 9])], { size: 0.8, tone: "hi" }) +
    L(rounded(100, 6, 112, 11, 1, onFront(CH.y1)), { tone: "lo" }) +
    D([at([-118, CH.y1, 12]), at([118, CH.y1, 12])], { size: 0.45 }),
});
plate("enclosure.plate", 46, CH.y1, 4.5, 26, 7, [18, 12]);
box("enclosure.floor", CHP, PLINTH_H, ZF - PLINTH_H, {
  tone: "mid",
  bevel: 0.6,
  extra: L(k.planOutline(k.insetPlan({ x: IN.x0, y: IN.y0, w: IN.x1 - IN.x0, d: CH.y1 - IN.y0, r: 1.5 }, 4), ZF, P, 3), { tone: "faint" }),
});
const wallBolts = (x0, x1, y0, y1, n) => D(Array.from({ length: n }, (_, i) => at([x0 + ((x1 - x0) * (i + 0.5)) / n, y0 + ((y1 - y0) * (i + 0.5)) / n, ZW])), { size: 0.42 });
box("enclosure.back", { x: CH.x0, y: CH.y0, w: CH.x1 - CH.x0, d: CH.wall, r: 0.8 }, ZF, ZW - ZF, {
  tone: "mid",
  steps: 2,
  bevel: 0.4,
  extra: wallBolts(CH.x0 + 6, CH.x1 - 6, CH.y0 + 2.5, CH.y0 + 2.5, 11),
});
box("enclosure.left", { x: CH.x0, y: IN.y0, w: CH.wall, d: CH.y1 - IN.y0, r: 0.8 }, ZF, ZW - ZF, {
  tone: "mid",
  steps: 2,
  bevel: 0.4,
  extra: wallBolts(CH.x0 + 2.5, CH.x0 + 2.5, IN.y0 + 4, CH.y1 - 4, 7) + L([-40, -6].map((y) => k.segment([IN.x0, y, ZF], [IN.x0, y, ZW], P)).join(""), { tone: "faint" }),
});
box("enclosure.right", { x: IN.x1, y: IN.y0, w: CH.wall, d: CH.y1 - IN.y0, r: 0.8 }, ZF, ZW - ZF, {
  tone: "mid",
  steps: 2,
  bevel: 0.4,
  extra: wallBolts(IN.x1 + 2.5, IN.x1 + 2.5, IN.y0 + 4, CH.y1 - 18, 6) + L([-50, -16].map((y) => k.segment([CH.x1, y, ZF], [CH.x1, y, ZW], P)).join(""), { tone: "faint" }) + ventsRight(CH.x1, -6, 5, 4.4, 30, 60),
});
// lead-lined steel panels screwed to the inside of the back wall
for (const [x0, x1] of [[-112, -40], [-36, 36], [40, 112]]) {
  const pz0 = ZF + 4, pz1 = ZW - 6;
  box("enclosure.lining", { x: x0, y: IN.y0, w: x1 - x0, d: 1, r: 0.3 }, pz0, pz1 - pz0, {
    tone: "mid",
    steps: 2,
    bevel: 0,
    extra: D([[x0 + 2, pz0 + 2], [x1 - 2, pz0 + 2], [x0 + 2, pz1 - 2], [x1 - 2, pz1 - 2], [(x0 + x1) / 2, pz1 - 2]].map(([x, z]) => at([x, IN.y0 + 1, z])), { size: 0.42 }),
  });
}
// fixed roof over the back of the enclosure, with its vents, bolts and the X-ray warning lamp
{
  const roof = { x: IN.x0, y: IN.y0, w: IN.x1 - IN.x0, d: ROOF_Y - IN.y0, r: 0.6 };
  const slots = [-60, -40, -20, 0, 20, 40, 60].map((x) => k.planOutline({ x: x - 7, y: -72, w: 14, d: 2.4, r: 1.1 }, ZW, P, 3)).join("");
  box("enclosure.roof", roof, ZW - 5, 5, { tone: "mid", steps: 2, bevel: 0.4, extra: L(slots, { tone: "faint" }) + D(k.corners(roof, 3).map(([x, y]) => at([x, y, ZW])), { size: 0.42 }) });
  // X-RAYS ON warning lamp on the left wall's top
  cyl("enclosure.lamp-base", CH.x0 + 2.5, 2, 2.4, ZW, 1.2, { tone: "lo", steps: 20 });
  cyl("enclosure.lamp", CH.x0 + 2.5, 2, 1.9, ZW + 1.2, 4, { tone: "hi", steps: 20, extra: L(k.sideArc(CH.x0 + 2.5, 2, 1.9, ZW + 3.2, P, 12), { tone: "faint" }) });
}
// piano-hinge knuckles on the roof's front edge, tangent to the roof top and to the lid's edge
const HINGE_R = 2.5;
for (const x of [-60, 60]) discAt("lid.knuckle", G.frameAlong([x - 12, LID.hinge[0], LID.hinge[1]], [1, 0, 0]), 0, 24, HINGE_R, { tone: "hi", extra: D([at([x - 12, LID.hinge[0], LID.hinge[1] + HINGE_R])], { size: 0.4 }) });
// the lid, swung up by LID.open about the hinge line: local (u along the lid, v through its thickness)
const LF = G.frameOf([CH.x0, LID.hinge[0], LID.hinge[1]], [1, 0, 0], [0, Math.cos(LID.open), Math.sin(LID.open)], [0, -Math.sin(LID.open), Math.cos(LID.open)]);
const LID_U = [HINGE_R, CH.y1 - LID.hinge[0]];
const lidAt = (x, u, v) => add(LF.o, add(mul(LF.a, x - CH.x0), add(mul(LF.u, u), mul(LF.v, v))));
prism("lid.frame", LF, [[LID_U[0], -LID.t / 2], [LID_U[1], -LID.t / 2], [LID_U[1], LID.t / 2], [LID_U[0], LID.t / 2]], 0, CH.x1 - CH.x0, { tone: "mid" });
// lead-glass pane set into the inner face: a tinted face with two glints running edge to edge, and its retaining screws
{
  const u0 = 10, u1 = LID_U[1] - 10, x0 = CH.x0 + 12, x1 = CH.x1 - 24;
  const face = [[x0, u0], [x1, u0], [x1, u1], [x0, u1]].map(([x, u]) => k.iso(lidAt(x, u, -4.1), P));
  const glint = (xa, xb) => k.pathOf([k.iso(lidAt(xa, u0, -4.1), P), k.iso(lidAt(xb, u1, -4.1), P)]);
  const screws = [[x0 - 3, u0 - 3], [x1 + 3, u0 - 3], [x0 - 3, u1 + 3], [x1 + 3, u1 + 3], [(x0 + x1) / 2, u0 - 3], [(x0 + x1) / 2, u1 + 3]].map(([x, u]) => k.iso(lidAt(x, u, -2.5), P));
  prism("lid.glass", LF, [[u0, -4.1], [u1, -4.1], [u1, -2.5], [u0, -2.5]], x0 - CH.x0, x1 - CH.x0, {
    tone: "lo",
    extra: `<path class="xd-glass" d="${k.pathOf(face, true)}"/>` + L(glint(x0 + 30, x0 + 64) + glint(x0 + 44, x0 + 70) + glint(x0 + 150, x0 + 172), { tone: "faint" }) + L(k.pathOf(face, true), { tone: "lo" }) + D(screws, { size: 0.45 }),
  });
}
prism("lid.grip", LF, [[LID_U[1], -1.9], [LID_U[1] + 3, -1.9], [LID_U[1] + 3, 1.9], [LID_U[1], 1.9]], 72, 172, { tone: "hi" });
const TONGUE = { x0: 112, x1: 116, u0: 56, u1: 62 };
prism("lid.tongue", LF, [[TONGUE.u0, -6.5], [TONGUE.u1, -6.5], [TONGUE.u1, -2.5], [TONGUE.u0, -2.5]], TONGUE.x0 - CH.x0, TONGUE.x1 - CH.x0, { tone: "hi" });
// interlock switch on the right wall's inner face; with the lid open its plunger stands out
const ILK = { x: 112, y: 8, w: 5, d: 10, r: 0.6, z: 158, h: 12 };
box("interlock.switch", ILK, ILK.z, ILK.h, { tone: "lo", bevel: 0.3, extra: D([at([ILK.x + 1.4, ILK.y + ILK.d, ILK.z + 9]), at([ILK.x + 1.4, ILK.y + ILK.d, ILK.z + 3])], { size: 0.4 }) });
cyl("interlock.plunger", ILK.x + 2.5, ILK.y + ILK.d / 2, 1, ILK.z + ILK.h, 2.6, { tone: "hi", steps: 14 });

// ---------------------------------------------------------------- 3 goniometer housing, face plate, graduated arc on its legs, rear rotary union
box("goniometer.housing", HOUSING, ZF, HOUSING.top - ZF, {
  tone: "mid",
  bevel: 0.8,
  inner: L(k.sideSeam(HOUSING, HOUSING.top - 6, P, 3), { tone: "faint" }),
  extra: ventsRight(HOUSING.x + HOUSING.w, HOUSING.y + 3, 4, 4.4, 26, 44) + D([at([HOUSING.x + HOUSING.w, HOUSING.y + 3, HOUSING.top - 3]), at([HOUSING.x + HOUSING.w, HOUSING.y + HOUSING.d - 3, HOUSING.top - 3])], { size: 0.42 }),
});
plate("goniometer.plate", 14, FACE.y0, 24, 18, 6, [12, 8]);
{
  const F = G.frameAlong([0, FACE.y0, ZA], [0, 1, 0]);
  discAt("goniometer.face", F, 0, FACE.y1 - FACE.y0, FACE.r, {
    tone: "hi",
    bevel: 0.3,
    extra: L(G.circleOf(F, FACE.y1 - FACE.y0, FACE.r - 4, P, 64), { tone: "faint" }) + D(G.dotsOf(F, FACE.y1 - FACE.y0, FACE.r - 2, 16, P, { phase: 0.1, all: true }), { size: 0.42 }),
  });
}
// the arc: 5° segments (convex prisms) from 0° to 180°, minor ticks every degree hanging from its inner edge
const AF = G.frameOf([0, ARC.y0, ZA], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const polar = (r, deg) => [r * Math.cos(deg * DEG), r * Math.sin(deg * DEG)];
for (let a0 = 0; a0 < 180; a0 += ARC.step) {
  const a1 = a0 + ARC.step;
  const ticks = [1, 2, 3, 4].map((d) => {
    const deg = a0 + d;
    const [x0, z0] = polar(ARC.r0, deg);
    const [x1, z1] = polar(ARC.r0 + 1.6, deg);
    return k.segment([x0, ARC.y1, ZA + z0], [x1, ARC.y1, ZA + z1], P);
  });
  const major = a0 % 10 === 0 && a0 > 0 ? (() => { const [x0, z0] = polar(ARC.r0, a0); const [x1, z1] = polar(ARC.r1, a0); return k.segment([x0, ARC.y1, ZA + z0], [x1, ARC.y1, ZA + z1], P); })() : "";
  prism("goniometer.arc", AF, [polar(ARC.r0, a0), polar(ARC.r1, a0), polar(ARC.r1, a1), polar(ARC.r0, a1)], 0, ARC.y1 - ARC.y0, {
    tone: "lo",
    extra: L(ticks.join(""), { tone: "lo" }) + (major ? L(major, { tone: "mid" }) : ""),
  });
}
for (const sx of [-1, 1]) {
  const x0 = sx > 0 ? ARC.r0 : -ARC.r1;
  const foot = { x: x0 - 4, y: ARC.y0 - 4, w: ARC.r1 - ARC.r0 + 8, d: ARC.y1 - ARC.y0 + 8, r: 1 };
  box("goniometer.arc-foot", foot, ZF, 2, { tone: "lo", bevel: 0.3, extra: D(k.corners(foot, 1.6).map(([x, y]) => at([x, y, ZF + 2])), { size: 0.4 }) });
  box("goniometer.arc-leg", { x: x0, y: ARC.y0, w: ARC.r1 - ARC.r0, d: ARC.y1 - ARC.y0, r: 0.4 }, ZF + 2, ZA - ZF - 2, { tone: "mid", steps: 2, bevel: 0.3 });
}
// rear rotary union on the axis: the arm lines come down the hollow axle and leave here
{
  const F = G.frameAlong([0, UNION.y1, ZA], [0, -1, 0]);
  discAt("goniometer.union", F, 0, UNION.y1 - UNION.y0, UNION.r, { tone: "lo", bevel: 0.3, extra: D(G.dotsOf(F, UNION.y1 - UNION.y0, UNION.r - 1.6, 8, P, { phase: 0.4, fade: [0.04, 0.42] }), { size: 0.4 }) });
}
// the tube arm's stepper, on the housing's back (the detector arm's stepper and worm sit on the face plate, live)
box("goniometer.rear-motor", { x: 14, y: HOUSING.y - 10, w: 18, d: 10, r: 1 }, 92, 14, { tone: "mid", bevel: 0.4, extra: D([at([16, HOUSING.y - 10, 104]), at([30, HOUSING.y - 10, 104])], { size: 0.4 }) });

// ---------------------------------------------------------------- 1, 4 the moving group: both arms, drive, sample stage, beam slots
const GONIO = makeGonio(k, G, P, GON);
const TT0 = M.DEFAULTS.twoTheta;
{
  const shapes = GONIO.list(TT0).map((part) => {
    const meta = { name: R.nameFor(part.name), owner: part.owner };
    if (part.kind === "disc") return record(A.disc(part.F, part.s0, part.s1, part.r, meta));
    if (part.kind === "prism") return record(A.prism(part.F, part.poly, part.s0, part.s1, meta));
    if (part.kind === "ball") return record(A.ball(part.c, part.r, meta));
    if (part.kind === "cyl") return record(A.cylinder(part.cx, part.cy, part.r, part.z, part.h, meta));
    if (part.kind === "slab") return record(A.slab(part.plan, part.z, part.h, meta, 3));
    throw new Error(`unknown part kind ${part.kind}`);
  });
  put("goniometer.arms", [0, YB, ZA], `<g data-part="gonio">${GONIO.svg(TT0, (TT0 / 2) * DEG * WORM_RATIO)}</g>`, shapes);
}

// ---------------------------------------------------------------- 2 lines out of the union: water pair and HV cable through the walls, detector signal to the floor
const PORT = (z) => [0, UNION.y0, z];
const ZL = ZF + 1.6; // water runs along the enclosure floor
line("water.out-inner", { name: "goniometer.union-port", at: PORT(83), dir: [0, -1, 0] }, { name: "enclosure.feed-in", at: [IN.x0, 10, ZL], dir: [1, 0, 0], portR: 1.4 }, [[0, -77, 83], [0, -77, ZL], [-110, -77, ZL], [-110, 10, ZL]], { r: 1, tone: "hi" });
line("water.in-inner", { name: "goniometer.union-port", at: PORT(77), dir: [0, -1, 0] }, { name: "enclosure.feed-in", at: [IN.x0, 16, ZL], dir: [1, 0, 0], portR: 1.4 }, [[0, -73, 77], [0, -73, ZL], [-106, -73, ZL], [-106, 16, ZL]], { r: 1, tone: "hi" });
line("hv.lead", { name: "goniometer.union-port", at: PORT(71), dir: [0, -1, 0], portR: 2.2 }, { name: "enclosure.hv-feed-in", at: [IN.x1, -69, 44], dir: [-1, 0, 0], portR: 2.4 }, [[0, -69, 71], [0, -69, 44]], { r: 1.25 });
line("detector.signal", { name: "goniometer.union-port", at: PORT(65), dir: [0, -1, 0] }, { name: "enclosure.sig-feed", at: [0, -65, ZF], dir: [0, 0, 1], ring: true }, [[0, -65, 65]], { r: 0.8 });
line("water.out", { name: "enclosure.feed-out", at: [CH.x0, 10, ZL], dir: [-1, 0, 0], ring: true, portR: 1.4 }, { name: "chiller.port", at: [CHILL.x + CHILL.w, 10, ZL], dir: [1, 0, 0], portR: 1.4 }, [], { r: 1, tone: "hi" });
line("water.in", { name: "enclosure.feed-out", at: [CH.x0, 16, ZL], dir: [-1, 0, 0], ring: true, portR: 1.4 }, { name: "chiller.port", at: [CHILL.x + CHILL.w, 16, ZL], dir: [1, 0, 0], portR: 1.4 }, [], { r: 1, tone: "hi" });
line("hv.cable", { name: "enclosure.hv-feed-out", at: [CH.x1, -69, 44], dir: [1, 0, 0], ring: true, portR: 2.4 }, { name: "hv.port", at: [HVG.x, -69, 44], dir: [-1, 0, 0], portR: 2.4 }, [], { r: 1.25 });

// ---------------------------------------------------------------- 2 recirculating chiller: case, display, keys, filler cap, vents
{
  const front = CHILL.y + CHILL.d;
  const right = CHILL.x + CHILL.w;
  const scr = { x0: CHILL.x + 10, x1: CHILL.x + 40, z0: 50, z1: 62 };
  const win = rounded(scr.x0, scr.z0, scr.x1, scr.z1, 1.6, onFront(front));
  const plane = k.sideMatrix([0, front], 0, P, "left");
  box("chiller.case", CHILL, 0, CHILL.h, {
    tone: "mid",
    bevel: 0.8,
    inner: L(k.sideSeam(CHILL, CHILL.h - 6, P, 3), { tone: "faint" }),
    extra:
      `<path class="bx-lcd" d="${win}"/>` +
      `<g transform="${plane}"><text class="bx-lcd-text" x="${scr.x0 + 3}" y="${-(scr.z0 + 3.4)}" font-size="7">20.0</text><text class="bx-lcd-text" x="${scr.x1 - 2.4}" y="${-(scr.z0 + 3.4)}" font-size="3" text-anchor="end">°C</text></g>` +
      L(win, { tone: "lo" }) +
      L([0, 1, 2].map((i) => rounded(scr.x1 + 6 + i * 8, 54, scr.x1 + 11 + i * 8, 58, 1, onFront(front))).join(""), { tone: "lo" }) +
      D([at([CHILL.x + CHILL.w - 8, front, 60])], { size: 0.8, tone: "hi" }) +
      ventsFront(front, CHILL.x + 8, 15, 4.4, 8, 30) +
      ventsRight(right, CHILL.y + 6, 6, 4.4, 8, 26) +
      D([at([CHILL.x + 4, front, CHILL.h - 3]), at([CHILL.x + CHILL.w - 4, front, CHILL.h - 3])], { size: 0.45 }),
  });
  plate("chiller.plate", CHILL.x + 44, front, 34, 24, 8, [16, 11]);
  const cx = CHILL.x + 24, cy = CHILL.y + 22;
  cyl("chiller.filler-neck", cx, cy, 5, CHILL.h, 2, { tone: "lo" });
  cyl("chiller.filler-cap", cx, cy, 6.5, CHILL.h + 2, 3.6, { tone: "mid", bevel: 0.4, extra: L(k.knurl(cx, cy, 6.5, CHILL.h + 2.6, CHILL.h + 5, 28, P), { tone: "faint" }) + D([at([cx, cy, CHILL.h + 5.6])], { size: 0.5 }) });
  box("chiller.handle", { x: CHILL.x + 44, y: CHILL.y + 26, w: 28, d: 4, r: 1.2 }, CHILL.h, 3, { tone: "lo", bevel: 0.3 });
}

// ---------------------------------------------------------------- 1 HV generator: case, fan, plate, LED, vents (its port is on the hidden left face)
{
  const front = HVG.y + HVG.d;
  box("hv.case", HVG, 0, HVG.h, {
    tone: "mid",
    bevel: 0.8,
    inner: L(k.sideSeam(HVG, HVG.h - 5, P, 3), { tone: "faint" }),
    extra: ventsRight(HVG.x + HVG.w, HVG.y + 8, 12, 4.6, 12, 46) + D([at([HVG.x + 4, front, HVG.h - 3]), at([HVG.x + HVG.w - 4, front, HVG.h - 3])], { size: 0.45 }) + D([at([HVG.x + 60, front, 52])], { size: 0.8, tone: "hi" }) + L(rounded(HVG.x + 46, 44, HVG.x + 58, 48, 1, onFront(front)), { tone: "lo" }),
  });
  plate("hv.plate", HVG.x + 38, front, 28, 22, 10, [16, 11, 7]);
}
const FAN = { x: HVG.x + 22, z: 28, r: 14, y: HVG.y + HVG.d };
const FAN_F = G.frameAlong([FAN.x, FAN.y, FAN.z], [0, 1, 0]);
discAt("hv.fan-guard", FAN_F, 0, 1.6, FAN.r + 2, {
  tone: "lo",
  extra: L(G.circleOf(FAN_F, 1.6, FAN.r, P, 48) + G.circleOf(FAN_F, 1.6, FAN.r * 0.62, P, 40) + G.circleOf(FAN_F, 1.6, 3, P, 20), { tone: "mid" }) + `<path data-part="fan" class="iso-line" data-tone="lo" d=""/>` + D([1, 3, 5, 7].map((q) => at(G.pointOf(FAN_F, 1.6, FAN.r + 0.9, (q * Math.PI) / 4))), { size: 0.45 }),
});

// ---------------------------------------------------------------- 5 sample tray: four flat powder holders, the loaded one missing from its pocket
box("tray.body", TRAY, 0, TRAY.h, {
  tone: "lo",
  bevel: 0.5,
  extra: POCKETS.map((p) => `<path class="xd-void" d="${k.ring(p.x, p.y, 6.6, TRAY.h, P, 40)}"/>`).join("") + L(POCKETS.map((p) => k.ring(p.x, p.y, 6.6, TRAY.h, P, 40)).join(""), { tone: "lo" }) + D(k.corners(TRAY, 2.4).map(([x, y]) => at([x, y, TRAY.h])), { size: 0.4 }),
});
const GRAINS = GON.stage.grains;
POCKETS.forEach((p, i) => {
  const id = R.nameFor("tray.holder");
  const shape = record(A.cylinder(p.x, p.y, 6, TRAY.h, 2.6, { name: id }));
  const top = TRAY.h + 2.6;
  const svgH = S(k.cylinder(p.x, p.y, 6, TRAY.h, 2.6, P, 36), { tone: "hi" }) + `<path class="xd-powder" d="${k.ring(p.x, p.y, 3.8, top, P, 32)}"/>` + L(k.ring(p.x, p.y, 3.8, top, P, 32), { tone: "lo" }) + D(GRAINS.slice(i, i + 4).map(([x, y]) => at([p.x + x * 0.4, p.y + y * 0.4, top])), { size: 0.26, tone: "lo" });
  R.put({ at: [p.x, p.y, TRAY.h + 1.3], name: id, shapes: [shape], svg: `<g data-part="tray-${p.sample}">${svgH}</g>` });
});

// ---------------------------------------------------------------- 6 LCD panel with the diffractogram, cabled to the plinth's data port
const SCREEN = { x0: 155, x1: 229, z0: 34, z1: 79, r: 2.4 };
const AXIS = M.LIMITS.twoTheta;
const PLOT_GUESS = { x0: SCREEN.x0 + 4, x1: SCREEN.x1 - 3, z0: SCREEN.z0 + 6, z1: SCREEN.z1 - 8 };
const xOfT = (PLOT, t) => PLOT.x0 + ((PLOT.x1 - PLOT.x0) * (t - AXIS[0])) / (AXIS[1] - AXIS[0]);
const AXIS_TEXT = [20, 40, 60, 80].map((t) => `<text class="bx-lcd-text xd-lcd-small" x="${xOfT(PLOT_GUESS, t).toFixed(2)}" y="${-(SCREEN.z0 + 1.6)}" font-size="2.6" text-anchor="middle">${t}</text>`).join("") + `<text class="bx-lcd-text xd-lcd-small" x="${SCREEN.x1 - 1.6}" y="${-(SCREEN.z0 + 1.6)}" font-size="2.6" text-anchor="end">2θ°</text>`;
const PLOT_RAW = B.panel("panel", {
  base: { x: 170, y: 28, w: 44, d: 30, r: 3 },
  neck: { x: 192, y: 44, r: 3.4 },
  body: { x: 150, x1: 234, y: 40, y1: 48, z0: 24, z1: 84 },
  screen: SCREEN,
  buttons: [[156, 29], [163, 29], [170, 29]],
  led: [228, 29],
  inset: [4, 6, 8],
  cable: [
    { name: "enclosure.data-port", at: [CH.x1, 12, 7], dir: [1, 0, 0], ring: 0.9 },
    { name: "panel.data-port", at: [170, 36, 2.6], dir: [-1, 0, 0] },
    [[134, 12, 7], [140, 12, 0.62], [140, 36, 0.62], [162, 36, 0.62], [165, 36, 2.6]],
  ],
  text: { clock: "", phase: "" },
  extra: AXIS_TEXT + `<g data-part="peaks" class="xd-peaks"></g>`,
});
const PLOT = { ...PLOT_RAW, x1: PLOT_RAW.x1 - 3 };

// ---------------------------------------------------------------- settle, sort, page
const BODY = B.settle();
const LABEL =
  "A benchtop powder X-ray diffractometer on a bench, its shielded enclosure drawn with the lead-glass lid raised on its back hinge and the front wall cut away. Inside, a vertical goniometer stands against the back wall: a housing with a round face plate, a graduated arc on two legs, and two arms that swing about the same horizontal axis. The left arm carries a copper-anode X-ray tube in a finned shield with a nickel K-beta filter, a Soller slit and a divergence slit; water lines and the high-voltage cable leave the tube's back cap and enter the arm. The right arm carries an anti-scatter slit, a Soller slit, a receiving slit and a one-dimensional strip detector. A stepper motor turns a worm on the detector arm's gear wheel. Between the arms a flat powder sample sits on a spinner at the centre of the axis. The lit incident beam runs from the divergence slit to a footprint on the powder, and the diffracted beam runs from it toward the detector, brightening when the arms meet a Bragg reflection. Behind the goniometer the lines come out of a rotary union on the axis and run through the walls to a chiller on the left and the high-voltage generator on the right. A tray of spare holders sits at the front left, and a panel at the front right shows the diffractogram.";
const svg = k.figureSvg({ width: W, height: H, label: LABEL, body: [...back, BODY], className: "xd-svg" });

// ---------------------------------------------------------------- live data
const DATA = {
  P,
  gon: GON,
  wormRatio: WORM_RATIO,
  fan: { o: FAN_F.o, a: FAN_F.a, u: FAN_F.u, v: FAN_F.v, s: 1.6, r0: 3, r1: FAN.r * 0.62 },
  plot: PLOT,
  screen: SCREEN,
  axis: AXIS,
  defaults: M.DEFAULTS,
  limits: M.LIMITS,
  scan: M.SCAN,
  secPerStep: 0.5, // counting time per 0.02° step (s)
  rate: 6, // shown scan rate (° 2θ per s of figure time)
  slew: 24, // arm slew limit (° 2θ per s)
  spin: 0.5, // sample spinner (rev/s), assumed
  speed: 70, // photon dots' drawn speed (world units per second), illustrative
  divergence: 1, // divergence slit opening (°), sets the drawn footprint
};
const realRate = DATA.scan.step / DATA.secPerStep; // ° 2θ per real second
DATA.factor = Math.round(DATA.rate / realRate);
const MODEL = moduleText(join(HERE, "model.mjs"));
const latheSource = readFileSync(join(HERE, "..", "kit", "lathe.mjs"), "utf8").replace(/^import .*$/m, "").replace(/^export /gm, "").replace(/^/gm, "  ");
const LATHE = `const G = (() => {\n${latheSource}\n  return { viewOf, scaleOf, frameAlong, frameOf, pointOf, disc, sphereOf, prismOf, circleOf, arcOf, dotsOf, ribsOf, dot3, add3, sub3, mul3, unit3, cross3, len3, lightOf, toneOf, radialOf };\n})();`;
const GONIO_SRC = moduleText(join(HERE, "gonio.mjs"));
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const CSS = readFileSync(join(HERE, "xrd.css"), "utf8");

// first frame (also the no-script picture): defaults, cursor on Si (111)
const r0 = M.run(M.DEFAULTS);
const id0 = M.identify(r0, TT0);
const fmtCps = (c) => (c >= 1e3 ? `${(c / 10 ** Math.floor(Math.log10(c))).toFixed(1)}e${Math.floor(Math.log10(c))}` : c.toFixed(0));
const hklOf = (id) => (id ? `${id.label.split(" ")[0]} (${id.label.split(" ")[1]})` : "—");
const readout0 = `2θ ${TT0.toFixed(2)}° · d ${M.dSpacing(TT0, r0.wavelength).toFixed(3)} Å · λ ${r0.wavelength.toFixed(4)} Å · ${hklOf(id0)} · ${fmtCps(r0.at(TT0))} cps`;
const radios = (key, name, options, value) =>
  `<fieldset class="xd-seg" data-group="${key}"><legend class="bx-ctl-name">${name}</legend>${options.map(([v, text]) => `<label><input type="radio" name="xd-${key}" value="${v}"${v === value ? " checked" : ""}><span>${text}</span></label>`).join("")}</fieldset>\n`;
let controls = controlsHtml(
  [{ key: "size", name: "Crystallite", min: M.LIMITS.size[0], max: M.LIMITS.size[1], step: 5, value: M.DEFAULTS.size, text: `${M.DEFAULTS.size} nm`, valuetext: `${M.DEFAULTS.size} nanometres` }],
  `${M.SAMPLES[M.DEFAULTS.sample].label} · ${M.ANODES[M.DEFAULTS.anode].label} Kα · cursor`,
);
controls = controls.replace(
  '<span class="bx-note"',
  radios("sample", "Sample", Object.entries(M.SAMPLES).map(([v, s]) => [v, v === "mix" ? "mix" : s.label]), M.DEFAULTS.sample) +
    radios("anode", "Anode", Object.entries(M.ANODES).map(([v, a]) => [v, a.label]), M.DEFAULTS.anode) +
    `<button type="button" class="xd-scan" data-scan aria-pressed="false">Scan 10–90°</button>\n` +
    '<span class="bx-note"',
);
const stage = stageHtml(svg, {
  label: "Powder diffractometer. Left and right arrow keys set the goniometer angle two-theta; Shift for steps of 1 degree, Home and End for 10 and 90 degrees.",
  min: M.LIMITS.twoTheta[0],
  max: M.LIMITS.twoTheta[1],
  now: TT0,
  valuetext: `2θ ${TT0.toFixed(2)} degrees, ${hklOf(id0)}`,
});
const page = pageOf({
  title: "Powder diffractometer",
  theme: THEME,
  width: 980,
  css: CSS,
  plate: {
    fig: "Fig 4",
    title: "XRD · Cu tube, Bragg-Brentano",
    hint: "← → angle · sample, anode, size · scan",
    readout: readout0,
    keys: [
      { mark: "lit", label: "X-ray beams: the incident beam from the divergence slit to its footprint on the powder (steady), and the diffracted beam toward the detector, bright only near a Bragg reflection" },
      { mark: "raised", label: "Arms, tube, slits and detector move as one rigid group per arm; the worm drive and sample stage stay put" },
      { mark: "edge", label: "Water lines, HV cable and detector signal: jumpers into each arm, down the hollow axle, out of the rotary union behind" },
    ],
    caption: `Convention: θ–θ Bragg-Brentano. The powder stays flat at the centre of the goniometer; the tube arm stands at θ above horizontal on the left and the detector arm at θ on the right, so the angle between incident and diffracted beams is 2θ, read on the arc and set from 10° to 90°. Bragg's law nλ = 2d sin θ with Cu Kα1 (λ = ${M.ANODES.cu.a1} Å) puts Si (111), d = ${M.PHASES.si.refl[0][1]} Å, at ${M.braggTwoTheta(M.PHASES.si.refl[0][1], M.ANODES.cu.a1).toFixed(2)}°, (220) at ${M.braggTwoTheta(M.PHASES.si.refl[1][1], M.ANODES.cu.a1).toFixed(2)}° and (311) at ${M.braggTwoTheta(M.PHASES.si.refl[2][1], M.ANODES.cu.a1).toFixed(2)}°; a Co anode (λ = ${M.ANODES.co.a1} Å) moves (111) to ${M.braggTwoTheta(M.PHASES.si.refl[0][1], M.ANODES.co.a1).toFixed(2)}°. Peaks carry the Kα2 satellite, Lorentz-polarisation and a Caglioti instrument width; Scherrer broadening makes 20 nm crystallites give wide peaks and 200 nm sharp ones. Reflection tables are illustrative. The scan button runs ${M.SCAN.from}–${M.SCAN.to}° in ${M.SCAN.step}° steps at ${DATA.secPerStep} s a step (${Math.round(((M.SCAN.to - M.SCAN.from) / M.SCAN.step) * DATA.secPerStep / 60)} min real) and accumulates counting noise, shown ${DATA.factor}× faster than real time; arms slew at up to ${DATA.slew}°/s. Beam widths, photon speed (${DATA.speed} units/s) and the ${DATA.spin} rev/s spinner are drawn, not measured. The enclosure is drawn with its lead-glass lid raised and the front wall cut away; in use the lid is closed, its tongue holds the interlock plunger down, and opening it cuts the high voltage.`,
    body: stage + controls,
  },
  script: scriptOf(kitScript(), LATHE, MODEL, GONIO_SRC, LIVE_CORE, LIVE),
});
const name = THEME === "light" ? "xrd-light.html" : "xrd.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${R.solids.length} solids`, `${R.tubes.length} tube runs`);

A.auditOrExit(R, P);

// the arms move: re-record the group every 5° of 2θ and prove it never sinks into itself or the static parts nearby,
// and that every moving part stays held (wheel on axle on face plate, stage on the floor)
if (process.argv.includes("--audit")) {
  const near = R.solids.filter((s) => /^(goniometer\.|enclosure\.(floor|back|left|right|lining))/.test(s.name ?? ""));
  const shapeOf = (part, i) => {
    const meta = { name: `${part.name}@${i}`, owner: part.owner };
    if (part.kind === "disc") return A.disc(part.F, part.s0, part.s1, part.r, meta);
    if (part.kind === "prism") return A.prism(part.F, part.poly, part.s0, part.s1, meta);
    if (part.kind === "ball") return A.ball(part.c, part.r, meta);
    if (part.kind === "cyl") return A.cylinder(part.cx, part.cy, part.r, part.z, part.h, meta);
    return A.slab(part.plan, part.z, part.h, meta, 3);
  };
  let bad = 0;
  for (let tt = M.LIMITS.twoTheta[0]; tt <= M.LIMITS.twoTheta[1]; tt += 5) {
    const moving = GONIO.list(tt).map(shapeOf);
    const ground = (s) => /^enclosure\./.test(s.name ?? "") || /^goniometer\.(housing|arc-foot)/.test(s.name ?? "");
    const result = A.supports([...near, ...moving], [], { ground });
    const sunk = result.sunk.filter((p) => p.a.includes("@") || p.b.includes("@"));
    const loose = result.loose.filter((n) => n.includes("@"));
    if (sunk.length || loose.length) {
      bad += sunk.length + loose.length;
      console.log(`sweep 2θ ${tt}°: ${sunk.map((p) => `${p.a} into ${p.b} by ${p.depth.toFixed(2)}`).join("; ")} ${loose.length ? `loose: ${loose.join(", ")}` : ""}`);
    }
  }
  console.log(bad ? `sweep failed: ${bad} problems` : `sweep passed: arms clear at every 5° from ${M.LIMITS.twoTheta[0]}° to ${M.LIMITS.twoTheta[1]}°`);
  if (bad) process.exitCode = 1;
}
