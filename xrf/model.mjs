// Pure EDXRF model: every number the figure shows comes from here.
// Rh-anode tube (Kramers continuum + Rh lines), primary filter, sample fluorescence and scatter,
// air / He path, SDD detector with Be window and paralysable dead time.
// Values are illustrative but physically consistent.

export const TUBE = { Z: 45, rhKa: 20.216, rhKb: 22.724, rhK: 23.22 }; // keV
export const DET = { fano: 0.115, eps: 3.62, noise2: 365, tau: 3e-6, binKev: 0.02, top: 50 };
export const GEOM = { pathAir: 3.5 }; // cm, tube -> sample -> detector

// ie edge: absorption edge (keV) that must be exceeded; w: fluorescence yield; lines: [label, keV, relative weight]
export const ELEMENTS = {
  Ca: { Z: 20, edge: 4.038, w: 0.163, lines: [["Ca Ka", 3.692, 1], ["Ca Kb", 4.013, 0.13]] },
  Ti: { Z: 22, edge: 4.966, w: 0.214, lines: [["Ti Ka", 4.511, 1], ["Ti Kb", 4.932, 0.14]] },
  Cr: { Z: 24, edge: 5.989, w: 0.275, lines: [["Cr Ka", 5.415, 1], ["Cr Kb", 5.947, 0.15]] },
  Mn: { Z: 25, edge: 6.539, w: 0.308, lines: [["Mn Ka", 5.899, 1], ["Mn Kb", 6.49, 0.16]] },
  Fe: { Z: 26, edge: 7.112, w: 0.34, lines: [["Fe Ka", 6.404, 1], ["Fe Kb", 7.058, 0.17]] },
  Ni: { Z: 28, edge: 8.333, w: 0.41, lines: [["Ni Ka", 7.478, 1], ["Ni Kb", 8.265, 0.18]] },
  Cu: { Z: 29, edge: 8.979, w: 0.445, lines: [["Cu Ka", 8.048, 1], ["Cu Kb", 8.905, 0.19]] },
  Zn: { Z: 30, edge: 9.659, w: 0.479, lines: [["Zn Ka", 8.639, 1], ["Zn Kb", 9.572, 0.2]] },
  Sr: { Z: 38, edge: 16.105, w: 0.7, lines: [["Sr Ka", 14.165, 1], ["Sr Kb", 15.836, 0.2]] },
  Cd: { Z: 48, edge: 26.711, w: 0.84, lines: [["Cd Ka", 23.174, 1], ["Cd Kb", 26.095, 0.2]] },
  Hg: { Z: 80, edge: 12.284, w: 0.38, lines: [["Hg La", 9.989, 1], ["Hg Lb", 11.823, 0.7]] },
  Pb: { Z: 82, edge: 13.035, w: 0.38, lines: [["Pb La", 10.552, 1], ["Pb Lb", 12.614, 0.75]] },
};

// Sample presets: weight fractions and a scatter factor (light matrices scatter more).
export const SAMPLES = {
  brass: { label: "brass", scatter: 0.25, wt: { Cu: 0.62, Zn: 0.35, Pb: 0.025, Fe: 0.003 } },
  soil: { label: "soil", scatter: 1.0, wt: { Ca: 0.03, Ti: 0.006, Mn: 0.001, Fe: 0.045, Zn: 0.0006, Sr: 0.0004, Pb: 0.002 } },
  plastic: { label: "RoHS plastic", scatter: 2.2, wt: { Ti: 0.01, Cr: 0.001, Cd: 0.001, Hg: 0.0008, Pb: 0.0012 } },
};

// Primary filters: mu = coef * (10/E)^3 per cm (jump below the edge for Cu), thickness in cm.
export const FILTERS = {
  none: { label: "none", t: 0, coef: 0, edge: 0, jump: 1 },
  al: { label: "Al 100 um", t: 0.01, coef: 70, edge: 1.56, jump: 1 },
  cu: { label: "Cu 25 um", t: 0.0025, coef: 2000, edge: 8.979, jump: 6 },
};

export const ATMOSPHERES = { air: 1, he: 0.015, vac: 0 };

export const LIMITS = { kV: [10, 50], uA: [10, 200], cursor: [0.5, 30] };
export const DEFAULTS = { kV: 40, uA: 50, filter: "al", atm: "air", sample: "brass", live: 30 };

const SCALE = 0.2; // overall photon scale, sets the count rate near 4e4 cps at the defaults

const filterT = (f, E) => {
  const F = FILTERS[f];
  if (!F.t) return 1;
  const mu = F.coef * (10 / E) ** 3 / (E < F.edge ? F.jump : 1);
  return Math.exp(-mu * F.t);
};

// Air or He path attenuation for a path of x cm: mu/rho ~ 22.9 (5/E)^2.8 cm2/g, rho_air 1.2e-3 g/cm3.
const pathT = (atm, E, x) => Math.exp(-ATMOSPHERES[atm] * 1.2e-3 * 22.9 * (5 / E) ** 2.8 * x);

// SDD efficiency: Be window (12.5 um) times Si absorption (450 um).
export const detEff = (E) => {
  const be = Math.exp(-1.85 * 1.25e-3 * 3.3 * (3 / E) ** 2.9);
  const si = 1 - Math.exp(-2.33 * 0.045 * 26 * (10 / E) ** 2.8);
  return be * si;
};

