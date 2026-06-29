// =====================================================================
// pageShadow.js — ONE shared cast-shadow model for EVERY book transition:
//   • interior page turns          (js/pageCurl.js apply())
//   • THE END ↔ toolbox            (js/pageCurl.js via _sswUp → animate)
//   • cover open / cover close     (js/app.js _coverFxBuild apply())
//   • book close via back arrow    (same _coverFxBuild, closing=true)
//
// The PHYSICS lives here so every transition ramps, projects, softens, and
// responds to the diagnostics IDENTICALLY. Callers differ ONLY in geometry
// (which DOM layer is the turning leaf vs. the stationary page beneath, and
// which way the band projects). If a shadow looks wrong, debug the geometry
// in the caller — not the numbers here.
//
// PHYSICAL MODEL — a turning leaf casts onto the STATIONARY page beneath it,
// never onto its own lit top face. Two roles, by leaf angle:
//   0°   = leaf flat on the starting side
//   90°  = leaf vertical
//   180° = leaf flat on the destination side
//
//   revealed(p1)  LIFT phase 0°→90°. p1 = lift progress (0 = flat … 1 = vertical).
//                 The page being UNCOVERED. Contact shadow when the leaf is low;
//                 fades to ~0 by 90° (only faint gutter left).
//
//   covered(lay)  LAY phase 90°→180°. lay = lay progress (0 = vertical … 1 = flat).
//                 The page being COVERED. Grows + projects farther as the leaf
//                 nears flat (strongest just before contact), then the leaf
//                 occludes it — a short tail fade guarantees no opacity "pop".
//
// Both return { opacity, background } you assign straight onto a shade layer.
// At ~90° (p1→1 / lay→0) both collapse to almost nothing → minimal & symmetric.
// =====================================================================
window.PageShadow = (function () {
  const MAXA = 0.78;                                   // darkest a real (black) shadow gets
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smoothstep = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

  // ---- RAMP CURVES (explicit exponents) -----------------------------------
  // How fast the COVERED shadow darkens vs. lay progress (x: 0 vertical → 1 flat).
  // New explicit labels:  linear = x · x2 = x^2 · x2.5 = x^2.5 · x3 = x^3
  // Legacy labels kept as aliases so a saved POR keeps working:
  //   late = x^2.5 (== x2.5) · later = x^3.5 · latest = x^5
  function ramp(x, mode) {
    x = clamp01(x);
    switch (mode) {
      case 'linear': return x;
      case 'x2':     return x * x;
      case 'x3':     return x * x * x;
      case 'later':  return Math.pow(x, 3.5);          // legacy (steeper than x^3)
      case 'latest': return Math.pow(x, 5);            // legacy (steepest)
      case 'x2.5':
      case 'late':                                     // legacy alias of x2.5
      default:       return Math.pow(x, 2.5);
    }
  }

  // ---- DEBUG COLOURS ------------------------------------------------------
  // Obvious translucent overlays to PROVE the shadow is on the right layer and
  // responding to diagnostics. blue = revealed · red = covered · purple = gutter.
  const DBG = { revealed: '0,90,255', covered: '255,40,40', gutter: '170,0,255' };

  // A projecting band gradient: transparent → peak at `edge` → transparent.
  // The peak sits at `edge` (0..1 across the half) and projects `projW` of the
  // half OUTWARD in CSS `dir` ('to right' | 'to left' | 'to top' | 'to bottom').
  function band(dir, edge, projW, rgb) {
    const e = clamp01(edge) * 100, end = Math.min(100, e + clamp01(projW) * 100);
    return 'linear-gradient(' + dir + ', '
      + 'rgba(' + rgb + ',0) ' + Math.max(0, e - 1) + '%, '
      + 'rgba(' + rgb + ',' + MAXA + ') ' + e + '%, '
      + 'rgba(' + rgb + ',0) ' + end + '%)';
  }

  const isOn   = (o) => o && o.on !== false;
  const projW  = (o) => 0.20 + clamp01(o.proj != null ? o.proj : 0.55) * 0.7;
  const power  = (o) => (isOn(o) ? (o.strength != null ? o.strength : 0.4) : 0);
  // Softness 0..1 → CSS blur px for the shade layer (caller applies as filter).
  function blurPx(o) { return (o && o.blur != null ? clamp01(o.blur) : 0) * 14; }

  // REVEALED page under a LIFTING leaf. `dir` projects from the leaf's leading
  // edge toward the half's OUTER edge.
  function revealed(p1, dir, o) {
    p1 = clamp01(p1);
    const str = power(o);
    const amt = o.revealed != null ? o.revealed : 0.45;
    const rgb = o.debug ? DBG.revealed : '0,0,0';
    const edge = Math.cos(p1 * Math.PI / 2);           // 1 (flat) → 0 (vertical)
    let op = str * amt * smoothstep(1 - p1);           // strong low, ~0 by vertical
    if (o.debug && isOn(o)) op = Math.max(op, 0.62 * smoothstep(1 - p1) + 0.06);
    return { opacity: String(op), background: band(dir, edge, projW(o), rgb) };
  }

  // COVERED page under a LAYING leaf. `dir` projects from the leaf's leading
  // edge toward the half's OUTER edge.
  function covered(lay, dir, o) {
    lay = clamp01(lay);
    const shape = ramp(lay, o.curve);
    const rgb = o.debug ? DBG.covered : '0,0,0';
    let op = power(o) * shape;
    if (o.debug && isOn(o)) op = Math.max(op, 0.62 * shape + 0.06);
    if (lay > 0.9) op *= smoothstep((1 - lay) / 0.1);  // tail fade → no pop at contact
    return { opacity: String(op), background: band(dir, lay, projW(o), rgb) };
  }

  return { ramp, band, revealed, covered, blurPx, isOn, MAXA, DBG, smoothstep };
})();
