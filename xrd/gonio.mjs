// Goniometer core shared by the build (static art at rest, recorded shapes for the audit) and the page (rebuilt per
// frame while the arms move). Theta-theta Bragg-Brentano: the sample stays flat at the axis, the tube arm stands at
// 180° - θ and the detector arm at θ, both swinging in the x-z plane about the axis (y), so the scattering angle is 2θ.
// Painter's order inside the group comes from separating planes, not from tuning:
//   y planes      drive (motor, worm) < detector wheel+arm < tube wheel+arm < everything at the beam plane
//   x planes      tube optics < sample stage < detector optics (they never cross x = ±13)
//   arm planes    coaxial parts sort along their arm by the sign of a·V; supports go just before what they carry
//   z plane       beams lie above the powder surface, so they always paint after the holder
// makeGonio(K, G, P, D): K the iso-kit functions, G the lathe kit, P the projection, D the dimensions (build passes them).
export function makeGonio(K, G, P, D) {
  const V = G.viewOf(P);
  const RAD = Math.PI / 180;
  const Y = [0, 1, 0];
  const S = (paths, style) => K.solidSvg(paths, style);
  const Ln = (d, style) => K.lineSvg(d, style);
  const Dt = (pts, style) => K.dotsSvg(pts, style);
  const at = (p) => K.iso(p, P);
  const seg = (a, b) => K.pathOf([at(a), at(b)]);
  const poly = (pts) => K.pathOf(pts.map(at), true);
  const facing = (n) => G.dot3(n, V) > 1e-6;
  const ZA = D.za;
  const YB = D.yb;

  // arm frame for an arm standing at phi degrees from +x in the x-z plane; w is the in-plane offset (up for both arms)
  function armOf(phiDeg) {
    const phi = phiDeg * RAD;
    const a = [Math.cos(phi), 0, Math.sin(phi)];
    const sg = Math.cos(phi) >= 0 ? 1 : -1;
    const n = [-Math.sin(phi) * sg, 0, Math.cos(phi) * sg];
    const L = (r, w, y) => [a[0] * r + n[0] * w, y, ZA + a[2] * r + n[2] * w];
    return { phi, a, n, L, beam: G.frameOf(L(0, 0, YB), a, n, Y), flat: G.frameOf(L(0, 0, 0), Y, a, n), sign: G.dot3(a, V) };
  }

  // ---------------------------------------------------------------- part constructors (each part: kind, shape data, svg)
  const disc = (name, F, s0, s1, r, o = {}) => ({ name, kind: "disc", F, s0, s1, r, ...o, svg: () => S(G.disc(s0, s1, r, F, P, { bevel: o.bevel ?? 0 }), { tone: o.tone ?? "mid", inner: o.inner ?? "", lit: !!o.lit }) + (o.extra ? o.extra() : "") });
  const prism = (name, F, pg, s0, s1, o = {}) => ({ name, kind: "prism", F, poly: pg, s0, s1, ...o, svg: () => S(G.prismOf(F, pg, s0, s1, P), { tone: o.tone ?? "mid", inner: o.inner ?? "" }) + (o.extra ? o.extra() : "") });
  const ball = (name, c, r, o = {}) => ({ name, kind: "ball", c, r, ...o, svg: () => S(G.sphereOf(c, r, P, { steps: 24 }), { tone: o.tone ?? "mid" }) });
  const cyl = (name, cx, cy, r, z, h, o = {}) => ({ name, kind: "cyl", cx, cy, r, z, h, ...o, svg: () => S(K.cylinder(cx, cy, r, z, h, P, o.steps ?? 40, o.bevel ?? 0), { tone: o.tone ?? "mid", inner: o.inner ?? "" }) + (o.extra ? o.extra() : "") });
  const slab = (name, plan, z, h, o = {}) => ({ name, kind: "slab", plan, z, h, ...o, svg: () => S(K.slabOf(plan, z, h, P, 3, o.bevel ?? 0.4), { tone: o.tone ?? "mid", inner: o.inner ?? "" }) + (o.extra ? o.extra() : "") });
  const box4 = (w0, w1, v0, v1) => [[w0, v0], [w1, v0], [w1, v1], [w0, v1]];

  // ---------------------------------------------------------------- one arm: wheel, plate, optics rail, optics, body, jumpers
  // spec: { phi, owner, wheel: {y0, y1, r, teeth}, plate: {y0, y1}, rail: [r0, r1], optics: [...], body: [...], brackets: [[r0, r1]...], jumpers: [...] }
  function arm(spec) {
    const A = armOf(spec.phi);
    const own = spec.owner;
    const pf = spec.plate.y1; // plate front face (world y)
    const vf = pf - YB; // the same, in beam-frame v
    const pointB = (r, w, v) => A.L(r, w, YB + v);
    const back = [];
    // wheel (disc along y) with its gear teeth turning with the arm, and a bolt circle on its front face
    const WF = G.frameOf([0, 0, ZA], Y, [1, 0, 0], [0, 0, 1]);
    const wh = spec.wheel;
    if (wh.axle) back.push(disc(`${own}.axle`, WF, wh.axle[0], wh.axle[1], wh.axle[2], { owner: own, tone: "lo" }));
    back.push(disc(`${own}.wheel`, WF, wh.y0, wh.y1, wh.r, {
      owner: own,
      tone: "mid",
      bevel: 0.3,
      extra: () =>
        K.fadedSvg(G.ribsOf(WF, wh.y0 + 0.5, wh.y1 - 0.5, wh.r, wh.teeth, P, { phase: A.phi, fade: [0.08, 0.5], seams: true }), { tone: "lo" }) +
        Ln(G.circleOf(WF, wh.y1, wh.r - 3, P, 48), { tone: "faint" }) +
        Dt(G.dotsOf(WF, wh.y1, wh.r - 5.5, wh.bolts ?? 8, P, { phase: A.phi + 0.2, all: true }), { size: 0.42 }),
    }));
    if (wh.nut) back.push(disc(`${own}.hub-nut`, WF, wh.y1, wh.y1 + wh.nut[0], wh.nut[1], { owner: own, tone: "lo", bevel: 0.2, extra: () => Dt(G.dotsOf(WF, wh.y1 + wh.nut[0], wh.nut[1] - 1.6, 6, P, { phase: A.phi, all: true }), { size: 0.36 }) + Ln(G.circleOf(WF, wh.y1 + wh.nut[0], 2.2, P, 20), { tone: "faint" }) }));
    // the arm plate, a flat bar from the hub to a pointed index tip that reads the arc's scale
    const tip = spec.plate.tip;
    const plateRing = [[spec.plate.r0, -spec.plate.w], [tip - 8, -spec.plate.w], [tip, -2], [tip, 2], [tip - 8, spec.plate.w], [spec.plate.r0, spec.plate.w]];
    back.push(prism(`${own}.plate`, A.flat, plateRing, spec.plate.y0, pf, {
      owner: own,
      tone: "mid",
      extra: () => Dt([[wh.r + 4, -6], [wh.r + 4, 6], [tip - 14, 0]].map(([r, w]) => at(A.L(r, w, pf))), { size: 0.45 }) + Ln(seg(A.L(tip - 8, -spec.plate.w, pf), A.L(tip - 8, spec.plate.w, pf)), { tone: "faint" }),
    }));
    for (const extra of spec.plateExtras ?? []) back.push(extra(A, pf));

    // coaxial parts on the beam line, sorted along the arm; supports (rail, brackets) slot in before what they carry
    const coax = [];
    const props = [];
    props.push(prism(`${own}.rail`, A.beam, box4(-4, 4, vf, -6), spec.rail[0], spec.rail[1], {
      owner: own,
      tone: "lo",
      r0: spec.rail[0],
      r1: spec.rail[1],
      extra: () => Dt([spec.rail[0] + 1.6, spec.rail[1] - 1.6].map((r) => at(pointB(r, 4, -9))), { size: 0.4 }),
    }));
    for (const [r0, r1] of spec.brackets) props.push(prism(`${own}.bracket`, A.beam, box4(-4, 4, vf, -spec.seat), r0, r1, { owner: own, tone: "mid", r0, r1, extra: () => Dt([at(pointB((r0 + r1) / 2, 4, vf + 2.2))], { size: 0.4 }) }));
    for (const part of spec.coax(A, pointB)) coax.push(part);
    const order = coax.slice().sort((p, q) => (A.sign > 0 ? 1 : -1) * ((p.r0 + p.r1) - (q.r0 + q.r1)));
    for (const prop of props) {
      const index = order.findIndex((p) => p.r0 < prop.r1 && p.r1 > prop.r0 && !p.prop);
      prop.prop = true;
      order.splice(index < 0 ? order.length : index, 0, prop);
    }
    // jumpers: gland on the plate, a run up to the beam plane, an elbow ball, an axial run into the back connector
    const lines = [];
    for (const j of spec.jumpers) {
      const id = `${own}.${j.name}`;
      const GF = G.frameOf(A.L(j.r, j.w, 0), Y, A.a, A.n);
      lines.push(disc(`${id}.gland`, GF, pf, pf + 2, j.gland, { owner: own, tone: "lo", extra: () => Ln(G.circleOf(GF, pf + 2, j.radius + 0.35, P, 16), { tone: "faint" }) }));
      lines.push(disc(`${id}.rise`, GF, pf + 2, YB, j.radius, { owner: id, tone: j.tone }));
      lines.push(disc(`${id}.run`, G.frameOf(A.L(0, j.w, YB), A.a, A.n, Y), j.from, j.r, j.radius, { owner: id, tone: j.tone }));
      lines.push(ball(`${id}.elbow`, A.L(j.r, j.w, YB), j.radius * 1.3, { owner: id, tone: "lo" }));
    }
    // lines at higher w lie nearer the viewer (n·V > 0 on both arms over the whole range)
    const byW = [];
    for (let i = 0; i < lines.length; i += 4) byW.push({ w: spec.jumpers[i / 4].w, parts: lines.slice(i, i + 4) });
    byW.sort((p, q) => (G.dot3(A.n, V) > 0 ? 1 : -1) * (p.w - q.w));
    const jumpers = byW.flatMap((x) => x.parts);
    const front = A.sign > 0 ? [...order, ...jumpers] : [...jumpers, ...order];
    return { A, back, front };
  }

  // ---------------------------------------------------------------- optics and bodies
  // a slit holder: a block with its slot drawn as a void on whichever end face shows
  const slitHolder = (own, name, A, pointB, r0, r1, half, slot) =>
    prism(`${own}.${name}`, A.beam, box4(-half, half, -6, 6), r0, r1, {
      owner: own,
      r0,
      r1,
      tone: "mid",
      extra: () => {
        const s = facing(G.mul3(A.a, -1)) ? r0 : facing(A.a) ? r1 : null;
        let out = Dt([at(pointB((r0 + r1) / 2, half, -3.6)), at(pointB((r0 + r1) / 2, half, 3.6))], { size: 0.38 });
        if (s !== null) {
          const slotD = poly([pointB(s, -slot, -4.2), pointB(s, slot, -4.2), pointB(s, slot, 4.2), pointB(s, -slot, 4.2)]);
          out += `<path class="xd-void" d="${slotD}"/>` + Ln(slotD, { tone: "lo" });
        }
        return out;
      },
    });
  // a Soller slit: a housing whose visible end face shows the edges of its stacked foils
  const soller = (own, A, pointB, r0, r1) =>
    prism(`${own}.soller`, A.beam, box4(-5.5, 5.5, -6, 6), r0, r1, {
      owner: own,
      r0,
      r1,
      tone: "hi",
      extra: () => {
        const s = facing(G.mul3(A.a, -1)) ? r0 : facing(A.a) ? r1 : null;
        let out = Ln(seg(pointB(r0 + 2, 5.5, -6), pointB(r0 + 2, 5.5, 6)) + seg(pointB(r1 - 2, 5.5, -6), pointB(r1 - 2, 5.5, 6)), { tone: "faint" });
        if (s !== null) out += Ln([-4, -2, 0, 2, 4].map((v) => seg(pointB(s, -5.5, v), pointB(s, 5.5, v))).join(""), { tone: "lo" });
        return out;
      },
    });

  // tube arm: divergence slit, Soller, Ni Kβ filter, Be window, nose, finned shield, HV/water cap
  const T = D.tube;
  function tubeCoax(A, pointB) {
    const own = "tube-arm";
    const F = A.beam;
    const out = [];
    out.push(slitHolder(own, "divergence-slit", A, pointB, T.slit[0], T.slit[1], 6, 0.55));
    out.push(soller(own, A, pointB, T.soller[0], T.soller[1]));
    out.push(prism(`${own}.kb-filter`, F, box4(-5, 5, -6, 6), T.filter[0], T.filter[1], {
      owner: own,
      r0: T.filter[0],
      r1: T.filter[1],
      tone: "lo",
      extra: () => {
        const s = facing(G.mul3(A.a, -1)) ? T.filter[0] : facing(A.a) ? T.filter[1] : null;
        if (s === null) return "";
        const foil = poly([pointB(s, -3.4, -4.4), pointB(s, 3.4, -4.4), pointB(s, 3.4, 4.4), pointB(s, -3.4, 4.4)]);
        return `<path class="xd-foil" d="${foil}"/>` + Ln(foil, { tone: "mid" });
      },
    }));
    out.push(disc(`${own}.be-window`, F, T.be[0], T.be[1], T.be[2], { owner: own, tone: "lo", r0: T.be[0], r1: T.be[1] }));
    out.push(disc(`${own}.nose`, F, T.nose[0], T.nose[1], T.nose[2], { owner: own, tone: "mid", r0: T.nose[0], r1: T.nose[1], extra: () => Dt(G.dotsOf(F, T.nose[1], T.nose[2] - 1.3, 6, P, { phase: 0.4, fade: [0.04, 0.42] }), { size: 0.38 }) }));
    // the shield is cut wherever a fin or a raised band rings it, so every piece sorts cleanly along the axis
    const rings = [...T.fins.map((s) => [s, s + 1, T.fin, "fin", "mid"]), ...T.bands.map(([b0, b1, r]) => [b0, b1, r, "band", "lo"])].sort((p, q) => p[0] - q[0]);
    const cuts = [T.shield[0], ...rings.flatMap(([b0, b1]) => [b0, b1]), T.shield[1]];
    for (let i = 0; i < cuts.length; i += 2) out.push(disc(`${own}.shield`, F, cuts[i], cuts[i + 1], T.shield[2], { owner: own, tone: "hi", r0: cuts[i], r1: cuts[i + 1] }));
    for (const [b0, b1, r, kind, tone] of rings) out.push(disc(`${own}.${kind}`, F, b0, b1, r, { owner: own, tone, r0: b0, r1: b1 }));
    out.push(disc(`${own}.cap`, F, T.cap[0], T.cap[1], T.cap[2], { owner: own, tone: "lo", bevel: 0.2, r0: T.cap[0], r1: T.cap[1], extra: () => Dt(G.dotsOf(F, T.cap[1], T.cap[2] - 0.8, 6, P, { phase: 0.5, fade: [0.04, 0.42] }), { size: 0.34 }) }));
    return out;
  }
  // detector arm: anti-scatter slit, Soller, receiving slit, 1D strip detector with fins, label and connector
  const Q = D.det;
  function detCoax(A, pointB) {
    const own = "det-arm";
    const F = A.beam;
    const out = [];
    out.push(slitHolder(own, "anti-scatter-slit", A, pointB, Q.anti[0], Q.anti[1], 6, 1.2));
    out.push(soller(own, A, pointB, Q.soller[0], Q.soller[1]));
    out.push(slitHolder(own, "receiving-slit", A, pointB, Q.recv[0], Q.recv[1], 6, 0.35));
    const [b0, b1] = Q.body;
    const h = Q.half;
    out.push(prism(`${own}.detector`, F, box4(-h, h, -h, h), b0, b1, {
      owner: own,
      r0: b0,
      r1: b1,
      tone: "hi",
      extra: () => {
        // fins across the top face, a seam round the front, a label plate with rule lines, a status dot and screws
        let out = "";
        if (facing(A.n)) out += Ln(Q.fins.map((r) => seg(pointB(r, h, -h), pointB(r, h, h))).join(""), { tone: "lo" });
        out += Ln(seg(pointB(b0 + 4, -h, h), pointB(b0 + 4, h, h)) + (facing(A.n) ? seg(pointB(b0 + 4, h, -h), pointB(b0 + 4, h, h)) : ""), { tone: "faint" });
        const lp = [pointB(b0 + 8, -5, h), pointB(b0 + 17, -5, h), pointB(b0 + 17, 1, h), pointB(b0 + 8, 1, h)];
        out += Ln(poly(lp), { tone: "lo" }) + Ln(seg(pointB(b0 + 9.4, -1.2, h), pointB(b0 + 15.6, -1.2, h)) + seg(pointB(b0 + 9.4, -3.2, h), pointB(b0 + 13.6, -3.2, h)), { tone: "faint", free: true });
        out += Dt([at(pointB(b1 - 3, 4.6, h))], { size: 0.7, tone: "hi" });
        out += Dt([[b0 + 1.6, -h + 1.6], [b0 + 1.6, h - 1.6], [b1 - 1.6, -h + 1.6], [b1 - 1.6, h - 1.6]].map(([r, w]) => at(pointB(r, w, h))), { size: 0.4 });
        return out;
      },
    }));
    out.push(disc(`${own}.connector`, F, Q.conn[0], Q.conn[1], Q.conn[2], { owner: own, tone: "lo", r0: Q.conn[0], r1: Q.conn[1], extra: () => Ln(G.circleOf(F, Q.conn[1], Q.conn[2] - 1, P, 20), { tone: "faint" }) }));
    return out;
  }

  // ---------------------------------------------------------------- static parts inside the group: drive and sample stage
  const W = D.worm;
  const XF = G.frameOf([0, W.y, W.z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  function drive(wormAngle) {
    const out = [];
    for (const sx of [-1, 1]) out.push(prism("drive.bearing", G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]), box4(W.blockY[0], W.blockY[1], W.blockZ[0], W.blockZ[1]), sx > 0 ? W.x : -W.x - W.block, sx > 0 ? W.x + W.block : -W.x, { owner: "drive", tone: "lo", extra: () => Dt([at([sx * (W.x + W.block / 2), W.blockY[1], W.blockZ[1] - 1.6])], { size: 0.4 }) }));
    out.push(disc("drive.worm", XF, -W.x, W.x, W.r, { owner: "drive", tone: "hi", extra: () => K.fadedSvg(G.ribsOf(XF, -W.x + 0.8, W.x - 0.8, W.r, 10, P, { phase: wormAngle, twist: 2.4, fade: [0.08, 0.5], seams: true }), { tone: "lo" }) }));
    const M = W.motor;
    const MF = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    const sq = box4(M.y[0], M.y[1], M.z[0], M.z[1]);
    out.push(prism("drive.motor-cap", MF, sq, M.x[0], M.x[0] + 2, { owner: "drive", tone: "lo" }));
    out.push(prism("drive.motor", MF, sq, M.x[0] + 2, M.x[1] - 2, {
      owner: "drive",
      tone: "mid",
      extra: () => Ln([0.3, 0.5, 0.7].map((f) => seg([M.x[0] + 2 + f * (M.x[1] - M.x[0] - 4), M.y[0], M.z[1]], [M.x[0] + 2 + f * (M.x[1] - M.x[0] - 4), M.y[1], M.z[1]])).join("") + [0.3, 0.5, 0.7].map((f) => seg([M.x[0] + 2 + f * (M.x[1] - M.x[0] - 4), M.y[1], M.z[0]], [M.x[0] + 2 + f * (M.x[1] - M.x[0] - 4), M.y[1], M.z[1]])).join(""), { tone: "faint" }),
    }));
    out.push(prism("drive.motor-cap", MF, sq, M.x[1] - 2, M.x[1], { owner: "drive", tone: "lo", extra: () => Dt([[M.x[1], M.y[1] - 1.6, M.z[0] + 1.6], [M.x[1], M.y[1] - 1.6, M.z[1] - 1.6]].map(at), { size: 0.4 }) }));
    return out;
  }
  const ST = D.stage;
  function stage() {
    const [cx, cy] = [0, YB];
    const out = [];
    out.push(slab("stage.base", ST.base, ST.z0, ST.baseH, { owner: "stage", tone: "lo", extra: () => Dt(K.corners(ST.base, 2.6).map(([x, y]) => at([x, y, ST.z0 + ST.baseH])), { size: 0.42 }) }));
    out.push(cyl("stage.column", cx, cy, ST.column, ST.z0 + ST.baseH, ST.spinZ - ST.z0 - ST.baseH, { owner: "stage", tone: "mid", steps: 28, inner: Ln(K.sideArc(cx, cy, ST.column, ST.z0 + ST.baseH + 8, P, 16), { tone: "faint" }) }));
    out.push(cyl("stage.spinner", cx, cy, ST.spinR, ST.spinZ, ST.spinH, { owner: "stage", tone: "lo", bevel: 0.3, extra: () => Ln(K.knurl(cx, cy, ST.spinR, ST.spinZ + 0.8, ST.spinZ + ST.spinH - 0.8, 36, P), { tone: "faint" }) }));
    const pz = ST.spinZ + ST.spinH;
    out.push(cyl("stage.plate", cx, cy, ST.plateR, pz, ST.plateH, { owner: "stage", tone: "mid", bevel: 0.3, extra: () => `<path data-part="spin-ticks" class="iso-line" data-tone="lo" d=""/>` }));
    const hz = pz + ST.plateH;
    out.push(cyl("stage.holder", cx, cy, ST.holderR, hz, ZA - hz, {
      owner: "stage",
      tone: "hi",
      steps: 48,
      extra: () => `<path class="xd-powder" d="${K.ring(cx, cy, ST.wellR, ZA, P, 48)}"/>` + Ln(K.ring(cx, cy, ST.wellR, ZA, P, 48), { tone: "lo" }) + Dt(ST.grains.map(([x, y]) => at([cx + x, cy + y, ZA])), { size: 0.3, tone: "lo" }),
    }));
    return out;
  }

  // ---------------------------------------------------------------- beams (filled live) and the whole group
  const beamSlot = (part) => `<g class="xd-beam" data-part="${part}"><path class="xd-ray" data-part="${part}-ray" d=""/><path class="xd-photon" data-part="${part}-dots" d=""/></g>`;
  const spotSlot = `<path class="xd-spot" data-part="spot" d=""/>`;

  function parts(twoTheta, wormAngle = 0) {
    const th = twoTheta / 2;
    const det = arm({ phi: th, owner: "det-arm", ...D.detArm, coax: detCoax });
    const tube = arm({ phi: 180 - th, owner: "tube-arm", ...D.tubeArm, coax: tubeCoax });
    return { det, tube, drive: drive(wormAngle), stage: stage() };
  }

  // svg of the whole group in painter's order, with the beam slots where they belong at this angle
  function svg(twoTheta, wormAngle = 0) {
    const { det, tube, drive: dr, stage: st } = parts(twoTheta, wormAngle);
    const html = (list) => list.map((p) => `<g data-n="${p.name}">${p.svg()}</g>`).join("");
    // incident beam vs tube optics: the beam (inside r = slit) is nearer when (−a)·V > 0
    const beamFirst = tube.A.sign > 0;
    return (
      html(dr) +
      html(det.back) +
      html(tube.back) +
      (beamFirst ? html(st) + spotSlot + beamSlot("beam-in") + html(tube.front) : html(tube.front) + html(st) + spotSlot + beamSlot("beam-in")) +
      beamSlot("beam-out") +
      html(det.front)
    );
  }

  // every part as a flat list (for the audit), and the arm frames (for the beams)
  function list(twoTheta) {
    const { det, tube, drive: dr, stage: st } = parts(twoTheta);
    return [...dr, ...det.back, ...tube.back, ...tube.front, ...st, ...det.front];
  }

  return { armOf, svg, list };
}
