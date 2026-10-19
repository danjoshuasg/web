// Pure SEM model: every number and the image the figure shows come from here.
// Kanaya-Okayama electron range, Reimer backscatter coefficient, universal SE yield curve,
// probe size from source, spherical, chromatic and diffraction terms, shot-noise limited image.
// Values are illustrative but physically consistent (Schottky FEG, 30 um aperture).

// Z, A (g/mol), rho (g/cm3), SE yield peak dm at energy Em (keV)
export const MATERIALS = {
  si: { label: "Si", Z: 14, A: 28.09, rho: 2.33, dm: 1.1, Em: 0.4 },
  au: { label: "Au", Z: 79, A: 196.97, rho: 19.32, dm: 1.4, Em: 0.8 },
};

export const SOURCE = { brightness: 5e8, dE: 0.6, Cs: 2.0, Cc: 1.5, aperture: 15e-3 }; // A/(cm2 sr) at 20 kV, eV, mm, mm, aperture radius mm
export const DISPLAY = { widthMm: 100, dwellUs: 5 };
export const LIMITS = { kV: [1, 30], pA: [1, 2000], wd: [4, 20], mag: [100, 200000] };
export const DEFAULTS = { kV: 10, pA: 100, wd: 8, det: "se", mag: 30000 };

const E = 1.602e-19;

// Kanaya-Okayama range (um) for a material at beam energy kV.
export const kanayaRange = (kV, mat) => {
  const m = MATERIALS[mat];
  return (0.0276 * m.A * kV ** 1.67) / (m.Z ** 0.889 * m.rho);
};

// Interaction volume extent (um): depth and lateral radius, pear shaped.
export const volume = (kV, mat) => {
  const R = kanayaRange(kV, mat);
  return { depth: R, radius: 0.8 * R };
};

// Backscatter coefficient (Reimer fit).
export const eta = (Z) => -0.0254 + 0.016 * Z - 1.86e-4 * Z * Z + 8.3e-7 * Z ** 3;

// Secondary electron yield from the universal curve.
export const seYield = (kV, mat) => {
  const m = MATERIALS[mat];
  const x = kV / m.Em;
  return 1.11 * m.dm * x ** -0.35 * (1 - Math.exp(-2.3 * x ** 1.35));
};

// Probe diameter (nm) from source, spherical, chromatic and diffraction contributions.
export function probe(p) {
  const wd = p.wd;
  const alpha = SOURCE.aperture / wd; // rad
  const beta = ((SOURCE.brightness * p.kV) / 20) / 1e14; // A/(nm2 sr)
  const dg = Math.sqrt((4 * p.pA * 1e-12) / (Math.PI ** 2 * beta * alpha ** 2));
  const Cs = SOURCE.Cs * (wd / 8) * 1e6; // nm
  const Cc = SOURCE.Cc * (wd / 8) * 1e6; // nm
  const ds = 0.5 * Cs * alpha ** 3;
  const dc = Cc * ((SOURCE.dE / (p.kV * 1000)) * alpha);
  const V = p.kV * 1000;
  const lambda = 1.226 / Math.sqrt(V * (1 + 0.9785e-6 * V)); // nm
  const dd = (1.22 * lambda) / (2 * alpha);
  return { total: Math.sqrt(dg * dg + ds * ds + dc * dc + dd * dd), dg, ds, dc, dd, alpha, lambda };
}

// Field of view (nm) for a magnification on the 100 mm display.
export const fov = (mag) => (DISPLAY.widthMm * 1e6) / mag;

// Chamber vacuum (Torr) by region.
export const pressures = () => [
  { name: "gun", torr: 5e-9 },
  { name: "column", torr: 1e-6 },
  { name: "chamber", torr: 5e-6 },
];

// Electrons landing on one pixel in one dwell.
export const electronsPerPixel = (p) => (p.pA * 1e-12 * DISPLAY.dwellUs * 1e-6) / E;

