// Live runtime shared by the bench figures. A plain script (no import or export): the build inlines it after the kit
// and the figure's model, before the figure's live.js, all in one module scope. Its top-level names are exactly
// clamp, smoothstep, screenOf, ease and liveStage; scriptOf (common/bench.mjs) fails the build on any clash.

// clamp v to [lo, hi]
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// cubic ease of x across [a, b], 0 below and 1 above
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// screen offset of the world vector v under projection proj
const screenOf = (v, proj) => { const a = iso([0, 0, 0], proj), b = iso(v, proj); return [b[0] - a[0], b[1] - a[1]]; };
// first-order approach of `from` toward `to` with time constant tau (s) over a step dt (s)
const ease = (from, to, tau, dt) => from + (to - from) * (1 - Math.exp(-dt / tau));

// Drive a focusable stage (role=slider): rAF loop while visible, reduced motion, an idle tour, keys and announcements.
// opts.step(dt)      one frame, dt in s (at most 1/30)
// opts.rest()        draw the single representative frame shown under reduced motion
// opts.apply(next)   take a steered setting (from keys or sliders); the stage then announces and redraws
// opts.say()         text for the polite live region, read 700 ms after the last change
// opts.key           { value(), step, big, min, max, to(v) → next }: arrows ±step (Shift ±big), Home/End to the limits
// opts.tour, opts.idle   settings to cycle through while nobody steers, resuming idle ms after the last input (3600)
// Returns { media, steer, start, nextStop, begin }: nextStop() is the next tour setting, or null when not touring;
// begin(first) shows the reduced-motion frame or calls first() to paint frame zero.
function liveStage(stage, opts) {
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const liveEl = document.querySelector("[data-live]");
  const tour = opts.tour ?? [];
  const idle = opts.idle ?? 3600;
  let raf = 0, last = 0, visible = false, touring = !media.matches, idleTimer = 0, stop = 0, quiet = 0, held = false;
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    opts.step(dt);
    raf = visible ? requestAnimationFrame(tick) : 0;
  }
  const start = () => { if (!raf && visible && !media.matches) { last = 0; raf = requestAnimationFrame(tick); } };
  function announce() {
    clearTimeout(quiet);
    quiet = setTimeout(() => { liveEl.textContent = opts.say(); }, 700);
  }
  function steer(next) {
    touring = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { touring = !media.matches && !held; }, idle);
    opts.apply(next);
    announce();
    if (media.matches) opts.rest();
    else start();
  }
  // while the pointer is over the stage or it has focus, the tour stays paused (held); it resumes idle ms after both leave
  const pause = () => { held = true; touring = false; clearTimeout(idleTimer); };
  const resumeLater = () => { held = stage.matches(":hover") || document.activeElement === stage; clearTimeout(idleTimer); idleTimer = setTimeout(() => { touring = !media.matches && !held; }, idle); };
  const key = opts.key;
  if (key) stage.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? key.big : key.step;
    let v = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") v = key.value() + step;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") v = key.value() - step;
    if (event.key === "Home") v = key.min;
    if (event.key === "End") v = key.max;
    if (v === null) return;
    event.preventDefault();
    steer(key.to(v));
  });
  stage.addEventListener("pointerenter", pause);
  stage.addEventListener("pointerleave", resumeLater);
  stage.addEventListener("focus", () => { pause(); liveEl.textContent = stage.getAttribute("aria-valuetext"); });
  stage.addEventListener("blur", resumeLater);
  media.addEventListener?.("change", () => { touring = !media.matches; if (media.matches) opts.rest(); else start(); });
  new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) start(); }, { rootMargin: "120px 0px" }).observe(stage);
  return {
    media,
    steer,
    start,
    nextStop() {
      if (!touring || !tour.length) return null;
      stop = (stop + 1) % tour.length;
      return tour[stop];
    },
    begin(first) {
      if (media.matches) { touring = false; opts.rest(); }
      else first();
    },
  };
}
