// =====================================================================
// pageShadow.js — ONE shared cast-shadow model for EVERY book transition:
//   • interior page turns          (js/pageCurl.js apply())
//   • THE END ↔ toolbox            (js/pageCurl.js via _sswUp → animate)
//   • cover open / cover close     (js/app.js _coverFxBuild apply())
//   • book close via back arrow    (same _coverFxBuild, closing=true)
//
// The PHYSICS lives here so every transition ramps, projects, softens, and
// responds to the diagnostics IDENTICALLY. Callers differ ONLY in geometry
// (which DOM layer is the turning leaf, and where its edge is on screen).
//
// ANGLE MODEL (used the same way everywhere):
//   0°   = leaf flat on the STARTING side
//   90°  = leaf vertical
//   180° = leaf flat on the DESTINATION side
//
// THREE INDEPENDENTLY-TOGGLEABLE LAYERS:
//
//   A. EDGE-FOLLOWING contact shadow  — edge(angle)
//      A soft dark strip that HUGS the moving leaf's free edge and follows it
//      across the page. Drawn ON TOP (never occluded) so it's always visible.
//      Strongest near 0°/180° (leaf close to a surface), weakest at 90°.
//      This is the primary/POR effect. debug = orange.
//
//   B. RECEIVER-PAGE physical shadow  — revealed(p1) + covered(lay)
//      The turning leaf casts onto the stationary page beneath it. Physically
//      truthful but partly self-occluded by the leaf. Secondary. debug = blue
//      (revealed) / red (covered).
//
//   C. GUTTER / crease shadow         — gutter()
//      Subtle permanent depth at the spine. Constant, independent of the turn.
//      debug = purple.
//
// Every function honours the master switch (o.on) AND its own layer switch
// (o.edgeOn / o.receiverOn / o.gutterOn). At 100% + debug each is unmistakable.
// =====================================================================
window.PageShadow = (function () {
  const MAXA = 0.82;                                   // darkest a real (black) shadow gets
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smoothstep = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

  // ---- RAMP CURVES (explicit exponents) -----------------------------------
  //   linear = x · x2 = x^2 · x2.5 = x^2.5 · x3 = x^3
  // Legacy aliases so a saved POR keeps working: late=x^2.5, later=x^3.5, latest=x^5
  function ramp(x, mode) {
    x = clamp01(x);
    switch (mode) {
      case 'linear': return x;
      case 'x2':     return x * x;
      case 'x3':     return x * x * x;
      case 'later':  return Math.pow(x, 3.5);
      case 'latest': return Math.pow(x, 5);
      case 'x2.5':
      case 'late':
      default:       return Math.pow(x, 2.5);
    }
  }

  // ---- DEBUG COLOURS ------------------------------------------------------
  const DBG = { edge: '255,138,0', revealed: '0,90,255', covered: '255,40,40', gutter: '170,0,255' };

  // ---- LAYER GATES --------------------------------------------------------
  const masterOn = (o) => !!(o && o.on !== false);
  const edgeOnF  = (o) => masterOn(o) && o.edgeOn !== false;
  const recOn    = (o) => masterOn(o) && o.receiverOn !== false;
  const gutOn    = (o) => masterOn(o) && o.gutterOn !== false;

  // A projecting band gradient: transparent → peak at `edge` → transparent.
  // Peak sits at `edge` (0..1 across the half), projecting `projW` OUTWARD in
  // CSS `dir` ('to right' | 'to left' | 'to top' | 'to bottom').
  function band(dir, edge, projW, rgb) {
    const e = clamp01(edge) * 100, end = Math.min(100, e + clamp01(projW) * 100);
    return 'linear-gradient(' + dir + ', '
      + 'rgba(' + rgb + ',0) ' + Math.max(0, e - 1) + '%, '
      + 'rgba(' + rgb + ',' + MAXA + ') ' + e + '%, '
      + 'rgba(' + rgb + ',0) ' + end + '%)';
  }

  const projW   = (o) => 0.20 + clamp01(o.proj != null ? o.proj : 0.55) * 0.7;
  const recPow  = (o) => (o.strength != null ? o.strength : 0.4);
  const blurPx  = (o) => (o && o.blur != null ? clamp01(o.blur) : 0) * 14;      // receiver softness → px

  // ===================== A. EDGE-FOLLOWING =================================
  // opacity for the edge strip at a given leaf angle (0..180).
  function edge(angleDeg, o) {
    if (!edgeOnF(o)) return 0;
    const closeness = clamp01(Math.abs(angleDeg - 90) / 90);   // 1 at flat, 0 at vertical
    const str = o.edgeStr != null ? o.edgeStr : 0.6;
    let op = str * ramp(closeness, o.curve);
    if (o.debug) op = Math.max(op, 0.65 * ramp(closeness, o.curve) + 0.08);
    return op;
  }
  // Symmetric soft strip across the strip element's OWN width (dark centre).
  function edgeGradient(dir, o) {
    const rgb = o.debug ? DBG.edge : '0,0,0';
    return 'linear-gradient(' + dir + ', rgba(' + rgb + ',0) 0%, rgba(' + rgb + ',' + MAXA + ') 50%, rgba(' + rgb + ',0) 100%)';
  }
  const edgeWidthFrac = (o) => 0.03 + clamp01(o.edgeWidth != null ? o.edgeWidth : 0.15) * 0.35;  // fraction of the half
  const edgeBlurPx    = (o) => (o && o.edgeBlur != null ? clamp01(o.edgeBlur) : 0) * 22;

  // ===================== B. RECEIVER (physical) ============================
  // REVEALED page under a LIFTING leaf. `dir` projects spine→outer. `peak` (0..1)
  // overrides where the band sits — pass the leaf's VISIBLE (projected) edge so the
  // shadow lands on the exposed strip instead of hiding under the foreshortened leaf.
  function revealed(p1, dir, o, peak) {
    p1 = clamp01(p1);
    const on = recOn(o);
    const amt = o.revealed != null ? o.revealed : 0.45;
    const rgb = o.debug ? DBG.revealed : '0,0,0';
    const e = peak != null ? clamp01(peak) : Math.cos(p1 * Math.PI / 2);  // 1 (flat) → 0 (vertical)
    let op = on ? recPow(o) * amt * smoothstep(1 - p1) : 0;
    if (o.debug && on) op = Math.max(op, 0.62 * smoothstep(1 - p1) + 0.06);
    return { opacity: String(op), background: band(dir, e, projW(o), rgb) };
  }
  // COVERED page under a LAYING leaf. `dir` projects spine→outer. `peak` (0..1) =
  // the leaf's VISIBLE (projected) edge; keeps the shadow in the exposed strip.
  function covered(lay, dir, o, peak) {
    lay = clamp01(lay);
    const on = recOn(o);
    const shape = ramp(lay, o.curve);
    const rgb = o.debug ? DBG.covered : '0,0,0';
    const e = peak != null ? clamp01(peak) : lay;
    let op = on ? recPow(o) * shape : 0;
    if (o.debug && on) op = Math.max(op, 0.62 * shape + 0.06);
    if (lay > 0.9) op *= smoothstep((1 - lay) / 0.1);  // tail fade → no pop at contact
    return { opacity: String(op), background: band(dir, e, projW(o), rgb) };
  }

  // ===================== C. GUTTER / crease ================================
  // Constant subtle depth at the spine (independent of the turn).
  function gutter(o) {
    if (!gutOn(o)) return 0;
    const str = o.gutterStr != null ? o.gutterStr : 0.3;
    return o.debug ? Math.max(str, 0.5) : str;
  }
  function gutterGradient(dir, o) {
    const rgb = o.debug ? DBG.gutter : '0,0,0';
    return 'linear-gradient(' + dir + ', rgba(' + rgb + ',0) 0%, rgba(' + rgb + ',' + MAXA + ') 50%, rgba(' + rgb + ',0) 100%)';
  }

  return {
    ramp, band, smoothstep, MAXA, DBG,
    masterOn, edgeOnF, recOn, gutOn,
    edge, edgeGradient, edgeWidthFrac, edgeBlurPx,
    revealed, covered, blurPx,
    gutter, gutterGradient,
  };
})();