// Primary photon flux per keV at energy E (Kramers continuum), or 0 above the tube voltage.
const kramers = (kV, uA, E) => (E < kV ? TUBE.Z * ((kV - E) / E) * uA : 0);

// Rh characteristic lines of the tube, as [energy, flux] (only if kV exceeds the Rh K edge).
const rhLines = (kV, uA) => (kV > TUBE.rhK ? [[TUBE.rhKa, 55 * uA * (kV - TUBE.rhK) ** 1.5 / 30], [TUBE.rhKb, 10 * uA * (kV - TUBE.rhK) ** 1.5 / 30]] : []);

// Excitation of an element: filtered primary flux above its edge, weighted by photoabsorption (edge/E)^3.
function excitation(el, p) {
  if (p.kV <= el.edge) return 0;
  let sum = 0;
  const n = 48;
  const dE = (p.kV - el.edge) / n;
  for (let i = 0; i < n; i++) {
    const E = el.edge + (i + 0.5) * dE;
    sum += kramers(p.kV, p.uA, E) * filterT(p.filter, E) * (el.edge / E) ** 3 * dE;
  }
  for (const [E, fl] of rhLines(p.kV, p.uA)) {
    if (E > el.edge) sum += fl * filterT(p.filter, E) * (el.edge / E) ** 3;
  }
  return sum;
}

// Peak lines of the run: fluorescence, tube Rayleigh and Compton scatter.
export function lines(p) {
  const out = [];
  const smp = SAMPLES[p.sample];
  for (const sym of Object.keys(smp.wt)) {
    const el = ELEMENTS[sym];
    const ex = excitation(el, p);
    if (!ex) continue;
    for (const [label, E, rel] of el.lines) {
      const cps = SCALE * ex * smp.wt[sym] * el.w * rel * 0.9 * pathT(p.atm, E, GEOM.pathAir / 2) * detEff(E) * 30;
      out.push({ label, E, cps, sym });
    }
  }
  for (const [E, fl] of rhLines(p.kV, p.uA)) {
    const Ec = E / (1 + (E / 511) * (1 - Math.cos(Math.PI / 2)));
    const eff = filterT(p.filter, E) * pathT(p.atm, E, GEOM.pathAir) * detEff(E) * SCALE * smp.scatter;
    out.push({ label: E > 21 ? "Rh Kb" : "Rh Ka", E, cps: fl * eff * 0.12, sym: "Rh", scatter: true });
    out.push({ label: E > 21 ? "Rh Kb C" : "Rh Ka C", E: Ec, cps: fl * eff * 0.07, sym: "Rh", compton: true });
  }
  return out;
}

const sigma = (E) => Math.sqrt(DET.noise2 + DET.fano * DET.eps * E * 1000) / 1000; // keV

// Smooth expected spectrum (cps per bin) for a run.
export function run(p) {
  const L = lines(p);
  const nb = Math.round(DET.top / DET.binKev);
  const bins = new Float64Array(nb);
  const smp = SAMPLES[p.sample];
  for (let i = 0; i < nb; i++) {
    const E = (i + 0.5) * DET.binKev;
    // Scattered continuum: weak, rises with scatter factor, filtered and absorbed like the rest.
    const cont = E > 1 && E < p.kV ? kramers(p.kV, p.uA, E) * filterT(p.filter, E) * pathT(p.atm, E, GEOM.pathAir) * detEff(E) : 0;
    bins[i] = cont * SCALE * smp.scatter * 0.006 * DET.binKev;
  }
  for (const l of L) {
    const s = sigma(l.E);
    const lo = Math.max(0, Math.floor((l.E - 5 * s) / DET.binKev));
    const hi = Math.min(nb - 1, Math.ceil((l.E + 5 * s) / DET.binKev));
    for (let i = lo; i <= hi; i++) {
      const E = (i + 0.5) * DET.binKev;
      bins[i] += (l.cps * DET.binKev * Math.exp(-0.5 * ((E - l.E) / s) ** 2)) / (s * Math.sqrt(2 * Math.PI));
    }
  }
  const inCps = bins.reduce((a, b) => a + b, 0);
  const outCps = inCps * Math.exp(-inCps * DET.tau);
  return { lines: L, bins, inCps, outCps, dead: 1 - Math.exp(-inCps * DET.tau), at: (E) => bins[Math.min(nb - 1, Math.max(0, Math.floor(E / DET.binKev)))] / DET.binKev };
}

// Nearest labelled line within tol keV of E, or null.
export function identify(r, E, tol = 0.2) {
  let best = null;
  for (const l of r.lines) {
    const d = Math.abs(l.E - E);
    if (d <= tol && l.cps > 0.5 && (!best || d < best.d)) best = { d, label: l.label, E: l.E, cps: l.cps };
  }
  return best;
}

// Deterministic Poisson-like counts after a live time (s); seeded so every frame is repeatable.
export function counts(r, live, seed = 7) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const k = (1 - r.dead) * live;
  return Array.from(r.bins, (m) => {
    const mean = m * k;
    const g = Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * g));
  });
}
