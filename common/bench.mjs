// Shared bench kit for isometric lab-instrument figures (HPLC, ICP-MS, ...).
// Build side only: geometry helpers bound to one projection and one recorder, plus the page block.
// The live side is common/live-core.js (inlined by scriptOf, never imported).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../kit/tube.mjs";
import * as A from "../kit/audit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Source of an ES module with line-start `export ` removed, ready to inline in the page script. */
export const moduleText = (file) => readFileSync(file, "utf8").replace(/^export /gm, "");

/** Generic stage, controls and LCD CSS (`.bx-` prefix); prepend to the figure's own CSS. */
export const BENCH_CSS = readFileSync(join(HERE, "bench.css"), "utf8");

/** Live runtime (clamp, smoothstep, screenOf, ease, liveStage): inline after the model, before live.js. */
export const LIVE_CORE = readFileSync(join(HERE, "live-core.js"), "utf8");

/**
 * Bench factory: every helper draws with projection P, records into recorder R and sizes facets with KS.
 * opts: { bench: plan {x,y,w,d,r} (required for stand), benchH = 10, footH = 5, ns = "bx" (clipPath id prefix) }.
 */
export function makeBench(P, R, KS, { bench: BENCH, benchH: BENCH_H = 10, footH: FOOT_H = 5, ns = "bx" } = {}) {
  // ------------------------------------------------------------ shortcuts
  const at = (p) => k.iso(p, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const D = (pts, style) => k.dotsSvg(pts, style);
  const path3 = (pts, closed = false) => k.pathOf(pts.map(at), closed);
  const rounded = (u0, v0, u1, v1, r, map, steps = 4) => path3(k.roundedPlan({ x: u0, y: v0, w: u1 - u0, d: v1 - v0, r }, steps).map(([u, v]) => map(u, v)), true);
  const onFront = (y) => (u, v) => [u, y, v]; // u = x, v = z
  const onRight = (x) => (u, v) => [x, u, v]; // u = y, v = z
  const onTop = (z) => (u, v) => [u, v, z];

  // ------------------------------------------------------------ recorder
  const record = R.solid;
  function put(name, centre, svg, shapes = [], { bias = 0 } = {}) {
    const id = R.nameFor(name);
    R.put({ at: centre, bias, svg, name: id, shapes });
    return id;
  }
  function box(name, plan, z, h, { tone = "mid", steps = 3, bevel = 0.5, extra = "", inner = "", lit = false, crease, bias = 0, owner } = {}) {
    const id = R.nameFor(name);
    const shape = record(A.slab(plan, z, h, { name: id, owner }, steps));
    R.put({ at: [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], bias, name: id, svg: S(k.slabOf(plan, z, h, P, steps, bevel), { tone, inner, lit, crease }) + extra, shapes: [shape] });
    return shape;
  }
  function cyl(name, cx, cy, r, z, h, { tone = "mid", steps, bevel = 0, extra = "", inner = "", crease, bias = 0, owner } = {}) {
    const id = R.nameFor(name);
    const shape = record(A.cylinder(cx, cy, r, z, h, { name: id, owner }));
    R.put({ at: [cx, cy, z + h / 2], bias, name: id, svg: S(k.cylinder(cx, cy, r, z, h, P, steps ?? G.stepsFor(r, 20, 72, KS), bevel), { tone, inner, crease }) + extra, shapes: [shape] });
    return shape;
  }
  function discAt(name, F, s0, s1, r, { tone = "mid", extra = "", inner = "", bias = 0, owner, bevel = 0, lit = false } = {}) {
    const id = R.nameFor(name);
    const shape = record(A.disc(F, s0, s1, r, { name: id, owner }));
    R.put({ at: G.pointOf(F, (s0 + s1) / 2, 0, 0), bias, name: id, svg: S(G.disc(s0, s1, r, F, P, { bevel }), { tone, inner, lit }) + extra, shapes: [shape] });
    return shape;
  }
  function ballAt(name, c, r, { tone = "mid", owner } = {}) {
    const id = R.nameFor(name);
    const shape = record(A.ball(c, r, { name: id, owner }));
    R.put({ at: c, name: id, svg: S(G.sphereOf(c, r, P, { steps: G.stepsFor(r, 24) }), { tone }), shapes: [shape] });
    return shape;
  }

  // ------------------------------------------------------------ tubing
  const routes = [];
  function tubeItems(name, route, r, { tone = "hi", gaps = [], rims, limp = false, maxLength = 18, spacing = 1, caps = true, owner, touch } = {}) {
    const id = R.nameFor(name);
    R.route(id, route, r, { owner: owner ?? id, gaps, rims, limp, touch });
    tubePieces(route, r, P, { maxLength, spacing, gaps, caps }).forEach((part, index) =>
      R.put({ at: part.mid, name: `${id}:${index}`, route: id, chunk: index, svg: tubeSvg(part, { tone }), shapes: [A.tube(part.points, part.radii)] }),
    );
    return id;
  }
  function pipe(name, control, r, { bend = 3.4, tone = "hi", ends = ["nut", "nut"], nutR = 1.6, maxLength = 18 } = {}) {
    const line = G.fillet(control, Math.max(r * bend, 3), 12, { P, tube: r });
    const total = G.pathLength(line);
    const collars = [];
    [[0, -1], [total, 1]].forEach(([along, sign], index) => {
      if (ends[index] !== "nut") return;
      const thick = 1.6;
      const tangent = G.tangentAlong(line, along);
      collars.push({ centre: G.add3(G.pointAlong(line, along), G.mul3(tangent, (-sign * thick) / 2)), tangent, thick, gap: sign < 0 ? [0, thick] : [total - thick, total] });
    });
    const id = tubeItems(name, line, r, { tone, gaps: collars.map((c) => c.gap), rims: ends.map((e) => (e === "nut" ? nutR : r)), maxLength });
    for (const c of collars) {
      const F = G.frameAlong(c.centre, c.tangent);
      discAt(`${id}.nut`, F, -c.thick / 2, c.thick / 2, nutR, { tone: "mid", owner: id, bevel: 0.2 });
    }
    routes.push({ id, line, r });
    return line;
  }
  const onBall = (c, b, a, d) => G.add3(c, G.mul3(G.unit3(d), Math.sqrt(b * b - a * a)));

  // ------------------------------------------------------------ stand: halo, feet, top, ruler strip, label, shadows
  function stand({ strip, label, shadows = [] } = {}) {
    const back = [];
    back.push(`<path class="iso-halo" d="${k.haloOf(BENCH, -BENCH_H - FOOT_H, BENCH_H, P)}"/>`);
    const feet = k.corners(BENCH, 20).concat([[BENCH.x + BENCH.w / 2, BENCH.y + 20], [BENCH.x + BENCH.w / 2, BENCH.y + BENCH.d - 20]]);
    for (const [x, y] of feet.sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P))) {
      back.push(S(k.cylinder(x, y, 8, -BENCH_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
      back.push(S(k.cylinder(x, y, 6, -BENCH_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
    }
    back.push(S(k.slabOf(BENCH, -BENCH_H, BENCH_H, P, 8, 1.6), { tone: "mid" }));
    record(A.slab(BENCH, -BENCH_H, BENCH_H, { name: "stand.bench" }, 8));
    back.push(L(k.planOutline(k.insetPlan(BENCH, 5), 0, P), { tone: "lo" }));
    const screws = k.corners(BENCH, 10);
    back.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
    back.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
    if (strip) {
      const s = { x: strip.x, y: BENCH.y + BENCH.d - 11, w: strip.w, d: 7, r: 1 };
      back.push(S(k.slabOf(s, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
      const ticks = k.topTicks(s.x + 4, s.x + s.w - 4, 4, 5, s.y + 0.8, 0.6, [2, 3.6], P);
      back.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
      back.push(D([at([s.x + 2, s.y + 3.5, 0.6]), at([s.x + s.w - 2, s.y + 3.5, 0.6])], { size: 0.45 }));
    }
    if (label) {
      const l = { x: label.x, y: BENCH.y + BENCH.d - 12, w: 40, d: 9, r: 1.2 };
      back.push(S(k.slabOf(l, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
      back.push(L(k.planOutline(k.insetPlan(l, 1.4), 0.8, P, 3), { tone: "faint" }));
      back.push(L([24, 16].map((w, i) => k.lineOnTop([l.x + 4, l.y + 3.6 + i * 3], [l.x + 4 + w, l.y + 3.6 + i * 3], 0.8, P)).join(""), { tone: "lo", free: true }));
      back.push(D([at([l.x + l.w - 3.4, l.y + l.d / 2, 0.8])], { size: 0.45 }));
    }
    for (const [plan, h] of shadows) back.push(`<path class="iso-halo" d="${k.haloOf(plan, 0, h, P)}" style="opacity:calc(var(--anatomy-halo-opacity)*.7)"/>`);
    return back;
  }

  // ------------------------------------------------------------ bottle: body, cosine shoulder (G.solidOf), neck, knurled cap, port
  function bottle(name, { x, y, z0, r, body, shoulder, neck, neckH = 0, cap, capH, capBevel = 0.5, knurl = 40, capDot = [4.2, -1.4], level, bands = [], arcSteps = 40, samples = 20, port = 2.2, portName = "cap-port" }) {
    const radius = (s) => neck + (r - neck) * Math.cos((Math.PI / 2) * Math.min(1, Math.max(0, s / shoulder)));
    const slope = (s) => -(r - neck) * (Math.PI / 2 / shoulder) * Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, s / shoulder)));
    const zs = z0 + body;
    cyl(`${name}.body`, x, y, r, z0, body, {
      tone: "mid",
      inner: L(k.sideArc(x, y, r, level, P, arcSteps), { tone: "lo" }) + L(bands.map((z) => k.sideArc(x, y, r, z, P, arcSteps)).join(""), { tone: "faint" }),
    });
    const F = G.frameOf([x, y, zs], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
    const prof = Array.from({ length: samples + 1 }, (_, i) => {
      const s = (i / samples) * shoulder;
      return [s, radius(s), i > 0 && i < samples ? 1 : 0];
    });
    const id = R.nameFor(`${name}.shoulder`);
    const shape = record(A.solid(F, prof.map(([s, rr]) => [s, rr]), { name: id, radius }));
    R.put({ at: [x, y, zs + shoulder / 2], name: id, shapes: [shape], svg: S(G.solidOf(prof, F, P, { smooth: { slope, radius } }), { tone: "mid" }) });
    const zn = zs + shoulder;
    if (neckH) cyl(`${name}.neck`, x, y, neck, zn, neckH, { tone: "mid" });
    const zc = zn + neckH;
    const dot = capDot ? D([at([x + capDot[0], y + capDot[1], zc + capH])], { size: 0.5, tone: "mid" }) : "";
    cyl(`${name}.cap`, x, y, cap, zc, capH, { tone: "lo", bevel: capBevel, extra: L(k.knurl(x, y, cap, zc, zc + capH, knurl, P), { tone: "faint" }) + dot });
    cyl(`${name}.${portName}`, x, y, port, zc + capH, 2, { tone: "mid" });
    return [x, y, zc + capH + 2];
  }

  // ------------------------------------------------------------ data cable lying on the bench between two side ports
  // from/to: { name, at, dir, ring? } (port disc of radius 1.9, 2.5 deep, facing dir); via: waypoints between them
  function cable(name, from, to, via, { r = 0.62, touch = ["stand.bench"] } = {}) {
    const ends = [from, to].map((end) => {
      const F = G.frameAlong(end.at, end.dir);
      discAt(end.name, F, 0, 2.5, 1.9, { tone: "mid", extra: end.ring ? L(G.circleOf(F, 2.5, end.ring, P, 12), { tone: "faint" }) : "" });
      return G.pointOf(F, 2.5, 0, 0);
    });
    const route = G.fillet([ends[0], ...via, ends[1]], 3, 12, { P, tube: r });
    return tubeItems(name, route, r, { tone: "mid", limp: true, maxLength: 14, rims: [r, r], touch });
  }

  // ------------------------------------------------------------ control panel: base, neck, body, optional cable, LCD in the front plane
  // body {x,x1,y,y1,z0,z1}; screen {x0,x1,z0,z1,r}; buttons [[x,z]]; led [x,z]; cable [from,to,via]; text {clock,phase}.
  // The LCD carries data-part trace/pen/clock/phase/ticks/gradient/reveal for live.js. Returns the plot box {x0,x1,z0,z1}.
  // extra: markup in screen coordinates (x, -z) placed inside the screen clip, after the texts (default none).
  function panel(name, { base, baseH = 5, neck, body, screen, buttons = [], led, cable: wire, inset = [4, 5, 7], text = {}, extra = "" }) {
    box(`${name}.base`, base, 0, baseH, { tone: "lo", bevel: 0.6, extra: D(k.corners(base, 4).map(([x, y]) => at([x, y, baseH])), { size: 0.45 }) });
    cyl(`${name}.neck`, neck.x, neck.y, neck.r, baseH, body.z0 - baseH, { tone: "mid", inner: L(k.sideArc(neck.x, neck.y, neck.r, baseH + 7, P, 16), { tone: "faint" }) });
    const plan = { x: body.x, y: body.y, w: body.x1 - body.x, d: body.y1 - body.y, r: 1.4 };
    const front = onFront(body.y1);
    box(`${name}.body`, plan, body.z0, body.z1 - body.z0, {
      tone: "mid",
      bevel: 0.6,
      extra:
        L(rounded(screen.x0 - 2, screen.z0 - 2, screen.x1 + 2, screen.z1 + 2, 3, front), { tone: "lo" }) +
        L(buttons.map(([x, z]) => rounded(x - 2.4, z - 1.2, x + 2.4, z + 1.2, 1.1, front)).join(""), { tone: "lo" }) +
        (led ? D([at([led[0], body.y1, led[1]])], { size: 0.8, tone: "hi" }) : ""),
    });
    if (wire) cable(`${name}.cable`, ...wire);
    const PLOT = { x0: screen.x0 + inset[0], x1: screen.x1, z0: screen.z0 + inset[1], z1: screen.z1 - inset[2] };
    const plane = k.sideMatrix([0, body.y1], 0, P, "left");
    const flat = (x0, z0, x1, z1, r) => k.pathOf(k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, 6).map(([u, z]) => [u, -z]), true);
    const win = flat(screen.x0, screen.z0, screen.x1, screen.z1, screen.r);
    const grid = [0.25, 0.5, 0.75, 1].map((f) => `M${screen.x0} ${-(PLOT.z0 + f * (PLOT.z1 - PLOT.z0)).toFixed(2)}H${screen.x1}`).join("");
    const words = `<text class="bx-lcd-text" data-part="clock" x="${screen.x0 + 4.6}" y="${-(screen.z1 - 4.6)}" font-size="3.6">${text.clock ?? ""}</text><text class="bx-lcd-text" data-part="phase" x="${screen.x1 - 2.6}" y="${-(screen.z1 - 4.6)}" font-size="3.6" text-anchor="end">${text.phase ?? ""}</text>`;
    const svg = `<g transform="${plane}"><clipPath id="${ns}-screen"><path d="${win}"/></clipPath><path class="bx-lcd" d="${win}"/><g clip-path="url(#${ns}-screen)"><path class="iso-line" data-tone="faint" d="${grid}"/><path class="iso-line" data-tone="lo" d="M${PLOT.x0} ${-screen.z0}V${-screen.z1}M${screen.x0} ${-PLOT.z0}H${screen.x1}"/><path data-part="ticks" class="iso-line" data-tone="lo" d=""/><path data-part="gradient" class="iso-line" data-tone="lo" data-dashed d=""/><clipPath id="${ns}-reveal"><rect data-part="reveal" x="${screen.x0}" y="${-screen.z1}" width="0" height="${screen.z1 - screen.z0}"/></clipPath><g clip-path="url(#${ns}-reveal)"><path data-part="trace" class="iso-line bx-trace" data-tone="hi" d=""/></g><circle data-part="pen" class="bx-pen" r="0.9" cx="${PLOT.x0}" cy="${-PLOT.z0}"/>${words}${extra}</g><path class="iso-line" data-tone="lo" d="${win}"/></g>`;
    put(`${name}.screen`, [(screen.x0 + screen.x1) / 2, body.y1 + 0.1, (screen.z0 + screen.z1) / 2], svg, [record(A.box([screen.x0, body.y1, screen.z0], [screen.x1, body.y1 + 0.1, screen.z1], { name: `${name}.screen` }))], { bias: 0.5 });
    return PLOT;
  }

  // ------------------------------------------------------------ close: settle depth, sort by key, emit items
  function settle() {
    A.settle(R, P);
    R.items.sort((a, b) => a.key - b.key);
    return R.items.map((item) => `<g class="it" data-n="${item.name}">${item.svg}</g>`).join("");
  }

  return { at, S, L, D, path3, rounded, onFront, onRight, onTop, record, put, box, cyl, discAt, ballAt, routes, tubeItems, pipe, onBall, stand, bottle, cable, panel, settle };
}

// ---------------------------------------------------------------- page block (strings are HTML, not escaped)

/** Slider row plus a note and the polite live region; sliders: [{ key, name, min, max, step, value, text, valuetext }]. */
export function controlsHtml(sliders, note = "") {
  const rows = sliders.map((s) => `<label class="bx-ctl"><span class="bx-ctl-name">${s.name}</span><input type="range" data-ctl="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}" aria-valuetext="${s.valuetext}"><output data-out="${s.key}">${s.text}</output></label>\n`).join("");
  return `<div class="bx-controls">\n${rows}<span class="bx-note" data-note>${note}</span>\n</div><span class="bx-live" aria-live="polite" data-live></span>`;
}

/** Focusable stage (role=slider) around the figure svg (and later a sibling canvas); aria: { label, min, max, now, valuetext }. */
export function stageHtml(inner, { label, min, max, now, valuetext }) {
  return `<div class="iso-stage bx-stage" tabindex="0" role="slider" aria-label="${label}" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${now}" aria-valuetext="${valuetext}">${inner}</div>`;
}

/** Whole page: kit pageHtml around kit plateHtml, with BENCH_CSS + css in one style tag. */
export function pageOf({ title, theme, width, css = "", plate, script }) {
  return k.pageHtml({ title, theme, width, body: `<style>${BENCH_CSS}${css}</style>` + k.plateHtml(plate), script });
}

/** Join inline script parts with "\n"; throws on a top-level name declared twice, a line-start import/export or a leftover __DATA__. */
export function scriptOf(...parts) {
  const seen = new Map();
  parts.forEach((part, index) => {
    for (const name of topLevelNames(part)) {
      if (seen.has(name)) throw new Error(`scriptOf: "${name}" is declared at top level in parts ${seen.get(name)} and ${index}`);
      seen.set(name, index);
    }
  });
  const script = parts.join("\n");
  const bad = script.match(/^[ \t]*(import|export)\b.*$/m) ?? script.match(/__DATA__/);
  if (bad) throw new Error(`scriptOf: cannot inline ${JSON.stringify(bad[0].slice(0, 60))}`);
  return script;
}

// names declared at column 0: function/class names, const/let/var declarators (plain or destructured)
function topLevelNames(source) {
  const names = [];
  for (const line of source.split("\n")) {
    const fn = line.match(/^(?:async\s+)?(?:function\*?|class)\s+([\w$]+)/);
    if (fn) { names.push(fn[1]); continue; }
    const decl = line.match(/^(?:const|let|var)\s+(.*)/);
    if (!decl) continue;
    // walk the declarator list: collect each binding head, skip each initialiser (brackets and strings balanced)
    const parts = [];
    let depth = 0, head = "", quote = "";
    for (const ch of decl[1]) {
      if (quote) { if (ch === quote) quote = ""; continue; }
      if (head === null && "\"'`".includes(ch)) { quote = ch; continue; }
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch) && --depth < 0) break;
      if (depth === 0 && ch === ";") break;
      if (depth === 0 && ch === "=" && head !== null) { parts.push(head); head = null; continue; }
      if (depth === 0 && ch === ",") { if (head !== null) parts.push(head); head = ""; continue; }
      if (head !== null) head += ch;
    }
    if (head) parts.push(head);
    for (const p of parts) for (const m of p.replace(/[\w$]+\s*:/g, "").matchAll(/[A-Za-z_$][\w$]*/g)) names.push(m[0]);
  }
  return names;
}
