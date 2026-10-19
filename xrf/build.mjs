// Benchtop EDXRF spectrometer: an isometric Hero figure built with the anatomy kit.
// node xrf/build.mjs [--light] [--audit]
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
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- world plan (x along the bench, y toward the viewer, z up)
const W = 900;
const H = 560;
const AZIMUTH = 58;
const ELEVATION = 30;

const BENCH = { x: -190, y: -100, w: 446, d: 172, r: 8 };
const BENCH_H = 10;
const FOOT_H = 5;

// shielded sample chamber on its plinth; the front wall is cut away and the lid is drawn raised on its back hinge
const CH = { x0: -88, x1: 88, y0: -62, y1: 30, wall: 5 };
const PLINTH_H = 14;
const ZF = PLINTH_H + 6; // chamber floor top
const ZW = 92; // wall tops
const CHP = { x: CH.x0, y: CH.y0, w: CH.x1 - CH.x0, d: CH.y1 - CH.y0, r: 2 };
const IN = { x0: CH.x0 + CH.wall, x1: CH.x1 - CH.wall, y0: CH.y0 + CH.wall };
const LID = { open: 100 * DEG, hinge: [CH.y0 - 2.2, ZW], t: 5 };

// sample spinner, cup and Mylar film; the beam spot sits on the film
const SP0 = [-6, -2];
const SPIN = { base: 13, baseH: 4, plate: 15, plateH: 2.4 };
const CUP = { r: 8.5, h: 9.4, ring: 9.6, collar: 3, film: 0.25 };
const Z_CUP = ZF + SPIN.baseH + SPIN.plateH;
const ZS = Z_CUP + CUP.h + CUP.collar + CUP.film; // film top
const SP = [SP0[0], SP0[1], ZS];
const SPIN_RPS = 0.25; // assumed spinner speed (not in model.mjs): sets the turning ticks only

// X-ray tube from behind-left at 30° above the sample plane; detector at 40° take-off, 90° to the beam
const unit = G.unit3;
const add = G.add3;
const mul = G.mul3;
const TA = [Math.cos(30 * DEG) * Math.SQRT1_2, Math.cos(30 * DEG) * Math.SQRT1_2, -Math.sin(30 * DEG)]; // beam direction, tube → sample
const TUBE_L = 72; // rear face to spot along the beam
const T_O = add(SP, mul(TA, -TUBE_L));
const T_UP = unit([Math.sin(30 * DEG) * Math.SQRT1_2, Math.sin(30 * DEG) * Math.SQRT1_2, Math.cos(30 * DEG)]);
const T_SIDE = unit(G.cross3(TA, T_UP));
const TF = G.frameOf(T_O, TA, T_UP, T_SIDE);
const TUBE = { cap: [0, 4, 5.5], house: 7.5, fin: 10, fins: [11, 14, 17, 20, 23, 26], end: 31, nose: [31, 34, 6.5], be: [34, 34.6, 3.6], coll: [34.6, 44, 2.2] };
const WHEEL = { psi: 80 * DEG, off: 13, r: 15, block: [44, 48], spindle: [48, 48.8], disc: [48.8, 50], motor: [36, 44, 3.2], hole: 3 };
const BEAM_R = [2.1, 1.8];

const DET_EL = 40 * DEG;
// azimuth of the detector axis that puts it at 90° to the beam at this take-off angle
const DET_AZ = (() => {
  const c = Math.cos(DET_EL), s = Math.sin(DET_EL);
  const need = (s * -TA[2]) / (c * Math.hypot(TA[0], TA[1])); // cos(β − αa) with αa the beam azimuth
  return Math.atan2(TA[1], TA[0]) - Math.acos(need);
})();
const DA = [Math.cos(DET_EL) * Math.cos(DET_AZ), Math.cos(DET_EL) * Math.sin(DET_AZ), Math.sin(DET_EL)]; // sample → detector
const D_UP = unit([-Math.sin(DET_EL) * Math.cos(DET_AZ), -Math.sin(DET_EL) * Math.sin(DET_AZ), Math.cos(DET_EL)]);
const D_SIDE = unit(G.cross3(DA, D_UP));
const DF = G.frameOf(SP, DA, D_UP, D_SIDE);
const DET = { be: [18, 18.6, 3.3], snout: [18.6, 36, 3.3], flange: [36, 38.5, 7], body: [38.5, 50, 8], cool: [50, 59, 7], fins: [51, 53, 55, 57], finR: 10.5, rear: [59, 64, 6.5] };

// side units on the bench
const HV = { x: -180, y: -58, w: 60, d: 66, r: 3, h: 54 };
const MCA = { x: 100, y: -22, w: 54, d: 46, r: 3, h: 36 };
const PUMP = { x: 104, y: -60, w: 30, d: 26, r: 2.5, h: 22 };
const HE = { x: 160, y: -76, r: 11, h: 86 };

