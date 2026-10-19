// Pure ICP-MS model: every number the figure shows comes from here.
// Ar plasma ionisation (Saha), quadrupole filtering (Mathieu), STD / KED cell modes.
// Values are illustrative but physically consistent.

export const PLASMA = { ne: 1e15, kB: 8.617e-5 }; // electron density cm^-3, Boltzmann constant eV/K
export const QUAD = { r0: 4.0e-3, freq: 2.5e6, apexQ: 0.706, apexA: 0.237, fwhm: 0.7 };

// ie = first ionisation energy (eV), gr = 2 g(ion) / g(atom) statistical weight ratio.
export const ELEMENTS = [
  { sym: "Fe", ie: 7.9, gr: 2.2, ppb: 10, iso: [[56, 0.9175], [57, 0.0212]] },
  { sym: "Cu", ie: 7.73, gr: 1.0, ppb: 5, iso: [[63, 0.6915], [65, 0.3085]] },
  { sym: "As", ie: 9.79, gr: 2.0, ppb: 5, iso: [[75, 1.0]] },
  { sym: "Se", ie: 9.75, gr: 1.0, ppb: 5, iso: [[78, 0.2377], [80, 0.4961]] },
  { sym: "Cd", ie: 8.99, gr: 4.0, ppb: 2, iso: [[110, 0.1249], [111, 0.128], [112, 0.2413], [113, 0.1222], [114, 0.2873]] },
  { sym: "Hg", ie: 10.44, gr: 4.0, ppb: 2, iso: [[199, 0.1687], [200, 0.231], [201, 0.1318], [202, 0.2986], [204, 0.0687]] },
  { sym: "Pb", ie: 7.42, gr: 4.0, ppb: 2, iso: [[204, 0.014], [206, 0.241], [207, 0.221], [208, 0.524]] },
];

// Polyatomic background from the Ar plasma, in cps at STD. KED attenuates it much harder than analytes.
export const INTERFERENCES = [
  { label: "ArO+", mz: 56, cps: 1.5e6 },
  { label: "Ar2+", mz: 80, cps: 6e7 },
];

export const LIMITS = { rf: [1000, 1600], neb: [0.7, 1.1], mz: [40, 210] };
export const DEFAULTS = { rf: 1350, neb: 0.95, mz: 208, mode: "std" };

const SENS = 2.5e4; // cps per ppb at full ionisation and unit transmission
const NOISE = 0.5; // dark counts, cps

// Ionisation temperature (K): rises with RF power, falls with nebuliser gas flow.
export const plasmaT = (rf, neb) => 7500 + 1.2 * (rf - 1350) - 1500 * (neb - 0.95);

// Saha: fraction of atoms singly ionised at temperature T.
export function ionFraction(el, T) {
  const kT = PLASMA.kB * T;
  const R = (el.gr * 2.4147e15 * T ** 1.5 * Math.exp(-el.ie / kT)) / PLASMA.ne;
  return R / (1 + R);
}

// Sample uptake and aerosol transport peak near 0.95 L/min.
export const nebEfficiency = (neb) => Math.exp(-(((neb - 0.95) / 0.22) ** 2));

// Ion optics and detector transmission, mild mass dependence.
export const transmission = (mz) => 1.15 - 0.0022 * mz;

// Cell mode: KED costs analyte sensitivity (more for light ions) and removes polyatomics.
export const cellFactor = (mode, mz) => (mode === "ked" ? 0.3 + 0.1 * (mz / 208) : 1);
export const polyFactor = (mode) => (mode === "ked" ? 1e-3 : 1);

// Quadrupole RF amplitude and DC offset (V) that pass mass mz on the scan line.
export function quadRF(mz) {
  const m = mz * 1.6605e-27;
  const e = 1.602e-19;
  const w = 2 * Math.PI * QUAD.freq;
  const V = (QUAD.apexQ * m * QUAD.r0 ** 2 * w ** 2) / (4 * e);
  return { V, U: (QUAD.apexA / (2 * QUAD.apexQ)) * V, q: QUAD.apexQ, a: QUAD.apexA };
}

// Fraction of an ion of mass mzIon that the quadrupole passes when set to mzSel (unit resolution).
export function transmit(mzSel, mzIon) {
  const s = QUAD.fwhm / 2.355;
  return Math.exp(-0.5 * ((mzIon - mzSel) / s) ** 2);
}

// Vacuum by stage (Torr): atmosphere, interface, ion lens, analyser, detector.
export const pressures = (neb) => [
  { name: "plasma", torr: 760 },
  { name: "interface", torr: 2.0 * (neb / 0.95) },
  { name: "lens", torr: 1.5e-4 * (neb / 0.95) },
  { name: "analyser", torr: 5e-6 },
  { name: "detector", torr: 2e-6 },
];

export function run(params) {
  const { rf, neb, mode } = params;
  const T = plasmaT(rf, neb);
  const eff = nebEfficiency(neb);
  const lines = [];
  const ions = ELEMENTS.map((el) => {
    const f = ionFraction(el, T);
    for (const [mz, ab] of el.iso) {
      const cps = SENS * el.ppb * ab * f * eff * transmission(mz) * cellFactor(mode, mz);
      lines.push({ sym: el.sym, mz, cps });
    }
    return { sym: el.sym, f };
  });
  for (const i of INTERFERENCES) {
    lines.push({ sym: i.label, mz: i.mz, cps: i.cps * eff * polyFactor(mode), poly: true });
  }
  const s = QUAD.fwhm / 2.355;
  const signal = (mzSel) => NOISE + lines.reduce((sum, l) => sum + l.cps * Math.exp(-0.5 * ((l.mz - mzSel) / s) ** 2), 0);
  return { T, eff, ions, lines, signal, cpsAt: signal, rfAt: quadRF, pressures: pressures(neb) };
}