// Deterministic scene: gold spheres on silicon, 5 um tile (positions and radii in nm).
export const TILE = 5000;
export const SCENE = (() => {
  let s = 20240;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [];
  for (let i = 0; i < 90; i++) out.push({ x: rnd() * TILE, y: rnd() * TILE, r: 25 + rnd() * 75 });
  return out;
})();

// Height, material and unit normal at a point of the scene (wrapped tile).
function sample(x, y) {
  const wx = ((x % TILE) + TILE) % TILE;
  const wy = ((y % TILE) + TILE) % TILE;
  let z = 0;
  let nx = 0;
  let ny = 0;
  let au = false;
  for (const sp of SCENE) {
    let dx = wx - sp.x;
    let dy = wy - sp.y;
    if (dx > TILE / 2) dx -= TILE;
    if (dx < -TILE / 2) dx += TILE;
    if (dy > TILE / 2) dy -= TILE;
    if (dy < -TILE / 2) dy += TILE;
    const d2 = dx * dx + dy * dy;
    if (d2 >= sp.r * sp.r) continue;
    const h = Math.sqrt(sp.r * sp.r - d2);
    if (h > z) {
      z = h;
      nx = dx / sp.r;
      ny = dy / sp.r;
      au = true;
    }
  }
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return { au, nx, ny, nz };
}

// Separable Gaussian blur on a w x h array.
function blur(a, w, h, sigma) {
  if (sigma < 0.5) return a;
  const r = Math.ceil(sigma * 3);
  const k = [];
  let ks = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-0.5 * (i / sigma) ** 2);
    k.push(v);
    ks += v;
  }
  const tmp = new Float32Array(a.length);
  const out = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * a[y * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[y * w + x] = s / ks;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      out[y * w + x] = s / ks;
    }
  }
  return out;
}

// Noise-free mean signal (electrons collected per pixel) and the blur applied.
export function renderClean(p, w, h) {
  const F = fov(p.mag);
  const px = F / w;
  const N = electronsPerPixel(p);
  const dSi = seYield(p.kV, "si");
  const dAu = seYield(p.kV, "au");
  const eSi = eta(MATERIALS.si.Z);
  const eAu = eta(MATERIALS.au.Z);
  const sig = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const s = sample(2500 + (i / w - 0.5) * F, 2500 + (j / w - 0.5) * F);
      let v;
      if (p.det === "se") {
        v = 0.3 * (s.au ? dAu : dSi) / Math.max(0.25, s.nz);
      } else {
        v = 0.25 * (s.au ? eAu : eSi) * (1 + 0.5 * (1 - s.nz) + 0.4 * s.nx);
      }
      sig[j * w + i] = v * N;
    }
  }
  // Probe blur for SE; BSE is further limited by the interaction volume at high kV.
  const pr = probe(p).total;
  const reach = p.det === "bse" ? Math.max(pr, 0.1 * kanayaRange(p.kV, "si") * 1000 * 0.2) : pr;
  const sigmaPx = Math.max(0.6, reach / px / 2.355);
  return { sig: blur(sig, w, h, sigmaPx), N, pixelNm: px, sigmaPx };
}

// Seeded shot noise on a clean signal, auto-scaled to 0..1.
export function noisy(clean, seed = 3) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = clean.sig;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const g = Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    out[i] = Math.max(0, a[i] + Math.sqrt(a[i]) * g);
  }
  // Auto gain: stretch between the 1st and 99.5th percentile so a few hot pixels do not flatten the picture.
  const sorted = Float32Array.from(out).sort();
  const lo = sorted[Math.floor(0.01 * (sorted.length - 1))];
  const hi = sorted[Math.floor(0.995 * (sorted.length - 1))];
  const span = Math.max(1e-9, hi - lo);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, (out[i] - lo) / span));
  return out;
}

// Summary for the readout.
export function run(p) {
  const pr = probe(p);
  return {
    probeNm: pr.total,
    terms: pr,
    depthUm: kanayaRange(p.kV, "si"),
    depthAuUm: kanayaRange(p.kV, "au"),
    fovNm: fov(p.mag),
    electrons: electronsPerPixel(p),
    pressures: pressures(),
  };
}