const P = k.fitProjection(
  [...k.boxCorners(BENCH, -BENCH_H - FOOT_H, 0), [CH.x0, LID.hinge[0] - 17, ZW + 96], [CH.x1, LID.hinge[0] - 17, ZW + 96], [HE.x, HE.y, 128], [BENCH.x + BENCH.w, 46, 84]],
  W,
  H,
  { pad: 26, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const R = A.recorder(P);
const B = makeBench(P, R, KS, { bench: BENCH, benchH: BENCH_H, footH: FOOT_H, ns: "xr" });
const { at, S, L, D, rounded, onFront, onRight, record, box, cyl, discAt, pipe, cable } = B;

// a prism of polygon [[u, v]] in frame F from s0 to s1
function prism(name, F, poly, s0, s1, { tone = "mid", extra = "", inner = "", lit = false, owner } = {}) {
  const id = R.nameFor(name);
  const shape = record(A.prism(F, poly, s0, s1, { name: id, owner }));
  const cu = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cv = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const c = add(add(F.o, mul(F.a, (s0 + s1) / 2)), add(mul(F.u, cu), mul(F.v, cv)));
  R.put({ at: c, name: id, shapes: [shape], svg: S(G.prismOf(F, poly, s0, s1, P), { tone, inner, lit }) + extra });
  return shape;
}
// filled void (a bore or an open aperture) with its rim
const voidOn = (F, s, r) => `<path class="xr-void" d="${G.circleOf(F, s, r, P)}"/>` + L(G.circleOf(F, s, r, P), { tone: "lo" });
// vent slots on a front (y) or right (x) face
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
// a frame along `a` whose radial angle 0 is `u`
const frameAt = (o, a, u) => G.frameOf(o, a, u, unit(G.cross3(a, u)));

// ---------------------------------------------------------------- bench
const back = B.stand({
  strip: { x: -150, w: 50 },
  label: { x: 196 },
  shadows: [[HV, 7], [CHP, 10], [MCA, 6], [PUMP, 5], [{ x: HE.x - HE.r, y: HE.y - HE.r, w: 2 * HE.r, d: 2 * HE.r, r: HE.r }, 4]],
});

// ---------------------------------------------------------------- 3 chamber: plinth, floor, walls, hinge, lid, interlock
box("chamber.plinth", CHP, 0, PLINTH_H, {
  tone: "lo",
  bevel: 0.8,
  inner: L(k.sideSeam(CHP, 4, P, 3), { tone: "faint" }),
  extra:
    ventsFront(CH.y1, -80, 12, 4.4, 5, 11) +
    ventsRight(CH.x1, -54, 10, 4.4, 5, 11) +
    D([at([66, CH.y1, 9])], { size: 0.8, tone: "hi" }) +
    L(rounded(72, 6, 82, 11, 1, onFront(CH.y1)), { tone: "lo" }) +
    D([at([-84, CH.y1, 12]), at([84, CH.y1, 12])], { size: 0.45 }),
});
plate("chamber.plate", 18, CH.y1, 5, 22, 6.5, [14, 9]);
box("chamber.floor", CHP, PLINTH_H, ZF - PLINTH_H, {
  tone: "mid",
  bevel: 0.6,
  extra: L(k.planOutline(k.insetPlan({ x: IN.x0, y: IN.y0, w: IN.x1 - IN.x0, d: CH.y1 - IN.y0, r: 1.5 }, 4), ZF, P, 3), { tone: "faint" }),
});
const wallBolts = (x0, x1, y0, y1, n) => D(Array.from({ length: n }, (_, i) => at([x0 + ((x1 - x0) * (i + 0.5)) / n, y0 + ((y1 - y0) * (i + 0.5)) / n, ZW])), { size: 0.42 });
box("chamber.back", { x: CH.x0, y: CH.y0, w: CH.x1 - CH.x0, d: CH.wall, r: 0.8 }, ZF, ZW - ZF, {
  tone: "mid",
  steps: 2,
  bevel: 0.4,
  extra: L([-48, 0, 48].map((x) => k.segment([x, IN.y0, ZF], [x, IN.y0, ZW], P)).join(""), { tone: "faint" }) + wallBolts(CH.x0 + 6, CH.x1 - 6, CH.y0 + 2.5, CH.y0 + 2.5, 9),
});
box("chamber.left", { x: CH.x0, y: IN.y0, w: CH.wall, d: CH.y1 - IN.y0, r: 0.8 }, ZF, ZW - ZF, {
  tone: "mid",
  steps: 2,
  bevel: 0.4,
  extra: wallBolts(CH.x0 + 2.5, CH.x0 + 2.5, IN.y0 + 4, CH.y1 - 4, 5) + L([-20, 8].map((y) => k.segment([IN.x0, y, ZF], [IN.x0, y, ZW], P)).join(""), { tone: "faint" }),
});
box("chamber.right", { x: IN.x1, y: IN.y0, w: CH.wall, d: CH.y1 - IN.y0, r: 0.8 }, ZF, ZW - ZF, {
  tone: "mid",
  steps: 2,
  bevel: 0.4,
  extra: wallBolts(IN.x1 + 2.5, IN.x1 + 2.5, IN.y0 + 4, CH.y1 - 18, 4) + L([-30, 0].map((y) => k.segment([CH.x1, y, ZF], [CH.x1, y, ZW], P)).join(""), { tone: "faint" }),
});
// lead-lined steel panels screwed to the inside of the back wall, and seams on the left wall's inner face
for (const [x0, x1] of [[-80, -28], [-26, 26], [28, 80]]) {
  const pz0 = ZF + 4, pz1 = ZW - 6;
  box("chamber.lining", { x: x0, y: IN.y0, w: x1 - x0, d: 1, r: 0.3 }, pz0, pz1 - pz0, {
    tone: "mid",
    steps: 2,
    bevel: 0,
    extra: D([[x0 + 2, pz0 + 2], [x1 - 2, pz0 + 2], [x0 + 2, pz1 - 2], [x1 - 2, pz1 - 2], [(x0 + x1) / 2, pz1 - 2]].map(([x, z]) => at([x, IN.y0 + 1, z])), { size: 0.42 }),
  });
}
// hinge knuckles behind the back wall, tangent to its outer face and to the lid's edge
const HINGE_R = 2.2;
const HINGE_XS = [-60, 60];
for (const x of HINGE_XS) discAt("lid.knuckle", G.frameAlong([x - 9, LID.hinge[0], LID.hinge[1]], [1, 0, 0]), 0, 18, HINGE_R, { tone: "hi", extra: D([at([x - 9, LID.hinge[0], LID.hinge[1] + HINGE_R])], { size: 0.4 }) });
// the lid, swung up by LID.open about the hinge line: local (u along the lid, v through its thickness)
const LF = G.frameOf([CH.x0, LID.hinge[0], LID.hinge[1]], [1, 0, 0], [0, Math.cos(LID.open), Math.sin(LID.open)], [0, -Math.sin(LID.open), Math.cos(LID.open)]);
const LID_U = [HINGE_R, HINGE_R + (CH.y1 - CH.y0)];
const lidAt = (x, u, v) => add(LF.o, add(mul(LF.a, x - CH.x0), add(mul(LF.u, u), mul(LF.v, v))));
prism("lid.plate", LF, [[LID_U[0], 0], [LID_U[1], 0], [LID_U[1], LID.t], [LID_U[0], LID.t]], 0, CH.x1 - CH.x0, { tone: "mid" });
// lead lining on the inner face, with its gasket groove, screws and a warning label
{
  const u0 = 8, u1 = LID_U[1] - 6, x0 = CH.x0 + 6, x1 = CH.x1 - 16;
  const groove = k.pathOf([[x0 + 3, u0 + 3], [x1 - 3, u0 + 3], [x1 - 3, u1 - 3], [x0 + 3, u1 - 3]].map(([x, u]) => k.iso(lidAt(x, u, -2), P)), true);
  const screws = [[x0 + 1.6, u0 + 1.6], [x1 - 1.6, u0 + 1.6], [x0 + 1.6, u1 - 1.6], [x1 - 1.6, u1 - 1.6]].map(([x, u]) => k.iso(lidAt(x, u, -2), P));
  prism("lid.lining", LF, [[u0, -2], [u1, -2], [u1, 0], [u0, 0]], x0 - CH.x0, x1 - CH.x0, { tone: "hi", extra: L(groove, { tone: "faint" }) + D(screws, { size: 0.45 }) });
  // warning label: a plate with a trefoil ring and rule lines
  const lx = 22, lu = 54;
  const LBF = G.frameOf(lidAt(lx, lu, -2), [-LF.v[0], -LF.v[1], -LF.v[2]], [1, 0, 0], LF.u);
  prism("lid.label", LBF, [[-12, -8], [12, -8], [12, 8], [-12, 8]], 0, 0.5, {
    tone: "lo",
    extra:
      L(G.circleOf(LBF, 0.5, 3.6, P, 28) + G.circleOf(LBF, 0.5, 1, P, 12), { tone: "mid" }) +
      L([[-9, -6.5, 9], [-9, 5, 16], [-9, 6.6, 11]].map(([u, v, w]) => k.pathOf([k.iso(G.add3(LBF.o, add(add(mul(LBF.a, 0.5), mul(LBF.u, u)), mul(LBF.v, v))), P), k.iso(G.add3(LBF.o, add(add(mul(LBF.a, 0.5), mul(LBF.u, u + w)), mul(LBF.v, v))), P)])).join(""), { tone: "faint", free: true }),
  });
}
// grip lip along the free edge, and the interlock tongue near the right end
prism("lid.grip", LF, [[LID_U[1], 0.6], [LID_U[1] + 3, 0.6], [LID_U[1] + 3, 4.4], [LID_U[1], 4.4]], 58, 118, { tone: "hi" });
const TONGUE = { x0: 78, x1: 82, u0: 84, u1: 90 };
prism("lid.tongue", LF, [[TONGUE.u0, -4], [TONGUE.u1, -4], [TONGUE.u1, 0], [TONGUE.u0, 0]], TONGUE.x0 - CH.x0, TONGUE.x1 - CH.x0, { tone: "hi" });
// interlock switch on the right wall's inner face; with the lid open its plunger stands out
const ILK = { x: 78, y: 18, w: 5, d: 10, r: 0.6, z: 74, h: 12 };
box("interlock.switch", ILK, ILK.z, ILK.h, { tone: "lo", bevel: 0.3, extra: D([at([ILK.x + 1.4, ILK.y + ILK.d, ILK.z + 9]), at([ILK.x + 1.4, ILK.y + ILK.d, ILK.z + 3])], { size: 0.4 }) });
cyl("interlock.plunger", ILK.x + 2.5, ILK.y + ILK.d / 2, 1, ILK.z + ILK.h, 2.6, { tone: "hi", steps: 14 });

// ---------------------------------------------------------------- sample spinner, cup, Mylar film and the excitation spot
cyl("spinner.base", SP0[0], SP0[1], SPIN.base, ZF, SPIN.baseH, { tone: "lo", bevel: 0.3, extra: L(k.knurl(SP0[0], SP0[1], SPIN.base, ZF + 0.8, ZF + SPIN.baseH - 0.8, 48, P), { tone: "faint" }) });
cyl("spinner.plate", SP0[0], SP0[1], SPIN.plate, ZF + SPIN.baseH, SPIN.plateH, { tone: "mid", bevel: 0.3, extra: `<path data-part="spin-ticks" class="iso-line" data-tone="lo" d=""/>` + L(k.ring(SP0[0], SP0[1], CUP.ring + 1.2, Z_CUP, P, 48), { tone: "faint" }) });
cyl("cup.body", SP0[0], SP0[1], CUP.r, Z_CUP, CUP.h, { tone: "mid", inner: L(k.sideArc(SP0[0], SP0[1], CUP.r, Z_CUP + 3, P, 36), { tone: "faint" }) });
cyl("cup.collar", SP0[0], SP0[1], CUP.ring, Z_CUP + CUP.h, CUP.collar, { tone: "lo", bevel: 0.3 });
// the Mylar film, and on it the lit footprint of the beam (an ellipse stretched along the beam's track)
{
  const ah = unit([TA[0], TA[1], 0]);
  const side = [-ah[1], ah[0], 0];
  const stretch = 1 / Math.sin(30 * DEG);
  const spot = (r) => k.pathOf(Array.from({ length: 40 }, (_, i) => { const t = (i / 40) * TAU; return k.iso(add(SP, add(mul(ah, r * stretch * Math.cos(t)), mul(side, r * Math.sin(t)))), P); }), true);
  cyl("cup.film", SP0[0], SP0[1], CUP.r, Z_CUP + CUP.h + CUP.collar, CUP.film, {
    tone: "hi",
    steps: 48,
    extra: `<g class="xr-spot" data-part="spot"><path class="xr-spot-glow" d="${spot(BEAM_R[1] * 1.8)}"/><path class="xr-spot-core" d="${spot(BEAM_R[1])}"/></g>`,
  });
}

// ---------------------------------------------------------------- 1 X-ray tube: HV receptacle, finned shield, nose, Be window, collimator
discAt("tube.cap", TF, TUBE.cap[0], TUBE.cap[1], TUBE.cap[2], { tone: "mid", bevel: 0.2 });
{
  const cuts = [TUBE.cap[1], ...TUBE.fins.flatMap((s) => [s, s + 1]), TUBE.end];
  for (let i = 0; i < cuts.length; i += 2) discAt("tube.shield", TF, cuts[i], cuts[i + 1], TUBE.house, { tone: "hi", inner: i === 0 ? L(G.arcOf(TF, cuts[0] + 1.6, TUBE.house, P), { tone: "faint" }) : "" });
  for (const s of TUBE.fins) discAt("tube.fin", TF, s, s + 1, TUBE.fin, { tone: "mid" });
}
discAt("tube.nose", TF, TUBE.nose[0], TUBE.nose[1], TUBE.nose[2], { tone: "mid", extra: D(G.dotsOf(TF, TUBE.nose[1], TUBE.nose[2] - 1.5, 8, P, { phase: Math.PI / 8, fade: [0.04, 0.42] }), { size: 0.42 }) });
discAt("tube.be-window", TF, TUBE.be[0], TUBE.be[1], TUBE.be[2], { tone: "lo" });
discAt("tube.collimator", TF, TUBE.coll[0], TUBE.coll[1], TUBE.coll[2], { tone: "mid", inner: L([TUBE.coll[0] + 3, TUBE.coll[1] - 3].map((s) => G.arcOf(TF, s, TUBE.coll[2], P)).join(""), { tone: "faint" }) });
// cradles: a slab under each bare stretch of the shield, its top tangent to the shield, standing on the chamber floor
const CRF = G.frameOf([T_O[0], T_O[1], 0], T_SIDE, unit([TA[0], TA[1], 0]), [0, 0, 1]);
function cradle(name, F, hz, s1, s2, r, half, [footLo, footHi]) {
  // hz(s) → [h, z] of the axis in F's (u, v); the tangent line lies r below along the axis normal
  const [h1, z1] = hz(s1);
  const [h2, z2] = hz(s2);
  const d = [h2 - h1, z2 - z1];
  const len = Math.hypot(d[0], d[1]);
  const n = [d[1] / len, -d[0] / len]; // the normal pointing down
  const nd = n[1] < 0 ? n : [-n[0], -n[1]];
  const q1 = [h1 + r * nd[0], z1 + r * nd[1]];
  const q2 = [h2 + r * nd[0], z2 + r * nd[1]];
  const lo = Math.min(q1[0], q2[0]) - footLo;
  const hi = Math.max(q1[0], q2[0]) + footHi;
  const left = q1[0] < q2[0] ? q1 : q2;
  const right = q1[0] < q2[0] ? q2 : q1;
  // two screws on the face toward the viewer, near the top
  const face = G.dot3(F.a, V) > 0 ? half : -half;
  const mid = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2 - 3.5];
  const screws = [-1, 1].map((d) => at(add(F.o, add(mul(F.a, face), add(mul(F.u, mid[0] + d * 1.2), mul(F.v, mid[1] + d * 1.2 * ((right[1] - left[1]) / (right[0] - left[0] || 1))))))));
  prism(name, F, [[lo, ZF], [hi, ZF], right, left], -half, half, { tone: "mid", extra: D(screws, { size: 0.42 }) });
}
const tubeHz = (s) => [s * Math.cos(30 * DEG), T_O[2] - s * Math.sin(30 * DEG)];
cradle("tube.cradle", CRF, tubeHz, 4.5, 8.5, TUBE.house, 4, [3, 0]);
cradle("tube.cradle", CRF, tubeHz, 27.8, 30.6, TUBE.house, 4, [0, 3]);

// ---------------------------------------------------------------- 2 filter wheel: collimator block, motor behind, wheel in front, apertures live
const E_OFF = G.pointOf(TF, 0, WHEEL.off, WHEEL.psi); // offset of the wheel axis, as a point at s = 0
const OFF = G.sub3(E_OFF, T_O);
const EU = unit(OFF);
const BF = frameAt(G.pointOf(TF, WHEEL.block[0], 0, 0), TA, EU);
prism("filter.block", BF, G.stadium(4.6, 4.4, WHEEL.off, 28), 0, WHEEL.block[1] - WHEEL.block[0], {
  tone: "mid",
  extra: D([G.pointOf(BF, WHEEL.block[1] - WHEEL.block[0], 3, Math.PI * 0.5), G.pointOf(BF, WHEEL.block[1] - WHEEL.block[0], 3, -Math.PI * 0.5)].map(at), { size: 0.4 }),
});
const WF = frameAt(add(T_O, OFF), TA, EU); // wheel frame: axis along the beam through the wheel centre, angle 0 away from the beam
discAt("filter.motor", WF, WHEEL.motor[0], WHEEL.motor[1], WHEEL.motor[2], { tone: "hi", extra: k.fadedSvg(G.ribsOf(WF, WHEEL.motor[0] + 1.5, WHEEL.motor[1] - 1.5, WHEEL.motor[2], 18, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
discAt("filter.motor-cap", WF, WHEEL.motor[0] - 1.6, WHEEL.motor[0], WHEEL.motor[2] - 0.8, { tone: "lo" });
discAt("filter.spindle", WF, WHEEL.spindle[0], WHEEL.spindle[1], 1.4, { tone: "lo" });
discAt("filter.wheel", WF, WHEEL.disc[0], WHEEL.disc[1], WHEEL.r, {
  tone: "mid",
  bevel: 0.3,
  extra:
    L(G.circleOf(WF, WHEEL.disc[1], 2.6, P, 24), { tone: "lo" }) +
    D([at(G.pointOf(WF, WHEEL.disc[1], 0, 0))], { size: 0.5 }) +
    `<path data-part="ap-none" class="xr-void" d=""/><path data-part="ap-al" class="xr-foil xr-foil-al" d=""/><path data-part="ap-cu" class="xr-foil xr-foil-cu" d=""/><path data-part="ap-rims" class="iso-line" data-tone="lo" d=""/>`,
});

// primary beam (lit), wheel → spot, and the fluorescence path, spot → detector window: filled by live.js
{
  const id = R.nameFor("beam.primary");
  const shape = record(A.disc(G.frameAlong(G.pointOf(TF, WHEEL.disc[1], 0, 0), TA), 0, TUBE_L - WHEEL.disc[1], 0.8, { name: id, ground: true }));
  R.put({ at: G.pointOf(TF, (WHEEL.disc[1] + TUBE_L) / 2, 0, 0), name: id, shapes: [shape], svg: `<path data-part="beam" class="xr-beam" d=""/><path data-part="beam-dots" class="xr-photon-lit" d=""/>` });
}
{
  const id = R.nameFor("beam.fluorescence");
  const shape = record(A.disc(DF, 0.6, DET.be[0], 0.6, { name: id, ground: true }));
  R.put({ at: G.pointOf(DF, DET.be[0] / 2, 0, 0), name: id, shapes: [shape], svg: `<path data-part="xray-dots" class="xr-photon" d=""/>` });
}

// ---------------------------------------------------------------- 4 SDD detector: Be window, snout, flange, body, Peltier cooler fins, preamp
discAt("detector.be-window", DF, DET.be[0], DET.be[1], DET.be[2], { tone: "lo" });
discAt("detector.snout", DF, DET.snout[0], DET.snout[1], DET.snout[2], { tone: "mid", inner: L([DET.snout[0] + 4, DET.snout[1] - 4].map((s) => G.arcOf(DF, s, DET.snout[2], P)).join(""), { tone: "faint" }) });
discAt("detector.flange", DF, DET.flange[0], DET.flange[1], DET.flange[2], { tone: "mid", extra: D(G.dotsOf(DF, DET.flange[1], DET.flange[2] - 1.5, 8, P, { phase: Math.PI / 8, fade: [0.04, 0.42] }), { size: 0.42 }) });
discAt("detector.body", DF, DET.body[0], DET.body[1], DET.body[2], { tone: "hi", inner: L(G.arcOf(DF, DET.body[0] + 3, DET.body[2], P), { tone: "faint" }) });
{
  const cuts = [DET.cool[0], ...DET.fins.flatMap((s) => [s, s + 0.8]), DET.cool[1]];
  for (let i = 0; i < cuts.length; i += 2) discAt("detector.cooler", DF, cuts[i], cuts[i + 1], DET.cool[2], { tone: "lo" });
  for (const s of DET.fins) discAt("detector.fin", DF, s, s + 0.8, DET.finR, { tone: "mid" });
}
discAt("detector.preamp", DF, DET.rear[0], DET.rear[1], DET.rear[2], { tone: "mid", bevel: 0.2, extra: D([at(G.pointOf(DF, DET.rear[1], 4.2, 0.6)), at(G.pointOf(DF, DET.rear[1], 4.2, Math.PI + 0.6))], { size: 0.42 }) });
const DCF = G.frameOf([SP[0], SP[1], 0], D_SIDE, unit([DA[0], DA[1], 0]), [0, 0, 1]);
const detHz = (s) => [s * Math.cos(DET_EL), ZS + s * Math.sin(DET_EL)];
cradle("detector.cradle", DCF, detHz, 41, 47, DET.body[2], 4, [3, 3]);
cradle("detector.cradle", DCF, detHz, 62, 64, DET.rear[2], 4, [3, 0]);

// ---------------------------------------------------------------- 1 HV generator with its fan, HV cable to the chamber, HV lead to the tube
{
  const front = HV.y + HV.d;
  box("hv.case", HV, 0, HV.h, {
    tone: "mid",
    bevel: 0.8,
    inner: L(k.sideSeam(HV, HV.h - 5, P, 3), { tone: "faint" }),
    extra: ventsRight(HV.x + HV.w, HV.y + 8, 11, 4.6, 10, 40) + D([at([HV.x + 4, front, 51]), at([HV.x + HV.w - 4, front, 51])], { size: 0.45 }) + D([at([HV.x + 58, front, 44])], { size: 0.8, tone: "hi" }),
  });
  plate("hv.plate", HV.x + 40, front, 38, 22, 9, [16, 11, 7]);
}
const FAN = { x: HV.x + 20, z: 24, r: 13, y: HV.y + HV.d };
{
  const F = G.frameAlong([FAN.x, FAN.y, FAN.z], [0, 1, 0]);
  discAt("hv.fan-guard", F, 0, 1.6, FAN.r + 2, { tone: "lo", extra: L(G.circleOf(F, 1.6, FAN.r, P, 48) + G.circleOf(F, 1.6, FAN.r * 0.62, P, 40) + G.circleOf(F, 1.6, 3, P, 20), { tone: "mid" }) + `<path data-part="fan" class="iso-line" data-tone="lo" d=""/>` + D([at(G.pointOf(F, 1.6, FAN.r + 0.9, Math.PI / 4)), at(G.pointOf(F, 1.6, FAN.r + 0.9, (3 * Math.PI) / 4)), at(G.pointOf(F, 1.6, FAN.r + 0.9, (5 * Math.PI) / 4)), at(G.pointOf(F, 1.6, FAN.r + 0.9, (7 * Math.PI) / 4))], { size: 0.45 }) });
}
const FAN_F = G.frameAlong([FAN.x, FAN.y, FAN.z], [0, 1, 0]);
const HV_FEED = { y: -50, z: 80 };
cable("hv.lead", { name: "tube.hv-receptacle", at: T_O, dir: mul(TA, -1), ring: 0.8 }, { name: "chamber.hv-feed-in", at: [IN.x0, HV_FEED.y, HV_FEED.z], dir: [1, 0, 0] }, [add(T_O, mul(TA, -8))], { r: 1.1, touch: [] });
cable("hv.cable", { name: "chamber.hv-feed-out", at: [CH.x0, HV_FEED.y, HV_FEED.z], dir: [-1, 0, 0], ring: 0.8 }, { name: "hv.port", at: [-146, HV_FEED.y, HV.h], dir: [0, 0, 1], ring: 0.8 }, [[-146, HV_FEED.y, HV_FEED.z]], { r: 1.3, touch: [] });

// ---------------------------------------------------------------- 6 pulse processor / MCA, detector signal cable
{
  const front = MCA.y + MCA.d;
  box("mca.case", MCA, 0, MCA.h, {
    tone: "mid",
    bevel: 0.8,
    inner: L(k.sideSeam(MCA, MCA.h - 5, P, 3), { tone: "faint" }),
    extra: ventsFront(front, MCA.x + 6, 9, 4.4, 8, 26) + ventsRight(MCA.x + MCA.w, MCA.y + 24, 5, 4.4, 8, 26) + D([at([MCA.x + 50, front, 28]), at([MCA.x + 55, front, 28])], { size: 0.8, tone: "hi" }) + D([at([MCA.x + 4, front, 32]), at([MCA.x + MCA.w - 4, front, 32])], { size: 0.45 }),
  });
  plate("mca.plate", MCA.x + 44, front, 8, 14, 6, [9, 6]);
}
const SIG = { y: -18, z: 83 };
cable("detector.signal", { name: "detector.connector", at: G.pointOf(DF, DET.rear[1], 0, 0), dir: DA, ring: 0.8 }, { name: "chamber.sig-feed-in", at: [IN.x1, SIG.y, SIG.z], dir: [-1, 0, 0] }, [G.pointOf(DF, DET.rear[1] + 7, 0, 0)], { r: 0.8, touch: [] });
cable("mca.signal", { name: "chamber.sig-feed-out", at: [CH.x1, SIG.y, SIG.z], dir: [1, 0, 0], ring: 0.8 }, { name: "mca.sig-port", at: [138, SIG.y, MCA.h], dir: [0, 0, 1], ring: 0.8 }, [[138, SIG.y, SIG.z]], { r: 0.8, touch: [] });

// ---------------------------------------------------------------- 5 helium purge: cylinder, regulator, valve; small vacuum pump
B.bottle("helium", { x: HE.x, y: HE.y, z0: 0, r: HE.r, body: HE.h, shoulder: 10, neck: 3.4, neckH: 3, cap: 4, capH: 5, knurl: 22, capDot: null, level: 12, bands: [HE.h - 12], port: 1.8, portName: "valve" });
const HE_TOP = HE.h + 10 + 3 + 5 + 2;
const HREG = { x: HE.x - 6, y: HE.y - 4, w: 12, d: 8, r: 1.2, z: HE_TOP };
box("helium.regulator", HREG, HREG.z, 10, { tone: "hi", crease: "lo", bevel: 0.4 });
{
  const F = G.frameAlong([HE.x + 2, HREG.y + HREG.d, HREG.z + 5], [0, 1, 0]);
  discAt("helium.gauge", F, 0, 2, 2.6, { tone: "mid", extra: L(G.circleOf(F, 2, 2, P, 20), { tone: "lo" }) + L(k.segment(G.pointOf(F, 2, 0, 0), G.pointOf(F, 2, 1.6, 2.3), P), { tone: "hi", free: "end" }) });
}
const HE_OUT_F = G.frameAlong([HREG.x, HE.y, HREG.z + 5], [-1, 0, 0]);
discAt("helium.outlet", HE_OUT_F, 0, 2, 1.4, { tone: "mid" });
// purge valve on a straight run beside the chamber: body along x, bonnet and hand knob on top
const VALVE = { x0: 100, x1: 108, y: -46, z: 68, r: 2.6 };
{
  const F = G.frameAlong([VALVE.x1, VALVE.y, VALVE.z], [-1, 0, 0]);
  discAt("purge.valve", F, 0, VALVE.x1 - VALVE.x0, VALVE.r, { tone: "hi", extra: D(G.dotsOf(F, 0, VALVE.r - 0.8, 6, P, { all: true }), { size: 0.35 }) });
  const xm = (VALVE.x0 + VALVE.x1) / 2;
  cyl("purge.bonnet", xm, VALVE.y, 1.3, VALVE.z + Math.sqrt(VALVE.r ** 2 - 1.3 ** 2), 4, { tone: "mid", steps: 14 });
  const zk = VALVE.z + Math.sqrt(VALVE.r ** 2 - 1.3 ** 2) + 4;
  cyl("purge.knob", xm, VALVE.y, 3.2, zk, 2.4, { tone: "lo", extra: L(k.knurl(xm, VALVE.y, 3.2, zk + 0.4, zk + 2, 20, P), { tone: "faint" }) + D([at([xm, VALVE.y, zk + 2.4])], { size: 0.45 }) });
}
const HE_PORT_F = G.frameAlong([CH.x1, VALVE.y, VALVE.z], [1, 0, 0]);
discAt("chamber.he-port", HE_PORT_F, 0, 2.5, 2, { tone: "mid", extra: L(G.circleOf(HE_PORT_F, 2.5, 0.8, P, 12), { tone: "faint" }) });
const heStart = G.pointOf(HE_OUT_F, 2, 0, 0);
pipe("purge.he-supply", [heStart, [124, HE.y, heStart[2]], [124, VALVE.y, heStart[2]], [124, VALVE.y, VALVE.z], [VALVE.x1, VALVE.y, VALVE.z]], 0.8, { bend: 5, nutR: 1.4 });
pipe("purge.he-chamber", [[VALVE.x0, VALVE.y, VALVE.z], G.pointOf(HE_PORT_F, 2.5, 0, 0)], 0.8, { nutR: 1.4 });
// rotary vacuum pump with its motor, and the vacuum line to the chamber's KF port
{
  box("vacuum.pump", PUMP, 0, PUMP.h, { tone: "mid", bevel: 0.6, inner: L(k.sideSeam(PUMP, PUMP.h - 4, P, 3), { tone: "faint" }), extra: D([at([PUMP.x + 3, PUMP.y + PUMP.d, PUMP.h - 2]), at([PUMP.x + PUMP.w - 3, PUMP.y + PUMP.d, PUMP.h - 2])], { size: 0.45 }) + ventsFront(PUMP.y + PUMP.d, PUMP.x + 5, 5, 4.4, 5, 15) });
  const mF = G.frameAlong([PUMP.x + PUMP.w, PUMP.y + PUMP.d / 2, 10], [1, 0, 0]);
  discAt("vacuum.motor", mF, 0, 12, 8, { tone: "hi", extra: k.fadedSvg(G.ribsOf(mF, 2, 10, 8, 26, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
  discAt("vacuum.fan-cover", mF, 12, 14.5, 7.2, { tone: "lo", extra: L(G.circleOf(mF, 14.5, 3.2, P, 24), { tone: "faint" }) + D([at(G.pointOf(mF, 14.5, 0, 0))], { size: 0.5, tone: "mid" }) });
}
const VAC_IN = [PUMP.x + 10, PUMP.y + 10];
cyl("vacuum.inlet", VAC_IN[0], VAC_IN[1], 2.6, PUMP.h, 3, { tone: "lo" });
const VAC_PORT_F = G.frameAlong([CH.x1, VAC_IN[1], 42], [1, 0, 0]);
discAt("chamber.vac-port", VAC_PORT_F, 0, 2.5, 3.4, { tone: "mid", extra: L(G.circleOf(VAC_PORT_F, 2.5, 1.6, P, 16), { tone: "faint" }) });
pipe("vacuum.line", [[VAC_IN[0], VAC_IN[1], PUMP.h + 3], [VAC_IN[0], VAC_IN[1], 42], G.pointOf(VAC_PORT_F, 2.5, 0, 0)], 1.4, { bend: 3.4, nutR: 2.6, tone: "mid" });

// ---------------------------------------------------------------- 6 LCD panel with the spectrum, cabled to the MCA
const SCREEN = { x0: 169, x1: 243, z0: 34, z1: 79, r: 2.4 };
const E_AXIS = [0, 30]; // keV across the plot
const AXIS_LABELS = [0, 10, 20];
// keV numbers under the axis and an empty group for the peak names (live.js), in screen coordinates (x, −z)
const plotOf = (PLOT) => ({ ...PLOT, x1: PLOT.x1 - 3 });
const xOfE = (PLOT, E) => PLOT.x0 + ((PLOT.x1 - PLOT.x0) * (E - E_AXIS[0])) / (E_AXIS[1] - E_AXIS[0]);
const PLOT_GUESS = plotOf({ x0: SCREEN.x0 + 4, x1: SCREEN.x1, z0: SCREEN.z0 + 6, z1: SCREEN.z1 - 8 });
const AXIS_TEXT = AXIS_LABELS.map((E) => `<text class="bx-lcd-text xr-lcd-small" x="${xOfE(PLOT_GUESS, E).toFixed(2)}" y="${-(SCREEN.z0 + 1.6)}" font-size="2.6" text-anchor="middle">${E}</text>`).join("") + `<text class="bx-lcd-text xr-lcd-small" x="${SCREEN.x1 - 2.4}" y="${-(SCREEN.z0 + 1.6)}" font-size="2.6" text-anchor="end">keV</text>`;
const PLOT_RAW = B.panel("panel", {
  base: { x: 184, y: 26, w: 44, d: 30, r: 3 },
  neck: { x: 206, y: 42, r: 3.4 },
  body: { x: 164, x1: 248, y: 38, y1: 46, z0: 24, z1: 84 },
  screen: SCREEN,
  buttons: [[170, 29], [177, 29], [184, 29]],
  led: [242, 29],
  inset: [4, 6, 8],
  cable: [
    { name: "mca.data-port", at: [MCA.x + MCA.w, 12, 6], dir: [1, 0, 0], ring: 0.9 },
    { name: "panel.data-port", at: [184, 40, 2.6], dir: [-1, 0, 0] },
    [[160, 12, 6], [166, 12, 0.62], [166, 40, 0.62], [176, 40, 0.62], [179, 40, 2.6]],
  ],
  text: { clock: "", phase: "" },
  extra: AXIS_TEXT + `<g data-part="peaks" class="xr-peaks"></g>`,
});
const PLOT = plotOf(PLOT_RAW);

// ---------------------------------------------------------------- settle, sort, page
const BODY = B.settle();
const LABEL =
  "A benchtop energy-dispersive X-ray fluorescence spectrometer on a bench, its sample chamber drawn with the lid raised on its back hinge and the front wall cut away. A rhodium-anode X-ray tube in a finned shield, fed by a high-voltage cable from the generator on the left, points down at 30 degrees through a beryllium window and a collimator at a motorised filter wheel with open, aluminium and copper positions. The lit primary beam leaves the selected filter and lights a spot on the Mylar film of a sample cup on a spinner. Fluorescence photons travel from the spot to a silicon drift detector with a beryllium window and a finned Peltier cooler, at 90 degrees to the beam, whose signal cable runs to the pulse processor. A helium cylinder with a regulator and purge valve and a small vacuum pump feed the chamber; an interlock switch on the wall meets a tongue on the lid. A panel shows the spectrum with its peaks named.";
const svg = k.figureSvg({ width: W, height: H, label: LABEL, body: [...back, BODY], className: "xr-svg" });

// ---------------------------------------------------------------- live data
const DATA = {
  P,
  tube: { o: TF.o, a: TA, u: TF.u, v: TF.v },
  beam: { s0: WHEEL.disc[1], s1: TUBE_L, r: BEAM_R },
  wheel: { o: WF.o, a: TA, u: WF.u, v: WF.v, s: WHEEL.disc[1], off: WHEEL.off, hole: WHEEL.hole, order: ["none", "al", "cu"] },
  det: { o: DF.o, a: DA, u: DF.u, v: DF.v, s1: DET.be[0] },
  spin: { c: SP0, r: SPIN.plate, z: ZF + SPIN.baseH + SPIN.plateH, rps: SPIN_RPS },
  fan: { o: FAN_F.o, a: FAN_F.a, u: FAN_F.u, v: FAN_F.v, s: 1.6, r0: 3, r1: FAN.r * 0.62, r2: FAN.r, rps: 6 },
  plot: PLOT,
  screen: SCREEN,
  eAxis: E_AXIS,
  defaults: M.DEFAULTS,
  limits: M.LIMITS,
  speed: { beam: 40, xray: 26 }, // photon dots' drawn speed, world units per second (illustrative; real photons are instantaneous)
  acq: 4, // acquisition clock runs this many times faster than real time
};
const MODEL = moduleText(join(HERE, "model.mjs"));
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const CSS = readFileSync(join(HERE, "xrf.css"), "utf8");

const r0 = M.run(M.DEFAULTS);
const E0 = 8.05;
const id0 = M.identify(r0, E0);
const fmtCps = (c) => (c >= 1e3 ? `${(c / 10 ** Math.floor(Math.log10(c))).toFixed(1)}e${Math.floor(Math.log10(c))}` : c.toFixed(0));
const readout0 = `${M.DEFAULTS.kV} kV ${M.DEFAULTS.uA} µA · ${fmtCps(r0.inCps)}→${fmtCps(r0.outCps)} cps · DT ${(r0.dead * 100).toFixed(1)} % · ${E0.toFixed(2)} keV ${id0 ? id0.label : "—"}`;
const radios = (key, name, options, value) =>
  `<fieldset class="xr-seg" data-group="${key}"><legend class="bx-ctl-name">${name}</legend>${options.map(([v, text]) => `<label><input type="radio" name="xr-${key}" value="${v}"${v === value ? " checked" : ""}><span>${text}</span></label>`).join("")}</fieldset>\n`;
let controls = controlsHtml(
  [
    { key: "kV", name: "Tube", min: M.LIMITS.kV[0], max: M.LIMITS.kV[1], step: 1, value: M.DEFAULTS.kV, text: `${M.DEFAULTS.kV} kV`, valuetext: `${M.DEFAULTS.kV} kilovolts` },
    { key: "uA", name: "Current", min: M.LIMITS.uA[0], max: M.LIMITS.uA[1], step: 5, value: M.DEFAULTS.uA, text: `${M.DEFAULTS.uA} µA`, valuetext: `${M.DEFAULTS.uA} microamps` },
  ],
  `real 0.0 / ${M.DEFAULTS.live} s, live 0.0 s · ${M.SAMPLES[M.DEFAULTS.sample].label} · ${M.FILTERS[M.DEFAULTS.filter].label} · ${M.DEFAULTS.atm}`,
);
controls = controls.replace(
  '<span class="bx-note"',
  radios("filter", "Filter", Object.entries(M.FILTERS).map(([v, f]) => [v, v === "none" ? "none" : f.label.split(" ")[0]]), M.DEFAULTS.filter) +
    radios("atm", "Path", [["air", "air"], ["he", "He"], ["vac", "vacuum"]], M.DEFAULTS.atm) +
    radios("sample", "Sample", Object.entries(M.SAMPLES).map(([v, s]) => [v, v === "plastic" ? "plastic" : s.label]), M.DEFAULTS.sample) +
    '<span class="bx-note"',
);
const stage = stageHtml(svg, {
  label: "EDXRF spectrometer. Left and right arrow keys move the spectrum cursor in energy; Shift for steps of 1 keV, Home and End for the limits.",
  min: M.LIMITS.cursor[0],
  max: M.LIMITS.cursor[1],
  now: E0,
  valuetext: `${E0.toFixed(2)} keV, ${id0 ? id0.label : "no line"}`,
});
const page = pageOf({
  title: "EDXRF spectrometer",
  theme: THEME,
  width: 980,
  css: CSS,
  plate: {
    fig: "Fig 3",
    title: "EDXRF · Rh tube, SDD",
    hint: "← → keV · sliders · filter, path, sample",
    readout: readout0,
    keys: [
      { mark: "lit", label: "Primary beam from the selected filter and the excitation spot it lights on the sample's Mylar film" },
      { mark: "raised", label: "Fluorescence photons on their way to the silicon drift detector; their rate follows the output count rate" },
      { mark: "edge", label: "High-voltage cable and lead, detector signal cables, helium purge and vacuum lines" },
    ],
    caption: `The tube runs at ${M.DEFAULTS.kV} kV and ${M.DEFAULTS.uA} µA; its Kramers continuum and Rh Kα/Kβ lines (${M.TUBE.rhKa} and ${M.TUBE.rhKb} keV, above the ${M.TUBE.rhK} keV K edge) pass a primary filter (none, Al 100 µm or Cu 25 µm) and excite each element whose absorption edge lies below the tube voltage: Pb L3 needs ${M.ELEMENTS.Pb.edge} kV and Sr K ${M.ELEMENTS.Sr.edge} kV, so their peaks vanish when the voltage drops below them; Fe (${M.ELEMENTS.Fe.edge} keV) stays excited down to the 10 kV minimum. The air path (${M.GEOM.pathAir} cm in all) absorbs light-element lines, which helium or vacuum restore. The SDD (Be 12.5 µm, Si 450 µm) has a resolution of ${Math.round(Math.sqrt(M.DET.noise2 + M.DET.fano * M.DET.eps * 5899) * 2.355)} eV at Mn Kα, and paralysable dead time τ = ${M.DET.tau * 1e6} µs: at the defaults on brass ${fmtCps(r0.inCps)} cps come in, ${fmtCps(r0.outCps)} are counted, ${(r0.dead * 100).toFixed(1)} % dead. The spectrum is accumulated over a ${M.DEFAULTS.live} s preset time, shown ${DATA.acq}× faster than real time; photons are drawn at ${DATA.speed.beam} and ${DATA.speed.xray} units/s and the spinner turns at an assumed ${SPIN_RPS} rev/s. The lid is drawn raised: in use it is closed and its tongue holds the interlock plunger down; opening it cuts the high voltage.`,
    body: stage + controls,
  },
  script: scriptOf(kitScript(), MODEL, LIVE_CORE, LIVE),
});
const name = THEME === "light" ? "xrf-light.html" : "xrf.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${R.solids.length} solids`, `${R.tubes.length} tube runs`);

A.auditOrExit(R, P);
