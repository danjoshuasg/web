// Pure HPLC model: every number the figure shows comes from here.
// Reversed-phase C18 column, water / acetonitrile. Values are illustrative but physically consistent.

export const COLUMN = { L: 0.15, d: 4.6e-3, dp: 5e-6, eps: 0.4, epsTotal: 0.65, plates: 12000 };

export const ANALYTES = [
  { name: "A", kw: 6.0, S: 3.2 },
  { name: "B", kw: 30, S: 4.4 },
  { name: "C", kw: 160, S: 5.6 },
];

export const LIMITS = { flow: [0.2, 2.0], phi0: [0.05, 0.9], phi1: [0.05, 0.95], tG: [2, 20], pMax: 400 };

const area = () => Math.PI * (COLUMN.d / 2) ** 2;

// Water / ACN mixture viscosity (mPa*s), quadratic fit with the known maximum near 20% ACN.
export const viscosity = (phi) => 0.89 * (1 - phi) + 0.37 * phi + 0.9 * phi * (1 - phi);

// Kozeny-Carman backpressure (bar) for flow in mL/min and ACN fraction phi.
export function pressure(flow, phi) {
  const u = (flow * 1e-6 / 60) / area();
  const e = COLUMN.eps;
  const dP = (150 * viscosity(phi) * 1e-3 * u * COLUMN.L * (1 - e) ** 2) / (e ** 3 * COLUMN.dp ** 2);
  return dP / 1e5;
}

// Dead time (min): total porosity volume over flow.
export const deadTime = (flow) => (COLUMN.epsTotal * area() * COLUMN.L * 1e6) / flow;

export const retentionFactor = (a, phi) => 10 ** (Math.log10(a.kw) - a.S * phi);

// Linear gradient from phi0 to phi1 over tG minutes, held at phi1 afterwards.
export const phiAt = (t, { phi0, phi1, tG }) => (t >= tG ? phi1 : phi0 + ((phi1 - phi0) * Math.max(t, 0)) / tG);

// Retention time (min) by integrating the band migration dx/dt = 1 / (t0 (1 + k(phi(t)))) until x = 1.
export function retentionTime(a, { flow, phi0, phi1, tG }) {
  const t0 = deadTime(flow);
  const dt = 0.005;
  let x = 0;
  let t = 0;
  while (x < 1 && t < 200) {
    x += dt / (t0 * (1 + retentionFactor(a, phiAt(t, { phi0, phi1, tG }))));
    t += dt;
  }
  return t;
}

// Full run state: retention times, peak widths, pressure trace and chromogram sampler.
export function run(params) {
  const t0 = deadTime(params.flow);
  const peaks = ANALYTES.map((a) => {
    const tR = retentionTime(a, params);
    // Peak width grows with retention; gradient compression is ignored on purpose.
    return { name: a.name, tR, sigma: tR / Math.sqrt(COLUMN.plates), height: 1 };
  });
  const end = Math.max(...peaks.map((p) => p.tR)) * 1.1;
  const signal = (t) => peaks.reduce((s, p) => s + p.height * Math.exp(-0.5 * ((t - p.tR) / p.sigma) ** 2), 0);
  const pressureAt = (t) => pressure(params.flow, phiAt(t, params));
  return { t0, peaks, end, signal, phiAt: (t) => phiAt(t, params), pressureAt, pMax: Math.max(pressureAt(0), pressureAt(end)) };
}

export const DEFAULTS = { flow: 1.0, phi0: 0.2, phi1: 0.8, tG: 10 };
