// =====================================================================
// pageShadow.js — EDGE-FOLLOWING page-turn shadow (the ONLY page-turn shadow).
//
// Shared by ALL page-turn transitions so they look identical:
//   • interior page turns          (js/pageCurl.js)
//   • THE END ↔ toolbox            (js/pageCurl.js via animate)
//   • cover open / close / back    (js/app.js _coverFxBuild)
//
// Two visuals that ride the moving page's free (fore) edge:
//   1. a thin dark-grey LINE = the page edge itself.
//   2. a soft one-sided SHADOW that trails the edge onto the page BENEATH.
//
// ANGLE model: 0° = flat on the start side · 90° = vertical · 180° = flat on
// the destination side. The shadow sits on ONE side of the line — the side
// AWAY from the spine (the exposed page beneath). It's strongest when the page
// is near flat, thins + dims as it rises, vanishes at 90°, then reappears on
// the OTHER side of the line past 90° (reciprocal). It is NEVER drawn over the
// turning page itself — only on the exposed page it's trailing.
//
// (The old receiver + gutter layers were removed in v0.9.55; this is the whole
// model now.)
// =====================================================================
window.PageShadow = (function () {
  const MAXA = 0.92;                                   // darkest the shadow gets at the line
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smoothstep = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

  // RAMP — how the shadow changes from flat(0°) → vertical(90°). Explicit math.
  function ramp(x, mode) {
    x = clamp01(x);
    switch (mode) {
      case 'linear': return x;
      case 'x2':     return x * x;
      case 'x3':     return x * x * x;
      case 'x2.5':
      default:       return Math.pow(x, 2.5);
    }
  }

  const DBG = '255,120,0';                             // debug tint (orange) for the shadow
  const masterOn = (o) => !!(o && o.on !== false);
  // closeness to a flat surface: 1 at flat (0°/180°), 0 at vertical (90°).
  const closeness = (angleDeg) => clamp01(Math.abs(angleDeg - 90) / 90);

  // Shadow darkness at a given leaf angle (0 at 90°, peak near flat).
  function shadowOpacity(angleDeg, o) {
    if (!masterOn(o)) return 0;
    const dark = o.darkness != null ? o.darkness : 0.5;
    const shape = ramp(closeness(angleDeg), o.curve);
    return o.debug ? Math.max(dark * shape, 0.55 * shape + 0.05) : dark * shape;
  }
  // How far the shadow reaches past the edge line, in px — proportional to page
  // size, and thinner as the page nears vertical. Caller clamps to the exposed
  // strip so it never spills off the page.
  function shadowReachPx(angleDeg, o, halfPx) {
    const frac = o.reach != null ? o.reach : 0.3;
    return frac * halfPx * (0.22 + 0.78 * closeness(angleDeg));
  }
  // Gradient for the shadow band: dark at the line (0%) → transparent (100%).
  function shadowGradient(dir, o) {
    const rgb = o.debug ? DBG : '0,0,0';
    return 'linear-gradient(' + dir + ', rgba(' + rgb + ',' + MAXA + ') 0%, rgba(' + rgb + ',0) 100%)';
  }
  const softPx = (o) => (o && o.soft != null ? clamp01(o.soft) : 0) * 16;

  // The thin dark-grey page-edge line — fades in off-flat so it doesn't pop.
  function lineOpacity(angleDeg, o) {
    if (!masterOn(o)) return 0;
    return clamp01(0.12 + Math.sin(angleDeg * Math.PI / 180) * 0.62);
  }

  return { ramp, smoothstep, masterOn, closeness, shadowOpacity, shadowReachPx, shadowGradient, softPx, lineOpacity, MAXA };
})();
