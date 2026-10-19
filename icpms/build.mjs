// ICP-MS on a bench: an isometric Hero figure built with the anatomy kit.
// node icpms/build.mjs [--light] [--audit]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import * as A from "../kit/audit.mjs";
import { glCamera } from "../kit/gl.mjs";
import { kitScript, glScript } from "../scripts/inline-kit.mjs";
import { makeBench, moduleText, LIVE_CORE, controlsHtml, stageHtml, pageOf, scriptOf } from "../common/bench.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- world plan (x along the ion path, y toward the viewer, z up)
const W = 900;
const H = 460;
const AZIMUTH = 64;
const ELEVATION = 30;

const BENCH = { x: -338, y: -82, w: 584, d: 150, r: 8 };
const BENCH_H = 10;
const FOOT_H = 5;
const ZA = 70; // ion axis height (y = 0)

// frame along the ion axis: angle 0 points to +y, 90° to +z
const FX = (x, y = 0, z = ZA) => G.frameOf([x, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const AX = FX(0);
const ax = (x) => [x, 0, ZA];

// sample introduction
const AS = { x: -330, y: -34, w: 52, d: 62, r: 3 }; // autosampler base
const AS_TOP = 18;
const RACK = { x: -326, y: -12, w: 44, d: 36, r: 2 };
const VIALS = [-316, -302, -288].flatMap((x) => [-3, 13].map((y) => [x, y]));
const VIAL = { r: 3.6, h: 11, cap: 3.9, capH: 3 };
const VIAL_TOP = AS_TOP + 4 + VIAL.h + VIAL.capH;
const PROBE = { x: -302, y: -3 }; // the vial being sampled
const TOWER = { x: -302, y: -27, r: 3.2, z1: 92 };
const PUMP = { x: -270, y: -22, w: 34, d: 44, r: 2.5 };
const PUMP_H = 56;
const ROTOR = { x: -254, z: 38, r: 8, y0: PUMP.y + PUMP.d, depth: 3 };
const TUBE_Y = ROTOR.y0 + 1 + ROTOR.depth / 2;
const SAMPLE_R = 0.8;
const WRAP = ROTOR.r + SAMPLE_R + 0.7;
const PUMP_RPS = 0.1; // assumed pump speed (not in model.mjs): sets roller motion only

const NEB = { x0: -238, x1: -218, r: 2.6, arm: -230 };
const SPRAY = { x0: -214, len: 30, r: 11, shoulder: 12, neck: 3.2, neckL: 7 };
const SPRAY_X1 = SPRAY.x0 + SPRAY.len + SPRAY.shoulder + SPRAY.neckL; // -165
const CLAMP = { x0: SPRAY_X1, x1: SPRAY_X1 + 5, r: 4.8 };
const PED = { x: -212, y: -15, w: 40, d: 30, r: 2.5 };
const PED_H = 50;

// torch, coil and torch box
const TORCH = { inj: [CLAMP.x1, CLAMP.x1 + 7, 2.4], aux: [CLAMP.x1 + 7, CLAMP.x1 + 13, 6.2], outer: [CLAMP.x1 + 13, -104, 9, 8] };
const MOUTH = TORCH.outer[1];
const TB = { x: -148, x1: -86, y: -34, y1: 34, z0: 40, z1: 106, wall: 4 };
const COIL = { x0: -126, pitch: 5.4, turns: 3, R: 13.2, r: 1.0 };
const RFG = { x: TB.x, y: TB.y, w: TB.x1 - TB.x, d: TB.y1 - TB.y, r: 3 };

// interface and vacuum chamber
const FLANGE = { x0: -86, x1: -80, r: 17 };
const SAMPLER_TIP = FLANGE.x0 - 10;
const VC = { x: -80, x1: 152, y: -28, y1: 28, z0: 34, z1: 106, wall: 4 };
const RAIL = { x: -72, w: 218, y: -5, d: 10, z0: VC.z0 + VC.wall, h: 3 };
const RAIL_TOP = RAIL.z0 + RAIL.h;
const SKIM = { plate: [-58, -55], r: 13, tip: -68 };
const EXTRACT = { x0: -46, x1: -44, r: 9, hole: 1.6 };
const LENSES = [-36, -28, -20].map((x) => ({ x0: x, x1: x + 3, rIn: 3.2, rOut: 8 }));
const CELL = { x0: -8, x1: 30, plate: 3, r: 10, rods: 8, rc: 4.4, rr: 0.9 };
const QUAD = { x0: 40, x1: 108, collar: 4, r: 14, rr: 4.5, rc: 8.5 };
const DET = { x: 118, x1: 142, y: -12, y1: 12, z0: 54, z1: 84 };
const VIEW_ANGLE = Math.atan2(Math.sin(ELEVATION * DEG), Math.cos(ELEVATION * DEG) * Math.sin(AZIMUTH * DEG)); // angle of the view in the y-z plane

// support
const TURBO = { x: 50, y: 0, r: 15, flange: 18 };
const ROT = { x: 84, y: -14, w: 32, d: 28, r: 3, h: 26 };
const AR = { x: -306, y: -66, r: 13, h: 118 };
const HE = { x: 214, y: -60, r: 9, h: 91 };
const CHILL = { x: -206, y: -80, w: 50, d: 34, r: 3 };
const CHILL_H = 46;

const P = k.fitProjection(
  [...k.boxCorners(BENCH, -BENCH_H - FOOT_H, 0), [AR.x, AR.y, 160], [HE.x, HE.y, 122], [-100, 0, 124], [236, 38, 80], [-330, 28, 0]],
  W,
  H,
  { pad: 30, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const R = A.recorder(P);
const B = makeBench(P, R, KS, { bench: BENCH, benchH: BENCH_H, footH: FOOT_H, ns: "ic" });
const iso3 = (p) => k.iso(p, P);
const { at, S, L, D, rounded, onFront, onRight, onTop, record, put, box, cyl, discAt, ballAt, pipe, tubeItems, onBall } = B;

// a turned part from a profile [[s, r(, smooth)]] in frame F
function turned(name, F, profile, { tone = "mid", extra = "", inner = "", bias = 0, smooth, owner, lit = false } = {}) {
  const id = R.nameFor(name);
  const shape = record(A.solid(F, profile.map(([s, r]) => [s, r]), { name: id, owner, radius: smooth?.radius ?? null }));
  const s0 = profile[0][0];
  const s1 = profile[profile.length - 1][0];
  R.put({ at: G.pointOf(F, (s0 + s1) / 2, 0, 0), bias, name: id, shapes: [shape], svg: S(G.solidOf(profile, F, P, smooth ? { smooth } : {}), { tone, inner, lit }) + extra });
  return shape;
}
// an annulus on frame F (ring lens, collar)
function annulus(name, F, s0, s1, rIn, rOut, { tone = "mid", extra = "", bias = 0 } = {}) {
  const id = R.nameFor(name);
  const shape = record(A.ring(F, s0, s1, rIn, rOut, { name: id }));
  const voidD = G.circleOf(F, s1, rIn, P);
  R.put({ at: G.pointOf(F, (s0 + s1) / 2, 0, 0), bias, name: id, shapes: [shape], svg: S(G.disc(s0, s1, rOut, F, P), { tone }) + `<path class="ic-void" d="${voidD}"/>` + L(voidD, { tone: "lo" }) + extra });
  return shape;
}
const voidOn = (F, s, r) => `<path class="ic-void" d="${G.circleOf(F, s, r, P)}"/>` + L(G.circleOf(F, s, r, P), { tone: "lo" });
// row of vent slots on a vertical face
const ventsFront = (y, x0, n, gap, z0, z1) => L(Array.from({ length: n }, (_, i) => rounded(x0 + i * gap, z0, x0 + i * gap + 1.4, z1, 0.7, onFront(y))).join(""), { tone: "faint" });
const ventsRight = (x, y0, n, gap, z0, z1) => L(Array.from({ length: n }, (_, i) => rounded(y0 + i * gap, z0, y0 + i * gap + 1.4, z1, 0.7, onRight(x))).join(""), { tone: "faint" });
// a small label plate standing proud of a front face, with rule lines for text
function plate(name, x, y, z, w, h, rules) {
  box(name, { x, y, w, d: 0.6, r: 0.2 }, z, h, {
    tone: "lo",
    steps: 2,
    bevel: 0,
    crease: "none",
    extra: L(rules.map((rw, i) => k.segment([x + 2, y + 0.6, z + h - 2.6 - i * 2.2], [x + 2 + rw, y + 0.6, z + h - 2.6 - i * 2.2], P)).join(""), { tone: "faint", free: true }),
  });
}

// ---------------------------------------------------------------- bench
const back = B.stand({
  strip: { x: -40, w: 200 },
  label: { x: -328 },
  shadows: [
    [AS, 6], [PUMP, 6], [PED, 5], [RFG, 8], [{ x: VC.x, y: VC.y, w: VC.x1 - VC.x, d: VC.y1 - VC.y, r: 3 }, 6], [ROT, 5], [CHILL, 5],
    [{ x: AR.x - AR.r, y: AR.y - AR.r, w: 2 * AR.r, d: 2 * AR.r, r: AR.r }, 4], [{ x: HE.x - HE.r, y: HE.y - HE.r, w: 2 * HE.r, d: 2 * HE.r, r: HE.r }, 4],
  ],
});

// ---------------------------------------------------------------- 1 autosampler, vials, probe arm
{
  const front = AS.y + AS.d;
  box("sampler.case", AS, 0, AS_TOP, {
    tone: "mid",
    bevel: 0.8,
    inner: L(k.sideSeam(AS, 4, P, 3), { tone: "faint" }),
    extra: L(rounded(-326, 7, -300, 15, 1.6, onFront(front)), { tone: "faint" }) + D([at([-286, front, 11])], { size: 0.8, tone: "hi" }) + D([at([-327, front, 15.5]), at([-281, front, 15.5])], { size: 0.45 }) + ventsRight(AS.x + AS.w, -26, 8, 4.4, 6, 14),
  });
  box("sampler.rack", RACK, AS_TOP, 4, { tone: "lo", bevel: 0.4, extra: D(k.corners(RACK, 2).map(([x, y]) => at([x, y, AS_TOP + 4])), { size: 0.4 }) });
  for (const [x, y] of VIALS) {
    cyl("sampler.vial", x, y, VIAL.r, AS_TOP + 4, VIAL.h, { tone: "mid", inner: L(k.sideArc(x, y, VIAL.r, AS_TOP + 4 + VIAL.h - 4, P, 18), { tone: "lo" }) });
    cyl("sampler.vial-cap", x, y, VIAL.cap, AS_TOP + 4 + VIAL.h, VIAL.capH, { tone: "lo", extra: L(k.ring(x, y, 1.6, VIAL_TOP, P, 16), { tone: "mid" }) });
  }
  cyl("sampler.tower", TOWER.x, TOWER.y, TOWER.r, AS_TOP, TOWER.z1 - AS_TOP, { tone: "mid", inner: L(k.sideArc(TOWER.x, TOWER.y, TOWER.r, AS_TOP + 10, P, 16), { tone: "faint" }) });
  box("sampler.arm", { x: TOWER.x - 3, y: TOWER.y - 3, w: 6, d: 40, r: 1 }, TOWER.z1, 5, {
    tone: "mid",
    bevel: 0.4,
    extra: L(k.lineOnTop([TOWER.x, TOWER.y - 3], [TOWER.x, TOWER.y + 37], TOWER.z1 + 5, P), { tone: "faint" }) + D([at([TOWER.x, TOWER.y, TOWER.z1 + 5]), at([TOWER.x, TOWER.y + 34, TOWER.z1 + 5])], { size: 0.45 }),
  });
}
const CARR = { x: PROBE.x - 4, y: PROBE.y - 4, w: 8, d: 8, r: 0.8 };
const CARR_Z = [TOWER.z1 - 9, TOWER.z1];
box("sampler.carriage", CARR, CARR_Z[0], CARR_Z[1] - CARR_Z[0], { tone: "hi", crease: "lo", bevel: 0.3, extra: D([at([PROBE.x - 2.4, CARR.y + CARR.d, CARR_Z[0] + 2]), at([PROBE.x + 2.4, CARR.y + CARR.d, CARR_Z[0] + 2])], { size: 0.4 }) });
cyl("sampler.probe", PROBE.x, PROBE.y, 0.6, VIAL_TOP, CARR_Z[0] - VIAL_TOP, { tone: "hi", steps: 12 });
const PROBE_PORT_F = G.frameAlong([PROBE.x, CARR.y + CARR.d, CARR_Z[0] + 5], [0, 1, 0]);
discAt("sampler.probe-port", PROBE_PORT_F, 0, 1.6, 1.5, { tone: "mid" });

// ---------------------------------------------------------------- 1 peristaltic pump
{
  const front = PUMP.y + PUMP.d;
  box("pump.case", PUMP, 0, PUMP_H, {
    tone: "mid",
    bevel: 0.8,
    inner: L(k.sideSeam(PUMP, 6, P, 3), { tone: "faint" }),
    extra: L(rounded(-268, 10, -238, 20, 1.6, onFront(front)), { tone: "faint" }) + ventsRight(PUMP.x + PUMP.w, -16, 7, 4.4, 10, 22) + D([at([-241, front, 15]), at([-265, front, 15])], { size: 0.45 }),
  });
  plate("pump.plate", -266, front, 48, 14, 5, [9, 6]);
  const F = G.frameAlong([ROTOR.x, ROTOR.y0, ROTOR.z], [0, 1, 0]);
  discAt("pump.rotor-boss", F, 0, 1, ROTOR.r + 2.4, { tone: "lo" });
  discAt("pump.rotor", F, 1, 1 + ROTOR.depth, ROTOR.r, {
    tone: "hi",
    extra: `<path data-part="rollers" class="ic-roller" d=""/>` + L(G.circleOf(F, 1 + ROTOR.depth, 2, P, 20), { tone: "lo" }) + D([at(G.pointOf(F, 1 + ROTOR.depth, 0, 0))], { size: 0.5, tone: "mid" }),
  });
  // occlusion shoe on its lever below the rotor
  box("pump.shoe", { x: ROTOR.x - 9, y: ROTOR.y0, w: 18, d: ROTOR.depth + 1, r: 0.8 }, ROTOR.z - ROTOR.r - SAMPLE_R * 2 - 6.6, 4, { tone: "mid", bevel: 0.3 });
  box("pump.lever", { x: ROTOR.x + 11, y: ROTOR.y0, w: 3, d: 2.4, r: 0.6 }, 12, 22, { tone: "hi", steps: 2, bevel: 0.2 });
}
const ROTOR_F = G.frameAlong([ROTOR.x, ROTOR.y0 + 1 + ROTOR.depth, ROTOR.z], [0, 1, 0]);

// ---------------------------------------------------------------- 2 nebulizer and spray chamber on a Peltier pedestal
box("spray.pedestal", PED, 0, PED_H, {
  tone: "mid",
  bevel: 0.8,
  inner: L(k.sideSeam(PED, PED_H - 4, P, 3), { tone: "faint" }),
  extra: ventsFront(PED.y + PED.d, -206, 7, 4, 12, 34) + D([at([-178, PED.y + PED.d, 44])], { size: 0.8, tone: "hi" }),
});
const SPRAY_F = FX(SPRAY.x0);
{
  for (const x of [SPRAY.x0 + 6, SPRAY.x0 + 24]) box("spray.cradle", { x: x - 3, y: -6, w: 6, d: 12, r: 1 }, PED_H, ZA - SPRAY.r - PED_H, { tone: "lo", steps: 2, bevel: 0.3 });
  discAt("spray.body", SPRAY_F, 0, SPRAY.len, SPRAY.r, { tone: "hi", inner: L([4, SPRAY.len - 6].map((s) => G.arcOf(SPRAY_F, s, SPRAY.r, P)).join(""), { tone: "faint" }) });
  const radius = (s) => SPRAY.neck + (SPRAY.r - SPRAY.neck) * Math.cos((Math.PI / 2) * Math.min(1, Math.max(0, (s - SPRAY.len) / SPRAY.shoulder)));
  const slope = (s) => -(SPRAY.r - SPRAY.neck) * (Math.PI / 2 / SPRAY.shoulder) * Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, (s - SPRAY.len) / SPRAY.shoulder)));
  const prof = Array.from({ length: 21 }, (_, i) => {
    const s = SPRAY.len + (i / 20) * SPRAY.shoulder;
    return [s, radius(s), i > 0 && i < 20 ? 1 : 0];
  });
  turned("spray.shoulder", SPRAY_F, prof, { tone: "hi", smooth: { slope, radius } });
  discAt("spray.neck", SPRAY_F, SPRAY.len + SPRAY.shoulder, SPRAY.len + SPRAY.shoulder + SPRAY.neckL, SPRAY.neck, { tone: "hi" });
  const capF = FX(SPRAY.x0);
  discAt("spray.end-cap", capF, -4, 0, SPRAY.r - 1.5, { tone: "mid", bevel: 0.3 });
}
const CLAMP_F = FX(CLAMP.x0);
discAt("torch.ball-clamp", CLAMP_F, 0, CLAMP.x1 - CLAMP.x0, CLAMP.r, { tone: "mid", extra: k.fadedSvg(G.ribsOf(CLAMP_F, 0, CLAMP.x1 - CLAMP.x0, CLAMP.r, 18, P, { fade: [0.1, 0.55] }), { tone: "lo" }) });
// concentric nebulizer: glass body into the end cap, sample nut at the tail, gas side arm on top
const NEB_F = FX(NEB.x0);
discAt("nebulizer.body", NEB_F, 0, SPRAY.x0 - 4 - NEB.x0, NEB.r, { tone: "hi", inner: L(G.arcOf(NEB_F, 6, NEB.r, P), { tone: "faint" }) });
const ARM_F = G.frameAlong([NEB.arm, 0, ZA + Math.sqrt(NEB.r ** 2 - 1.4 ** 2)], [0, 0, 1]);
const ARM_TOP = ZA + 7;
discAt("nebulizer.arm", ARM_F, 0, ARM_TOP - ARM_F.o[2], 1.4, { tone: "hi" });

// ---------------------------------------------------------------- 3 RF generator and torch box
{
  const front = RFG.y + RFG.d;
  box("rf.case", RFG, 0, TB.z0, {
    tone: "mid",
    bevel: 0.8,
    inner: L(k.sideSeam(RFG, 4, P, 3), { tone: "faint" }),
    extra: ventsFront(front, -142, 9, 4.2, 10, 30) + L(rounded(-100, 10, -90, 30, 1.4, onFront(front)), { tone: "faint" }) + D([at([-95, front, 34])], { size: 0.8, tone: "hi" }) + D([at([-145, front, 37]), at([-89, front, 37])], { size: 0.45 }) + ventsRight(RFG.x + RFG.w, -26, 11, 4.6, 8, 32),
  });
  plate("rf.plate", -136, front, 32, 18, 6, [12, 8]);
}
const TBF = { x: TB.x, y: TB.y, w: TB.x1 - TB.x, d: TB.y1 - TB.y, r: 2 };
box("torchbox.floor", TBF, TB.z0, TB.wall, { tone: "mid", bevel: 0.5, extra: L(k.planOutline(k.insetPlan(TBF, 5), TB.z0 + TB.wall, P, 3), { tone: "faint" }) });
box("torchbox.back", { x: TB.x, y: TB.y, w: TB.x1 - TB.x, d: TB.wall, r: 0.8 }, TB.z0 + TB.wall, TB.z1 - TB.z0 - 2 * TB.wall, {
  tone: "mid",
  steps: 2,
  bevel: 0,
  extra: L(Array.from({ length: 6 }, (_, i) => rounded(-136 + i * 8, 56, -131 + i * 8, 90, 1.2, onFront(TB.y + TB.wall))).join(""), { tone: "faint" }),
});
box("torchbox.top", TBF, TB.z1 - TB.wall, TB.wall, { tone: "mid", bevel: 0.5, inner: L(k.sideSeam(TBF, TB.z1 - 1.5, P, 3), { tone: "faint" }), extra: D([[TB.x + 4, TB.y1 - 3], [TB.x1 - 4, TB.y1 - 3], [TB.x + 4, TB.y + 3], [TB.x1 - 4, TB.y + 3]].map(([x, y]) => at([x, y, TB.z1])), { size: 0.45 }) });
// chimney on the roof
cyl("torchbox.chimney", -116, -14, 9, TB.z1, 8, { tone: "mid", bevel: 0.4, extra: L(k.ring(-116, -14, 6.6, TB.z1 + 8, P, 40), { tone: "lo" }) + L(k.knurl(-116, -14, 9, TB.z1 + 2, TB.z1 + 6, 30, P), { tone: "faint" }), inner: L([TB.z1 + 2, TB.z1 + 6].map((z) => k.sideArc(-116, -14, 9, z, P, 40)).join(""), { tone: "faint" }) });

// torch: injector, auxiliary tube and outer tube (quartz), plasma inside the outer tube
const TOR_F = FX(0);
const [ix0, ix1, ir] = TORCH.inj;
const [ax0, ax1, ar] = TORCH.aux;
const [ox0, ox1, orr, oin] = TORCH.outer;
discAt("torch.injector", TOR_F, ix0, ix1, ir, { tone: "hi" });
discAt("torch.aux-tube", TOR_F, ax0, ax1, ar, { tone: "hi", inner: L(G.arcOf(TOR_F, ax0 + 3, ar, P), { tone: "faint" }) });
// plasma: a closed teardrop from inside the coil to the sampler tip
const PL = { x0: COIL.x0 - 1, x1: SAMPLER_TIP, A: 12.2, p: 0.42, q: 0.62 };
const plasmaR = (s) => {
  const u = Math.min(0.9995, Math.max(0.0005, (s - PL.x0) / (PL.x1 - PL.x0)));
  return PL.A * u ** PL.p * (1 - u) ** PL.q;
};
const plasmaSlope = (s) => {
  const u = Math.min(0.9995, Math.max(0.0005, (s - PL.x0) / (PL.x1 - PL.x0)));
  return (plasmaR(s) * (PL.p / u - PL.q / (1 - u))) / (PL.x1 - PL.x0);
};
const PLASMA_PROF = [[PL.x0, 0], ...Array.from({ length: 29 }, (_, i) => { const s = PL.x0 + ((i + 1) / 30) * (PL.x1 - PL.x0); return [s, plasmaR(s), 1]; }), [PL.x1, 0]];
{
  const id = R.nameFor("torch.outer");
  const tube = record(A.ring(TOR_F, ox0, ox1, oin, orr, { name: id }));
  const plasmaShape = record(A.solid(TOR_F, PLASMA_PROF.map(([s, r]) => [s, r]), { name: `${id}.plasma`, radius: plasmaR }));
  const glass = S(G.disc(ox0, ox1, orr, TOR_F, P), { tone: "hi", inner: L([ox0 + 3, ox0 + 9].map((s) => G.arcOf(TOR_F, s, orr, P)).join(""), { tone: "faint" }) });
  const mouth = `<path class="ic-void" d="${G.circleOf(TOR_F, ox1, oin, P)}"/>` + L(G.circleOf(TOR_F, ox1, oin, P), { tone: "lo" });
  const plasmaFill = G.solidOf(PLASMA_PROF, TOR_F, P, { smooth: { slope: plasmaSlope, radius: plasmaR } }).fill;
  const plasma = `<g class="ic-plasma" data-part="plasma-svg"><path class="ic-plasma-glow" d="${plasmaFill}"/><path class="ic-plasma-core" d="${plasmaFill}"/><path class="iso-line ic-plasma-edge" data-tone="lit" d="${plasmaFill}"/></g>`;
  R.put({ at: G.pointOf(TOR_F, (ox0 + ox1) / 2, 0, 0), name: id, shapes: [tube, plasmaShape], svg: glass + mouth + plasma });
}
const PLASMA_ID = "torch.outer";
// torch holder under the outer tube's base
box("torch.holder", { x: ox0 + 1, y: -6, w: 8, d: 12, r: 1 }, TB.z0 + TB.wall, ZA - orr - TB.z0 - TB.wall, { tone: "lo", steps: 2, bevel: 0.3, extra: D([at([ox0 + 3, 6, 54]), at([ox0 + 7, 6, 54])], { size: 0.4 }) });
// plasma-gas side arm on the outer tube's base
const PG_X = ox0 + 5;
const PG_F = G.frameAlong([PG_X, 0, ZA + Math.sqrt(orr ** 2 - 1.4 ** 2)], [0, 0, 1]);
const PG_TOP = ZA + orr + 6;
discAt("torch.gas-arm", PG_F, 0, PG_TOP - PG_F.o[2], 1.4, { tone: "hi" });

// RF load coil: three turns of copper tube; the leads rise from an insulator on the floor and to one under the roof
const COIL_PTS = [];
{
  const { x0, pitch, turns, R: Rc } = COIL;
  const feed0 = [x0, Rc, TB.z0 + TB.wall + 6];
  COIL_PTS.push(feed0, [x0, Rc, ZA - 0.01]);
  const n = turns * 48;
  for (let i = 0; i <= n; i++) {
    const phi = (i / n) * turns * TAU;
    COIL_PTS.push([x0 + (pitch * phi) / TAU, Rc * Math.cos(phi), ZA + Rc * Math.sin(phi)]);
  }
  const x1 = x0 + pitch * turns;
  COIL_PTS.push([x1, Rc, ZA + 0.01], [x1, Rc, TB.z1 - TB.wall - 6]);
  cyl("coil.insulator-low", x0, Rc, 2.6, TB.z0 + TB.wall, 6, { tone: "lo", extra: L(k.sideArc(x0, Rc, 2.6, TB.z0 + TB.wall + 3, P, 16), { tone: "faint" }) });
  cyl("coil.insulator-high", x1, Rc, 2.6, TB.z1 - TB.wall - 6, 6, { tone: "lo", extra: L(k.sideArc(x1, Rc, 2.6, TB.z1 - TB.wall - 3, P, 16), { tone: "faint" }) });
}
tubeItems("coil", COIL_PTS, COIL.r, { tone: "hi", maxLength: 3.2, rims: [COIL.r, COIL.r] });

// ---------------------------------------------------------------- 4 interface: cooled flange, sampler cone
const FL_F = FX(FLANGE.x0);
discAt("interface.flange", FL_F, 0, FLANGE.x1 - FLANGE.x0, FLANGE.r, {
  tone: "mid",
  bevel: 0.4,
  extra: D(G.dotsOf(FL_F, FLANGE.x1 - FLANGE.x0, FLANGE.r - 3, 12, P, { fade: [0.04, 0.42] }), { size: 0.45 }),
});
const SAMP_F = G.frameOf(ax(FLANGE.x0), [-1, 0, 0], [0, 1, 0], [0, 0, 1]);
turned("interface.sampler", SAMP_F, [[0, 12], [1.5, 12], [1.5, 9.8], [FLANGE.x0 - SAMPLER_TIP, 1.2]], { tone: "hi" });
const WATER_PORTS = [-4, 4].map((y) => ({ y, x: (FLANGE.x0 + FLANGE.x1) / 2, z: ZA + Math.sqrt(FLANGE.r ** 2 - y * y) }));
for (const p of WATER_PORTS) discAt("interface.water-port", G.frameAlong([p.x, p.y, p.z], [0, 0, 1]), 0, 3, 1.2, { tone: "mid" });

// ---------------------------------------------------------------- 5 vacuum chamber (front cut away), optics rail, lenses
const VCP = { x: VC.x, y: VC.y, w: VC.x1 - VC.x, d: VC.y1 - VC.y, r: 2 };
box("chamber.floor", VCP, VC.z0, VC.wall, {
  tone: "mid",
  bevel: 0.5,
  extra: D(Array.from({ length: 15 }, (_, i) => at([VC.x + 6 + i * 15.6, VC.y1, VC.z0 + VC.wall / 2])), { size: 0.4 }),
});
box("chamber.back", { x: VC.x, y: VC.y, w: VC.x1 - VC.x, d: VC.wall, r: 0.8 }, VC.z0 + VC.wall, VC.z1 - VC.z0 - 2 * VC.wall, {
  tone: "mid",
  steps: 2,
  bevel: 0,
  extra: L([-30, 4, 36, 112].map((x) => k.segment([x, VC.y + VC.wall, VC.z0 + VC.wall], [x, VC.y + VC.wall, VC.z1 - VC.wall], P)).join(""), { tone: "faint" }),
});
box("chamber.top", VCP, VC.z1 - VC.wall, VC.wall, {
  tone: "mid",
  bevel: 0.5,
  inner: L(k.sideSeam(VCP, VC.z1 - 1.6, P, 3), { tone: "faint" }),
  extra: D(Array.from({ length: 15 }, (_, i) => at([VC.x + 6 + i * 15.6, VC.y1, VC.z1 - VC.wall / 2])), { size: 0.4 }),
});
box("optics.rail", { x: RAIL.x, y: RAIL.y, w: RAIL.w, d: RAIL.d, r: 1 }, RAIL.z0, RAIL.h, { tone: "lo", bevel: 0.3, extra: L(k.lineOnTop([RAIL.x, 0], [RAIL.x + RAIL.w, 0], RAIL_TOP, P), { tone: "faint" }) });
const post = (name, x, r, zTop) => cyl(name, x, 0, r, RAIL_TOP, zTop - RAIL_TOP, { tone: "mid", steps: 16 });
// skimmer on its plate
const SK_F = FX(SKIM.plate[0]);
discAt("skimmer.plate", SK_F, 0, SKIM.plate[1] - SKIM.plate[0], SKIM.r, { tone: "mid", bevel: 0.3, extra: D(G.dotsOf(SK_F, SKIM.plate[1] - SKIM.plate[0], SKIM.r - 2.4, 8, P, { phase: Math.PI / 8, fade: [0.04, 0.42] }), { size: 0.4 }) + voidOn(SK_F, SKIM.plate[1] - SKIM.plate[0], 1.2) });
turned("skimmer.cone", G.frameOf(ax(SKIM.plate[0]), [-1, 0, 0], [0, 1, 0], [0, 0, 1]), [[0, 8.6], [1, 8.6], [1, 7.2], [SKIM.plate[0] - SKIM.tip, 0.9]], { tone: "hi" });
post("skimmer.post", (SKIM.plate[0] + SKIM.plate[1]) / 2, 1.6, ZA - SKIM.r);
// extraction lens and three ring lenses
const EX_F = FX(EXTRACT.x0);
discAt("lens.extraction", EX_F, 0, EXTRACT.x1 - EXTRACT.x0, EXTRACT.r, { tone: "hi", extra: voidOn(EX_F, EXTRACT.x1 - EXTRACT.x0, EXTRACT.hole) });
post("lens.post", (EXTRACT.x0 + EXTRACT.x1) / 2, 1.2, ZA - EXTRACT.r);
for (const l of LENSES) {
  annulus("lens.ring", FX(l.x0), 0, l.x1 - l.x0, l.rIn, l.rOut, { tone: "hi" });
  post("lens.post", (l.x0 + l.x1) / 2, 1.2, ZA - l.rOut);
}
// ---------------------------------------------------------------- 6 collision / reaction cell: octopole between two plates
const CELL_F = FX(CELL.x0);
const CELL_L = CELL.x1 - CELL.x0;
discAt("cell.entrance", CELL_F, 0, CELL.plate, CELL.r, { tone: "mid", bevel: 0.3 });
discAt("cell.exit", CELL_F, CELL_L - CELL.plate, CELL_L, CELL.r, { tone: "mid", bevel: 0.3, extra: voidOn(CELL_F, CELL_L, 1.8) + D(G.dotsOf(CELL_F, CELL_L, CELL.r - 2, 6, P, { fade: [0.04, 0.42] }), { size: 0.4 }) });
const ROD_ANG0 = VIEW_ANGLE + Math.PI / CELL.rods;
for (let i = 0; i < CELL.rods; i++) {
  const a = ROD_ANG0 + (i * TAU) / CELL.rods;
  const F = G.frameOf(G.pointOf(CELL_F, 0, CELL.rc, a), [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  discAt("cell.rod", F, CELL.plate, CELL_L - CELL.plate, CELL.rr, { tone: "hi" });
}
for (const s of [CELL.plate / 2, CELL_L - CELL.plate / 2]) post("cell.post", CELL.x0 + s, 1.2, ZA - CELL.r);
// gas inlet: boss on the entrance plate's rim, line up to a feedthrough under the roof
const CG_X = CELL.x0 + CELL.plate / 2;
const CG_F = G.frameAlong([CG_X, 0, ZA + Math.sqrt(CELL.r ** 2 - 1.2 ** 2)], [0, 0, 1]);
const CG_TOP = ZA + CELL.r + 2.4;
discAt("cell.gas-boss", CG_F, 0, CG_TOP - CG_F.o[2], 1.2, { tone: "mid" });
const CG_FT = VC.z1 - VC.wall - 3;
cyl("cell.feedthrough", CG_X, 0, 2.4, CG_FT, 3, { tone: "lo" });
pipe("cell.gas-line", [[CG_X, 0, CG_TOP], [CG_X, 0, CG_FT]], 0.6, { nutR: 1.1 });

// ---------------------------------------------------------------- 7 quadrupole: four rods in two ceramic collars, the RF pair marked
const Q_F = FX(QUAD.x0);
const QL = QUAD.x1 - QUAD.x0;
annulus("quad.collar-in", Q_F, 0, QUAD.collar, 3.4, QUAD.r, { tone: "mid", extra: D(G.dotsOf(Q_F, QUAD.collar, QUAD.r - 2.2, 8, P, { phase: Math.PI / 8, fade: [0.04, 0.42] }), { size: 0.4 }) });
annulus("quad.collar-out", Q_F, QL - QUAD.collar, QL, 3.4, QUAD.r, { tone: "mid", extra: D(G.dotsOf(Q_F, QL, QUAD.r - 2.2, 8, P, { phase: Math.PI / 8, fade: [0.04, 0.42] }), { size: 0.4 }) });
const QROD_ANG = [0, 1, 2, 3].map((i) => VIEW_ANGLE + Math.PI / 4 + (i * Math.PI) / 2);
QROD_ANG.forEach((a, i) => {
  const F = G.frameOf(G.pointOf(Q_F, 0, QUAD.rc, a), [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const pair = i % 2 === 0 ? "a" : "b";
  discAt(`quad.rod-${pair}`, F, QUAD.collar, QL - QUAD.collar, QUAD.rr, { tone: pair === "a" ? "hi" : "mid", inner: L([QUAD.collar + 6, QL - QUAD.collar - 6].map((s) => G.arcOf(F, s, QUAD.rr, P)).join(""), { tone: pair === "a" ? "lo" : "faint" }) });
});
for (const s of [QUAD.collar / 2, QL - QUAD.collar / 2]) post("quad.post", QUAD.x0 + s, 1.8, ZA - QUAD.r);

// ---------------------------------------------------------------- 8 detector: discrete-dynode electron multiplier in an open tray
{
  const plan = { x: DET.x, y: DET.y, w: DET.x1 - DET.x, d: DET.y1 - DET.y, r: 1.2 };
  post("detector.post", (DET.x + DET.x1) / 2, 2.4, DET.z0);
  box("detector.floor", plan, DET.z0, 2, { tone: "mid", bevel: 0.3 });
  const wall = 1.4;
  const zw = DET.z0 + 2;
  const hw = DET.z1 - zw;
  box("detector.wall-back", { x: DET.x, y: DET.y, w: plan.w, d: wall, r: 0.4 }, zw, hw, { tone: "mid", steps: 2, bevel: 0 });
  box("detector.wall-left", { x: DET.x, y: DET.y + wall, w: wall, d: plan.d - 2 * wall, r: 0.4 }, zw, hw, { tone: "mid", steps: 2, bevel: 0, extra: voidOn(FX(DET.x), wall, 1.6) });
  box("detector.wall-right", { x: DET.x1 - wall, y: DET.y + wall, w: wall, d: plan.d - 2 * wall, r: 0.4 }, zw, hw, { tone: "mid", steps: 2, bevel: 0 });
  box("detector.wall-front", { x: DET.x, y: DET.y1 - wall, w: plan.w, d: wall, r: 0.4 }, zw, 9, { tone: "mid", steps: 2, bevel: 0, extra: D([at([DET.x + 2, DET.y1, zw + 3]), at([DET.x1 - 2, DET.y1, zw + 3])], { size: 0.4 }) });
  // dynodes in two staggered rows, rising toward the collector
  for (let i = 0; i < 10; i++) {
    const x = DET.x + 3 + i * 1.9;
    const y = i % 2 ? 1 : -6;
    box("detector.dynode", { x, y, w: 1.2, d: 5, r: 0.2 }, zw, 13 + i * 1.3, { tone: i === 9 ? "hi" : "lo", steps: 2, bevel: 0, crease: "none" });
  }
}

// ion beam: one empty path per open stretch of the axis, filled by live.js
const BEAM = [
  [FLANGE.x1, SKIM.tip],
  [SKIM.plate[1], EXTRACT.x0],
  [EXTRACT.x1, LENSES[0].x0],
  [LENSES[0].x1, LENSES[1].x0],
  [LENSES[1].x1, LENSES[2].x0],
  [LENSES[2].x1, CELL.x0],
  [CELL.x0 + CELL.plate, CELL.x1 - CELL.plate],
  [CELL.x1, QUAD.x0],
  [QUAD.x0 + QUAD.collar, QUAD.x1 - QUAD.collar],
  [QUAD.x1, DET.x],
];
BEAM.forEach(([x0, x1], i) => {
  const id = R.nameFor("beam");
  // ions, not a part: grounded so the support check does not look for a bracket
  // rejected packets drift off the axis inside the cell and the quadrupole, so those stretches are recorded as wide as the drift
  const drift = i === 6 || i === 8 ? 3.6 : 0.7;
  const shape = record(A.disc(FX(x0), 0, x1 - x0, drift, { name: id, ground: true }));
  R.put({ at: ax((x0 + x1) / 2), name: id, shapes: [shape], svg: `<path data-part="beam${i}" class="ic-beam" d=""/>` });
});

// ---------------------------------------------------------------- vacuum gauges and the cell-gas controller on the roof
const GAUGES = [
  { x: -66, y: 12, r: 4.2, h: 14 },
  { x: -32, y: 12, r: 4.2, h: 14 },
  { x: 74, y: 12, r: 5.2, h: 18 },
];
for (const g of GAUGES) {
  cyl("gauge.collar", g.x, g.y, g.r + 1.6, VC.z1, 2, { tone: "lo", bevel: 0.3 });
  cyl("gauge.body", g.x, g.y, g.r, VC.z1 + 2, g.h, { tone: "mid", inner: L(k.sideArc(g.x, g.y, g.r, VC.z1 + 6, P, 20), { tone: "faint" }), extra: L(k.ring(g.x, g.y, g.r - 1.6, VC.z1 + 2 + g.h, P, 24), { tone: "lo" }) + D([at([g.x, g.y, VC.z1 + 2 + g.h])], { size: 0.5, tone: "mid" }) });
}
const MFC = { x: CG_X - 13, y: -9, w: 26, d: 18, r: 1.6 };
box("cell.mfc", MFC, VC.z1, 12, { tone: "hi", crease: "lo", bevel: 0.4, extra: D([at([MFC.x + MFC.w - 4, MFC.y + MFC.d, VC.z1 + 8])], { size: 0.7, tone: "hi" }) + L(rounded(MFC.x + 3, VC.z1 + 3, MFC.x + 14, VC.z1 + 9, 1, onFront(MFC.y + MFC.d)), { tone: "faint" }) });
const MFC_IN_F = G.frameAlong([MFC.x + 6, MFC.y, VC.z1 + 8], [0, -1, 0]);
discAt("cell.mfc-in", MFC_IN_F, 0, 2, 1.6, { tone: "mid" });

// ---------------------------------------------------------------- 9 support: cabinets, turbo, rotary pump, gas, chiller, panel
box("cabinet.optics", { x: VC.x + 2, y: VC.y + 2, w: 46, d: VC.y1 - VC.y - 4, r: 2 }, 0, VC.z0, { tone: "mid", bevel: 0.6, inner: L(k.sideSeam({ x: VC.x + 2, y: VC.y + 2, w: 46, d: VC.y1 - VC.y - 4, r: 2 }, 4, P, 3), { tone: "faint" }), extra: ventsFront(VC.y1 - 2, VC.x + 8, 8, 4.4, 9, 26) });
box("cabinet.detector", { x: 120, y: VC.y + 2, w: 30, d: VC.y1 - VC.y - 4, r: 2 }, 0, VC.z0, { tone: "mid", bevel: 0.6, extra: ventsFront(VC.y1 - 2, 124, 5, 4.4, 9, 26) + ventsRight(150, -20, 9, 4.4, 9, 26) + D([at([144, VC.y1 - 2, 28])], { size: 0.8, tone: "hi" }) });
// turbomolecular pump hanging under the analyser
{
  const { x, y, r, flange } = TURBO;
  cyl("turbo.flange", x, y, flange, VC.z0 - 4, 4, { tone: "mid", bevel: 0.4, extra: D(Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * TAU + 0.2; return [x + (flange - 2) * Math.cos(a), y + (flange - 2) * Math.sin(a)]; }).filter(([px, py]) => (px - x) * Math.cos(AZIMUTH * DEG) + (py - y) * Math.sin(AZIMUTH * DEG) > -4).map(([px, py]) => at([px, py, VC.z0 - 4])), { size: 0.45 }) });
  cyl("turbo.body", x, y, r, 8, VC.z0 - 12, { tone: "mid", inner: L([14, 22].map((z) => k.sideArc(x, y, r, z, P, 40)).join(""), { tone: "faint" }) });
  cyl("turbo.base", x, y, r - 2, 0, 8, { tone: "lo", extra: L(k.knurl(x, y, r - 2, 1.5, 6.5, 40, P), { tone: "faint" }) });
}
const FORE_Z = 14;
const TURBO_EX_F = G.frameAlong([TURBO.x + Math.sqrt(TURBO.r ** 2 - 3.6 ** 2), TURBO.y, FORE_Z], [1, 0, 0]);
discAt("turbo.exhaust", TURBO_EX_F, 0, 4, 3.6, { tone: "mid" });
// rotary vane pump on the bench between the turbo and the detector cabinet, its motor pointing out the front
{
  box("rotary.body", ROT, 0, ROT.h, {
    tone: "mid",
    bevel: 0.8,
    inner: L(k.sideSeam(ROT, ROT.h - 4, P, 3), { tone: "faint" }),
    extra: L(k.sideRing([ROT.x + ROT.w, 4, 12], 4, "x", P, 28), { tone: "lo" }) + `<path class="ic-oil" d="${k.pathOf(Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * TAU; return iso3([ROT.x + ROT.w, 4 + 3.2 * Math.cos(a), 12 + 3.2 * Math.min(0, Math.sin(a))]); }), true)}"/>` + D([at([ROT.x + ROT.w, ROT.y + 3, ROT.h - 2]), at([ROT.x + ROT.w, ROT.y + ROT.d - 3, ROT.h - 2])], { size: 0.45 }),
  });
  const mF = G.frameAlong([ROT.x + ROT.w / 2, ROT.y + ROT.d, 12], [0, 1, 0]);
  discAt("rotary.motor", mF, 0, 18, 10, { tone: "hi", extra: k.fadedSvg(G.ribsOf(mF, 3, 15, 10, 28, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
  discAt("rotary.fan-cover", mF, 18, 22, 9, { tone: "lo", extra: L(G.circleOf(mF, 22, 4, P, 24), { tone: "faint" }) + D([at(G.pointOf(mF, 22, 0, 0))], { size: 0.5, tone: "mid" }) });
  box("rotary.handle", { x: ROT.x + 8, y: -1.5, w: 16, d: 3, r: 1 }, ROT.h, 3, { tone: "hi", steps: 2, bevel: 0.2 });
}
const ROT_IN_F = G.frameAlong([ROT.x, 0, FORE_Z], [-1, 0, 0]);
discAt("rotary.inlet", ROT_IN_F, 0, 3, 3.6, { tone: "mid" });
pipe("foreline", [G.pointOf(TURBO_EX_F, 4, 0, 0), G.pointOf(ROT_IN_F, 3, 0, 0)], 1.8, { nutR: 3.4, tone: "mid" });

// argon cylinder with regulator
B.bottle("argon", { x: AR.x, y: AR.y, z0: 0, r: AR.r, body: AR.h, shoulder: 12, neck: 4, neckH: 4, cap: 4.6, capH: 6, knurl: 24, capDot: null, level: 12, bands: [AR.h - 14], port: 2, portName: "valve" });
const AR_TOP = AR.h + 12 + 4 + 6 + 2;
const REG = { x: AR.x - 6, y: AR.y - 4, w: 12, d: 8, r: 1.2, z: AR_TOP };
box("argon.regulator", REG, REG.z, 10, { tone: "hi", crease: "lo", bevel: 0.4 });
for (const [dx, name] of [[-3, "argon.gauge-in"], [3, "argon.gauge-out"]]) {
  const F = G.frameAlong([AR.x + dx, REG.y + REG.d, REG.z + 5], [0, 1, 0]);
  discAt(name, F, 0, 2, 2.6, { tone: "mid", extra: L(G.circleOf(F, 2, 2, P, 20), { tone: "lo" }) + L(k.segment(G.pointOf(F, 2, 0, 0), G.pointOf(F, 2, 1.6, 2.2), P), { tone: "hi", free: "end" }) });
}
const AR_OUT = [REG.z + 3, REG.z + 7].map((z) => {
  const F = G.frameAlong([REG.x + REG.w, AR.y, z], [1, 0, 0]);
  discAt("argon.outlet", F, 0, 2, 1.4, { tone: "mid" });
  return G.pointOf(F, 2, 0, 0);
});
pipe("argon.neb-line", [AR_OUT[0], [NEB.arm, AR.y, AR_OUT[0][2]], [NEB.arm, 0, AR_OUT[0][2]], [NEB.arm, 0, ARM_TOP]], 0.8, { bend: 5, nutR: 1.4 });
pipe("argon.plasma-line", [AR_OUT[1], [TB.x - 4, AR.y, AR_OUT[1][2]], [TB.x - 4, 0, AR_OUT[1][2]], [TB.x - 4, 0, TB.z1 - 12], [PG_X, 0, TB.z1 - 12], [PG_X, 0, PG_TOP]], 0.8, { bend: 5, nutR: 1.4 });

// helium cylinder feeding the cell-gas controller
B.bottle("helium", { x: HE.x, y: HE.y, z0: 0, r: HE.r, body: HE.h, shoulder: 9, neck: 3, neckH: 3, cap: 3.6, capH: 5, knurl: 20, capDot: null, level: 10, bands: [HE.h - 10], port: 1.6, portName: "valve" });
const HE_TOP = HE.h + 9 + 3 + 5 + 2;
const HREG = { x: HE.x - 5, y: HE.y - 4, w: 10, d: 8, r: 1, z: HE_TOP };
box("helium.regulator", HREG, HREG.z, 8, { tone: "hi", crease: "lo", bevel: 0.3 });
{
  const F = G.frameAlong([HE.x + 1.5, HREG.y + HREG.d, HREG.z + 4], [0, 1, 0]);
  discAt("helium.gauge", F, 0, 2, 2.4, { tone: "mid", extra: L(G.circleOf(F, 2, 1.8, P, 20), { tone: "lo" }) + L(k.segment(G.pointOf(F, 2, 0, 0), G.pointOf(F, 2, 1.4, 2.4), P), { tone: "hi", free: "end" }) });
}
const HE_OUT_F = G.frameAlong([HREG.x, HE.y, MFC_IN_F.o[2]], [-1, 0, 0]);
discAt("helium.outlet", HE_OUT_F, 0, 2, 1.4, { tone: "mid" });
pipe("helium.line", [G.pointOf(HE_OUT_F, 2, 0, 0), [MFC_IN_F.o[0], HE.y, MFC_IN_F.o[2]], G.pointOf(MFC_IN_F, 2, 0, 0)], 0.8, { bend: 5, nutR: 1.4 });

// recirculating chiller with its two water lines to the interface flange
box("chiller.case", CHILL, 0, CHILL_H, { tone: "mid", bevel: 0.8, inner: L(k.sideSeam(CHILL, CHILL_H - 4, P, 3), { tone: "faint" }), extra: ventsFront(CHILL.y + CHILL.d, -200, 9, 4.4, 8, 30) + D([at([-162, CHILL.y + CHILL.d, 40])], { size: 0.8, tone: "hi" }) });
const CH_PORTS = [[-200, CHILL.y + 8], [-176, CHILL.y + 22]].map(([x, y]) => {
  cyl("chiller.port", x, y, 2, CHILL_H, 3, { tone: "mid" });
  return [x, y, CHILL_H + 3];
});
WATER_PORTS.forEach((p, i) => {
  const zr = [116, 128][i];
  const c = CH_PORTS[i];
  pipe(`chiller.water-${i ? "return" : "supply"}`, [c, [c[0], c[1], zr], [p.x, c[1], zr], [p.x, p.y, zr], [p.x, p.y, p.z + 3]], 1.1, { bend: 4, nutR: 1.2, tone: "hi" });
});

// sample tubing: probe → around the pump rotor → nebulizer tail
{
  const cx = ROTOR.x;
  const cz = ROTOR.z;
  const arc = Array.from({ length: 25 }, (_, i) => {
    const t = Math.PI + (i / 24) * Math.PI;
    return [cx + WRAP * Math.cos(t), TUBE_Y, cz + WRAP * Math.sin(t)];
  });
  const start = G.pointOf(PROBE_PORT_F, 1.6, 0, 0);
  const top = CARR_Z[0] + 5;
  const route = [start, [PROBE.x, TUBE_Y, top], [cx - WRAP, TUBE_Y, top], ...arc, [cx + WRAP, TUBE_Y, ZA], [cx + WRAP, 0, ZA], [NEB.x0, 0, ZA]];
  // fillet only the corners outside the wrap
  const line = [...G.fillet(route.slice(0, 4), 4, 12, { P, tube: SAMPLE_R }).slice(0, -1), ...arc.slice(0, -1), ...G.fillet(route.slice(-4), 4, 12, { P, tube: SAMPLE_R })];
  const total = G.pathLength(line);
  const id = tubeItems("sample-tube", line, SAMPLE_R, { tone: "hi", gaps: [[0, 1.6], [total - 1.6, total]], rims: [1.4, 1.4], maxLength: 8 });
  for (const [along, sign] of [[0, -1], [total, 1]]) {
    const tangent = G.tangentAlong(line, along);
    const F = G.frameAlong(G.add3(G.pointAlong(line, along), G.mul3(tangent, -sign * 0.8)), tangent);
    discAt(`${id}.nut`, F, -0.8, 0.8, 1.4, { tone: "mid", owner: id, bevel: 0.2 });
  }
}

// control panel with the mass spectrum, cabled to the detector electronics
const PANEL = { x: 170, x1: 238, y: 30, y1: 38, z0: 21, z1: 80 };
const SCREEN = { x0: 176, x1: 232, z0: 34, z1: 74, r: 2.4 };
const PLOT = B.panel("panel", {
  base: { x: 182, y: 18, w: 44, d: 30, r: 3 },
  neck: { x: 204, y: 34, r: 3.4 },
  body: PANEL,
  screen: SCREEN,
  buttons: [[182, 26], [189, 26], [196, 26]],
  led: [228, 26],
  inset: [4, 5, 8],
  cable: [
    { name: "cabinet.data-port", at: [150, 12, 5], dir: [1, 0, 0], ring: 0.9 },
    { name: "panel.data-port", at: [182, 30, 2.6], dir: [-1, 0, 0] },
    [[158, 12, 5], [164, 12, 0.62], [172, 30, 0.62], [176, 30, 2.6]],
  ],
  text: { clock: `m/z ${M.DEFAULTS.mz}`, phase: "STD" },
});

// ---------------------------------------------------------------- settle, sort, page
B.settle();
// split the settled order at the torch: the WebGL plasma paints over the quartz tube and under everything nearer
const CUT = R.items.findIndex((item) => item.name === PLASMA_ID);
const itemSvg = (item) => `<g class="it" data-n="${item.name}">${item.svg}</g>`;
const backBody = R.items.slice(0, CUT + 1).map(itemSvg).join("");
const frontBody = R.items.slice(CUT + 1).map(itemSvg).join("");
const LABEL =
  "An inductively coupled plasma mass spectrometer on a bench, drawn left to right along the path of the ions. An autosampler probe draws sample from a vial; a peristaltic pump pushes it to a concentric nebulizer on a cooled spray chamber. The aerosol enters the injector of a three-tube quartz torch inside a three-turn copper RF coil, in a shielded torch box on the RF generator, where the argon plasma glows. Ions pass the sampler cone on a water-cooled interface flange and the skimmer cone into a vacuum chamber with its front cut away: an extraction lens and three ring lenses on an optics rail, a helium collision cell with eight rods, a quadrupole of four cylindrical rods with one pair marked, and a discrete-dynode electron multiplier. Under the chamber hangs a turbomolecular pump backed by a rotary pump; behind stand the argon and helium cylinders and a chiller; a control panel shows the mass spectrum.";
const svg =
  k.figureSvg({ width: W, height: H, label: LABEL, body: [...back, backBody], className: "ic-back" }) +
  `<canvas class="ic-gl" aria-hidden="true"></canvas>` +
  `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg ic-front" viewBox="0 0 ${W} ${H}" aria-hidden="true">${frontBody}</svg>`;

// ---------------------------------------------------------------- live data
const DATA = {
  P,
  ax: { y: 0, z: ZA },
  beam: BEAM,
  cell: [CELL.x0 + CELL.plate, CELL.x1 - CELL.plate],
  quad: [QUAD.x0 + QUAD.collar, QUAD.x1 - QUAD.collar, QUAD.rc - QUAD.rr - 0.6],
  det: DET.x,
  start: FLANGE.x1,
  rotor: { o: ROTOR_F.o, u: ROTOR_F.u, v: ROTOR_F.v, r: ROTOR.r - 2.2, roller: 1.3, n: 6 },
  rps: PUMP_RPS,
  plot: PLOT,
  screen: SCREEN,
  defaults: M.DEFAULTS,
  limits: M.LIMITS,
  speed: 70, // ion packets' drawn speed along the axis, world units per second (illustrative)
  plasma: { x0: PL.x0, x1: PL.x1, A: PL.A, p: PL.p, q: PL.q, mouth: MOUTH, rIn: oin, coil: [COIL.x0, COIL.x0 + COIL.pitch * COIL.turns] },
  camera: glCamera(P),
  view: [W, H],
};
const MODEL = moduleText(join(HERE, "model.mjs"));
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const CSS = readFileSync(join(HERE, "icpms.css"), "utf8");

const r0 = M.run(M.DEFAULTS);
const el0 = M.ELEMENTS.find((e) => e.iso.some(([m]) => m === M.DEFAULTS.mz));
const fmtCps = (c) => (c >= 1e3 ? `${(c / 10 ** Math.floor(Math.log10(c))).toFixed(1)}e${Math.floor(Math.log10(c))}` : c.toFixed(0));
const ion0 = r0.ions.find((i) => i.sym === el0.sym).f;
const readout0 = `m/z ${M.DEFAULTS.mz} ${el0.sym} · ${fmtCps(r0.cpsAt(M.DEFAULTS.mz))} cps · ${Math.round(r0.T)} K · ${Math.round(ion0 * 100)} % ion · ${r0.pressures[1].torr.toFixed(1)} Torr`;
let controls = controlsHtml(
  [
    { key: "rf", name: "RF power", min: M.LIMITS.rf[0], max: M.LIMITS.rf[1], step: 10, value: M.DEFAULTS.rf, text: `${M.DEFAULTS.rf} W`, valuetext: `${M.DEFAULTS.rf} watts` },
    { key: "neb", name: "Nebulizer", min: M.LIMITS.neb[0], max: M.LIMITS.neb[1], step: 0.01, value: M.DEFAULTS.neb, text: `${M.DEFAULTS.neb.toFixed(2)} L/min`, valuetext: `${M.DEFAULTS.neb.toFixed(2)} litres per minute` },
  ],
  `T ${Math.round(r0.T)} K · aerosol ${Math.round(r0.eff * 100)} % · quad V ${Math.round(M.quadRF(M.DEFAULTS.mz).V)} V`,
);
controls = controls.replace('<span class="bx-note"', `<button type="button" class="ic-mode" data-mode aria-pressed="false" aria-label="Cell mode: standard. Press for helium KED"><span data-on="std">STD</span><span data-on="ked">KED</span></button>\n<span class="bx-note"`);
const stage = stageHtml(svg, {
  label: "ICP-MS. Left and right arrow keys set the quadrupole mass; Shift for steps of ten, Home and End for the limits.",
  min: M.LIMITS.mz[0],
  max: M.LIMITS.mz[1],
  now: M.DEFAULTS.mz,
  valuetext: `m/z ${M.DEFAULTS.mz}, ${el0.sym}, ${fmtCps(r0.cpsAt(M.DEFAULTS.mz))} counts per second, standard mode`,
});
const layered = stage.replace('class="iso-stage bx-stage"', 'class="iso-stage bx-stage" data-layers');
const page = pageOf({
  title: "ICP-MS",
  theme: THEME,
  width: 980,
  css: CSS,
  plate: {
    fig: "Fig 2",
    title: "ICP-MS · quadrupole, He KED cell",
    hint: "← → m/z · sliders · STD/KED",
    readout: readout0,
    keys: [
      { mark: "lit", label: "Argon plasma in the torch: its temperature sets how much of each element is ionised" },
      { mark: "raised", label: "Ion packets on the axis; the marked rod pair of the quadrupole passes only the selected m/z" },
      { mark: "edge", label: "Sample tubing, argon, helium and cooling-water lines, foreline to the rotary pump" },
    ],
    caption: `Sample is pumped to a concentric nebulizer; ${Math.round(r0.eff * 100)} % of the aerosol reaches the plasma at ${M.DEFAULTS.neb.toFixed(2)} L/min. The ionisation temperature follows RF power and nebulizer flow (${Math.round(r0.T)} K at ${M.DEFAULTS.rf} W), and the Saha equation gives each element's ionised fraction. Ions cross the interface (${r0.pressures[1].torr.toFixed(1)} Torr), the lenses (${r0.pressures[2].torr.toExponential(1)} Torr) and the analyser (${r0.pressures[3].torr.toExponential(0)} Torr). The quadrupole (r0 ${M.QUAD.r0 * 1000} mm, ${M.QUAD.freq / 1e6} MHz) passes one m/z at a time on the Mathieu scan line (q ${M.QUAD.apexQ}, ${M.QUAD.fwhm} u wide); the spectrum shows real isotope patterns for Fe, Cu, As, Se, Cd, Hg and Pb. In STD mode the polyatomic ArO⁺ (56) and Ar₂⁺ (80) sit on Fe and Se; in KED mode helium in the cell removes them a thousandfold and costs the analytes ${Math.round((1 - M.cellFactor("ked", 208)) * 100)}–${Math.round((1 - M.cellFactor("ked", 40)) * 100)} %. Ion packets are drawn at ${DATA.speed} units/s (real ions take microseconds); the pump turns at an assumed ${PUMP_RPS} rev/s.`,
    body: layered + controls,
  },
  script: scriptOf(kitScript(), glScript(), MODEL, LIVE_CORE, LIVE),
});
const name = THEME === "light" ? "icpms-light.html" : "icpms.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${R.solids.length} solids`, `${R.tubes.length} tube runs`);

A.auditOrExit(R, P);
