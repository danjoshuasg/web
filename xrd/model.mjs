// Pure XRD model: every number the figure shows comes from here.
// Bragg-Brentano theta-2theta powder diffraction: Bragg's law, K-alpha doublet, Lorentz-polarisation,
// Caglioti instrument width plus Scherrer size broadening, seeded counting noise.
// Reflection tables are illustrative (approximate d and relative intensity), not reference data.

export const ANODES = {
  cu: { label: "Cu", a1: 1.5406, a2: 1.5444 }, // angstrom
  co: { label: "Co", a1: 1.789, a2: 1.7929 },
};

// [hkl, d (angstrom), relative intensity]
export const PHASES = {
  si: { label: "Si", refl: [["111", 3.1355, 100], ["220", 1.9201, 55], ["311", 1.6375, 30], ["400", 1.3577, 6], ["331", 1.2459, 11], ["422", 1.1086, 12]] },
  nacl: { label: "NaCl", refl: [["111", 3.258, 13], ["200", 2.821, 100], ["220", 1.994, 55], ["311", 1.701, 2], ["222", 1.628, 15], ["400", 1.41, 6], ["420", 1.261, 11], ["422", 1.151, 7]] },
  quartz: { label: "quartz", refl: [["100", 4.257, 22], ["101", 3.343, 100], ["110", 2.457, 8], ["102", 2.282, 8], ["111", 2.237, 4], ["200", 2.128, 6], ["201", 1.98, 4], ["112", 1.818, 14], ["211", 1.541, 9]] },
};

// Samples: phase weights.
export const SAMPLES = {
  si: { label: "Si", phases: { si: 1 } },
  nacl: { label: "NaCl", phases: { nacl: 1 } },
  quartz: { label: "quartz", phases: { quartz: 1 } },
  mix: { label: "Si + NaCl", phases: { si: 0.5, nacl: 0.5 } },
};

export const SCAN = { from: 10, to: 90, step: 0.02 };
export const LIMITS = { twoTheta: [10, 90], size: [20, 200] };
export const DEFAULTS = { sample: "si", anode: "cu", size: 50, twoTheta: 28.44 };

const INST = { U: 0.01, V: -0.005, W: 0.004 }; // Caglioti, deg^2
const SCALE = 3.2e3; // sets Si (111) near 2e4 cps peak with Cu and 50 nm
const rad = (d) => (d * Math.PI) / 180;

// Bragg: 2 theta (deg) for lattice spacing d at wavelength lambda, or null if unreachable.
export function braggTwoTheta(d, lambda) {
  const s = lambda / (2 * d);
  return s >= 1 ? null : (2 * Math.asin(s) * 180) / Math.PI;
}

// Lattice spacing (angstrom) seen at a given 2 theta.
export const dSpacing = (twoTheta, lambda) => lambda / (2 * Math.sin(rad(twoTheta / 2)));

// Lorentz-polarisation factor.
const lp = (twoTheta) => {
  const th = rad(twoTheta / 2);
  return (1 + Math.cos(2 * th) ** 2) / (Math.sin(th) ** 2 * Math.cos(th));
};

// Peak FWHM (deg 2 theta): Caglioti instrument width combined with Scherrer size broadening.
export function fwhm(twoTheta, lambda, size) {
  const th = rad(twoTheta / 2);
  const t = Math.tan(th);
  const inst2 = Math.max(INST.U * t * t + INST.V * t + INST.W, 1e-4);
  const beta = ((0.9 * lambda) / ((size * 10) * Math.cos(th))) * (180 / Math.PI); // size in nm -> angstrom
  return Math.sqrt(inst2 + beta * beta);
}

// Pseudo-Voigt profile (area-normalised) with mixing eta.
const profile = (x, w, eta = 0.5) => {
  const g = (Math.sqrt(4 * Math.LN2 / Math.PI) / w) * Math.exp(-4 * Math.LN2 * (x / w) ** 2);
  const l = (2 / (Math.PI * w)) / (1 + 4 * (x / w) ** 2);
  return eta * l + (1 - eta) * g;
};

// Smooth background: falling tail plus a weak amorphous hump.
export const background = (tt) => 80 + 400 * Math.exp(-tt / 25) + 40 * Math.exp(-0.5 * ((tt - 22) / 8) ** 2);

// Peak list for a run, each with 2 theta (K-alpha1), peak cps and lattice spacing.
export function peaks(p) {
  const an = ANODES[p.anode];
  const out = [];
  for (const [ph, wt] of Object.entries(SAMPLES[p.sample].phases)) {
    for (const [hkl, d, rel] of PHASES[ph].refl) {
      const tt = braggTwoTheta(d, an.a1);
      if (tt === null || tt < SCAN.from || tt > SCAN.to) continue;
      const w = fwhm(tt, an.a1, p.size);
      const area = SCALE * wt * rel * lp(tt) * 0.00046;
      out.push({ label: `${PHASES[ph].label} ${hkl}`, phase: ph, hkl, d, tt, w, cps: area * profile(0, w) });
    }
  }
  return out;
}

// Smooth expected pattern (cps) over the scan range, with the K-alpha2 satellite.
export function run(p) {
  const an = ANODES[p.anode];
  const list = peaks(p);
  const n = Math.round((SCAN.to - SCAN.from) / SCAN.step) + 1;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = background(SCAN.from + i * SCAN.step);
  for (const pk of list) {
    const shift = braggTwoTheta(pk.d, an.a2);
    const area = (pk.cps / profile(0, pk.w));
    const lo = Math.max(0, Math.floor((pk.tt - 30 * pk.w - SCAN.from) / SCAN.step));
    const hi = Math.min(n - 1, Math.ceil((pk.tt + 30 * pk.w + 1 - SCAN.from) / SCAN.step));
    for (let i = lo; i <= hi; i++) {
      const tt = SCAN.from + i * SCAN.step;
      y[i] += area * profile(tt - pk.tt, pk.w);
      if (shift !== null) y[i] += 0.5 * area * profile(tt - shift, pk.w);
    }
  }
  const at = (tt) => y[Math.min(n - 1, Math.max(0, Math.round((tt - SCAN.from) / SCAN.step)))];
  return { peaks: list, y, at, max: Math.max(...y), wavelength: an.a1 };
}

// Nearest labelled peak within tol degrees of 2 theta, or null.
export function identify(r, tt, tol = 0.3) {
  let best = null;
  for (const pk of r.peaks) {
    const dist = Math.abs(pk.tt - tt);
    if (dist <= tol && (!best || dist < best.dist)) best = { dist, label: pk.label, tt: pk.tt, d: pk.d, cps: pk.cps };
  }
  return best;
}

// How strongly the diffracted beam lights up at 2 theta (0..1), from the pattern above background.
export const beamGlow = (r, tt) => Math.min(1, Math.max(0, (r.at(tt) - background(tt)) / (0.35 * (r.max - background(28)))));

// Deterministic counting noise for a step time (s); seeded so every frame is repeatable.
export function counts(r, secPerStep = 0.5, seed = 11) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from(r.y, (m) => {
    const mean = m * secPerStep;
    const g = Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    return Math.max(0, mean + Math.sqrt(mean) * g) / secPerStep;
  });
}
