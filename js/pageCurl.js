// =====================================================================
// pageCurl.js — finger-following page turn, hinged at the CENTRAL spine,
// that lifts the current page up to vertical then lays the NEXT page down
// over the other half — like a real book leaf turning all the way over.
//
// Done with TWO single-faced half-leaves (no mirrored back-faces):
//   • leaf1 = the current half you're turning. Lifts 0°→90° (p: 0→0.5).
//   • leaf2 = the next page's half it lays onto. Falls 90°→0° (p: 0.5→1),
//     with an ease-out "gravity" landing, covering the held current half.
//   • underneath = the next spread (revealed as leaf1 lifts off).
// Plus a soft-curl shade, a leading-edge sheen, page-edge shadow, and a
// cast shadow along the spine. Content is a live DOM clone (text + image
// turn with the page). Falls back to an instant flip if anything fails.
//
// Driven by touch/mouse handlers bound on .page-area, plus animate() for
// arrow keys.
// =====================================================================
window.PageCurl = (function () {
  let cfg = null, animating = false, g = null, finishNow = null;
  const COMMIT = 0.35, FLICK = 0.4, START = 8, SENS = 0.6;   // SENS<1 = more responsive

  function init(c) { cfg = c; }
  function point(e) {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
  }

  function start(e, areaEl) {
    if (animating && finishNow) finishNow();   // snap the previous turn done so this one can start immediately
    if (animating || g || !areaEl || !cfg) return;
    // Only bail on real form fields — NOT buttons/links. The toolbox page is mostly
    // buttons; swiping over one must still turn the page (a tap = no movement, so the
    // turn never starts and the click still fires). This is the iOS two-swipe fix.
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const p = point(e);
    g = { area: areaEl, x0: p.x, y0: p.y, t0: Date.now(), axis: cfg.isPortrait() ? 'y' : 'x', started: false };
    if (e.type === 'mousedown') {
      g.mm = (ev) => move(ev); g.mu = (ev) => end(ev);
      document.addEventListener('mousemove', g.mm); document.addEventListener('mouseup', g.mu);
    }
  }

  function move(e) {
    if (!g || animating) return;
    const p = point(e);
    const dx = p.x - g.x0, dy = p.y - g.y0;
    const primary = g.axis === 'x' ? dx : dy, cross = g.axis === 'x' ? dy : dx;
    if (!g.started) {
      if (Math.abs(primary) < START || Math.abs(cross) > Math.abs(primary)) return;
      g.forward = primary < 0;
      // The app can veto a finger-follow turn (e.g. the close, which must be a
      // triggered animation — finger-following it swaps the page mid-touch and
      // freezes iOS). beforeTurn returning false aborts; the app does the rest.
      if (cfg.beforeTurn && cfg.beforeTurn(g.forward) === false) { cleanup(); return; }
      if (!(g.forward ? cfg.canNext() : cfg.canPrev())) { cleanup(); return; }
      g.started = true;
      g.dim = g.axis === 'x' ? g.area.clientWidth : g.area.clientHeight;
      if (!safeBegin()) { commitInstant(); return; }
    }
    if (e.cancelable) e.preventDefault();
    const now = Date.now();
    g.speed = (Math.abs(primary) - (g.last || 0)) / Math.max(1, now - (g.lastT || g.t0));
    g.last = Math.abs(primary); g.lastT = now;
    g.prog = Math.max(0, Math.min(1, Math.abs(primary) / (g.dim * SENS)));
    apply(g.prog);
  }

  function end() {
    if (!g || animating) return;
    if (!g.started) { if (cfg && cfg.onTap) cfg.onTap(); cleanup(); return; }
    if (!g.wrap) { cleanup(); return; }
    finish(g.prog > COMMIT || (g.speed || 0) > FLICK);
  }

  // destOverride: land on a specific page instead of ±1 (used to close the book
  // straight from a deep page to the cover, with the current page as the leaf).
  function animate(forward, destOverride) {
    if (animating && finishNow) finishNow();   // snap previous → instant, so rapid arrow presses chain smoothly
    if (animating || g || !cfg) return;
    const area = document.querySelector('.page-area');
    if (!area) { forward ? cfg.goNext() : cfg.goPrev(); return; }
    if (!(forward ? cfg.canNext() : cfg.canPrev())) return;
    g = { area, axis: cfg.isPortrait() ? 'y' : 'x', forward, started: true, prog: 0, destOverride: (destOverride == null ? null : destOverride) };
    if (!safeBegin()) { commitInstant(); return; }
    finish(true);
  }

  function safeBegin() { try { begin(); return true; } catch (e) { console.warn('curl begin failed', e); return false; } }
  function commitInstant() { cfg.setIndex(g.destOverride != null ? g.destOverride : cfg.index() + (g.forward ? 1 : -1)); cleanup(); }

  // geometry for one half (wrap-relative): box, clone offset, spine origin, rotation
  function halfGeom(side, W, H) {
    if (side === 'right')  return { box: [W / 2, 0, W / 2, H], off: [-W / 2, 0], origin: '0% 50%',   rot: a => 'rotateY(' + (-a) + 'deg)', outer: 'right' };
    if (side === 'left')   return { box: [0, 0, W / 2, H],     off: [0, 0],      origin: '100% 50%', rot: a => 'rotateY(' + a + 'deg)',    outer: 'left' };
    if (side === 'bottom') return { box: [0, H / 2, W, H / 2], off: [0, -H / 2], origin: '50% 0%',   rot: a => 'rotateX(' + a + 'deg)',    outer: 'bottom' };
    return                        { box: [0, 0, W, H / 2],     off: [0, 0],      origin: '50% 100%', rot: a => 'rotateX(' + (-a) + 'deg)', outer: 'top' };
  }

  function makeHalf(side, src, W, H) {
    const gm = halfGeom(side, W, H);
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute', left: gm.box[0] + 'px', top: gm.box[1] + 'px', width: gm.box[2] + 'px', height: gm.box[3] + 'px',
      overflow: 'hidden', backfaceVisibility: 'hidden', transformOrigin: gm.origin, willChange: 'transform',
    });
    const clone = src.cloneNode(true);
    clone.classList.add('pc-clone');   // suppresses the page-edge lines + crease on the moving leaf
    Object.assign(clone.style, { position: 'absolute', left: gm.off[0] + 'px', top: gm.off[1] + 'px', width: W + 'px', height: H + 'px', margin: 0 });
    el.appendChild(clone);
    return { el, gm, setAngle(a) { el.style.transform = gm.rot(a); } };
  }

  function begin() {
    g.origIndex = cfg.index();
    g.destIndex = (g.destOverride != null) ? g.destOverride : g.origIndex + (g.forward ? 1 : -1);
    const r = g.area.getBoundingClientRect(); const W = r.width, H = r.height;
    const horiz = g.axis === 'x';
    g.turnSide = horiz ? (g.forward ? 'right' : 'left') : (g.forward ? 'bottom' : 'top');
    g.laySide  = horiz ? (g.forward ? 'left' : 'right') : (g.forward ? 'top' : 'bottom');
    // geometry for the edge-following + gutter layers (screen coords along the turn axis)
    g.horiz = horiz; g.W = W; g.H = H;
    g.axisLen = horiz ? W : H; g.center = g.axisLen / 2; g.half = g.axisLen / 2;
    const sideSign = (s) => (s === 'right' || s === 'bottom') ? 1 : -1;
    g.turnSign = sideSign(g.turnSide); g.laySign = sideSign(g.laySide);
    const srcCur = g.area.querySelector('.book-page'); if (!srcCur) throw new Error('no page');

    g.wrap = document.createElement('div');
    Object.assign(g.wrap.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: W + 'px', height: H + 'px', perspective: '1900px', pointerEvents: 'none', zIndex: 46 });
    document.body.appendChild(g.wrap);

    // cast-shadow config — the SHARED model (js/pageShadow.js) owns the physics.
    // We just pass the diagnostics through; geometry (dirs/layers) is set below.
    g.sh = cfg.pageShadow ? cfg.pageShadow() : { on: false };

    // held current page on the side we lay onto — shown (beneath leaf2) in the
    // exposed strip during the lay phase. Receives the edge shadow there.
    g.static = makeHalf(g.laySide, srcCur, W, H);
    g.static.el.style.zIndex = '1';
    g.wrap.appendChild(g.static.el);

    // leaf1 = the current half we lift away
    g.leaf1 = makeHalf(g.turnSide, srcCur, W, H);
    g.leaf1.el.style.zIndex = '4';
    g.wrap.appendChild(g.leaf1.el);

    // EDGE shadow (soft, one-sided, trails the edge onto the page beneath) + the
    // thin page-edge LINE. Both ride the moving edge; drawn on TOP (never on the
    // turning leaf — the shadow only ever sits on the exposed side of the line).
    g.edgeShadow = document.createElement('div');
    Object.assign(g.edgeShadow.style, { position: 'absolute', zIndex: '8', pointerEvents: 'none', opacity: 0 });
    g.wrap.appendChild(g.edgeShadow);
    g.edgeLine = document.createElement('div');
    Object.assign(g.edgeLine.style, { position: 'absolute', zIndex: '9', pointerEvents: 'none', opacity: 0, background: 'rgba(110,110,110,0.55)' });
    g.wrap.appendChild(g.edgeLine);

    cfg.setIndex(g.destIndex);   // next spread renders live underneath
    cfg.afterRender(() => {
      if (!g) return;
      const srcNext = g.area.querySelector('.book-page'); if (!srcNext) return;
      g.leaf2 = makeHalf(g.laySide, srcNext, W, H);   // next page's half, lays down
      g.leaf2.el.style.zIndex = '3'; g.leaf2.el.style.opacity = '0';
      g.wrap.appendChild(g.leaf2.el);
      apply(g.prog || 0);
    });
    apply(0);
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 2.2); }

  // projected screen position (area-relative, along the turn axis) of a leaf's
  // free edge at `angFromFlat`° on `sign` side — matches the wrap's CSS perspective
  // so shadows line up with the VISIBLE (foreshortened) edge, not the flat one.
  function projEdge(angFromFlat, sign) {
    const rad = angFromFlat * Math.PI / 180, PERSP = 1900, zd = g.half * Math.sin(rad);
    let pos = g.center + sign * g.half * Math.cos(rad);
    return g.center + (pos - g.center) * PERSP / (PERSP - zd);
  }

  function apply(p) {
    if (!g || !g.leaf1) return;
    const PS = window.PageShadow, sh = g.sh;
    const master = PS ? PS.masterOn(sh) : false;
    // leaf1 lifts 0→90 over the first half; leaf2 lays 90→0 over the second.
    const p1 = Math.min(1, p / 0.5), a1 = p1 * 90;
    g.leaf1.setAngle(a1);
    g.leaf1.el.style.opacity = p < 0.5 ? 1 : 0;
    g.leaf1.el.style.boxShadow = master ? '0 0 ' + (5 + p1 * 16) + 'px rgba(0,0,0,' + (0.06 + p1 * 0.14) + ')' : 'none';
    let a2 = 90;
    if (g.leaf2) {
      const p2 = Math.max(0, Math.min(1, (p - 0.5) / 0.5)), p2e = easeOut(p2); a2 = (1 - p2e) * 90;
      g.leaf2.setAngle(a2);
      g.leaf2.el.style.opacity = p >= 0.5 ? 1 : 0;
      g.leaf2.el.style.boxShadow = master ? '0 0 ' + (5 + (1 - p2e) * 16) + 'px rgba(0,0,0,' + (0.06 + (1 - p2e) * 0.14) + ')' : 'none';
    }

    // ---- EDGE-FOLLOWING: page-edge LINE + one-sided trailing SHADOW ----------
    if (g.edgeLine && PS) {
      // Moving edge: leaf1 while lifting (p<0.5), leaf2 while laying (p>=0.5).
      // angle180 in the shared 0..180 model; movingSign locates the edge on its side.
      const movingSign = p < 0.5 ? g.turnSign : g.laySign;
      const angFromFlat = p < 0.5 ? a1 : a2;
      const angle180 = p < 0.5 ? a1 : 180 - a2;
      const pos = projEdge(angFromFlat, movingSign);
      // Shadow projects OUTWARD from the spine → flips sides at 90° automatically.
      const outSign = pos >= g.center ? 1 : -1;
      const outerPos = g.center + outSign * g.half;                 // page edge on that side
      let reach = PS.shadowReachPx(angle180, sh, g.half);
      reach = Math.max(0, Math.min(reach, Math.abs(outerPos - pos)));  // stay on the exposed strip
      const op = PS.shadowOpacity(angle180, sh);
      const soft = PS.softPx(sh);
      edgeStrip(g.edgeShadow, pos, outSign, reach, g.horiz, g.W, g.H);
      g.edgeShadow.style.background = PS.shadowGradient(
        g.horiz ? (outSign > 0 ? 'to right' : 'to left') : (outSign > 0 ? 'to bottom' : 'to top'), sh);
      g.edgeShadow.style.opacity = String(op);
      g.edgeShadow.style.filter = soft ? 'blur(' + soft + 'px)' : '';
      // the thin page-edge line, centred on the edge
      const lw = 1.6;
      if (g.horiz) { g.edgeLine.style.left = (pos - lw / 2) + 'px'; g.edgeLine.style.width = lw + 'px'; g.edgeLine.style.top = '0'; g.edgeLine.style.height = g.H + 'px'; }
      else { g.edgeLine.style.top = (pos - lw / 2) + 'px'; g.edgeLine.style.height = lw + 'px'; g.edgeLine.style.left = '0'; g.edgeLine.style.width = g.W + 'px'; }
      g.edgeLine.style.opacity = String(PS.lineOpacity(angle180, sh));
    }
  }

  // position/size a shadow strip that starts at the edge `pos` and reaches
  // `reach` px outward in `outSign`, spanning the cross-axis.
  function edgeStrip(el, pos, outSign, reach, horiz, W, H) {
    if (horiz) {
      el.style.top = '0'; el.style.height = H + 'px';
      el.style.left = (outSign > 0 ? pos : pos - reach) + 'px'; el.style.width = reach + 'px';
    } else {
      el.style.left = '0'; el.style.width = W + 'px';
      el.style.top = (outSign > 0 ? pos : pos - reach) + 'px'; el.style.height = reach + 'px';
    }
  }

  function finish(commit) {
    animating = true;
    const from = g.prog || 0, to = commit ? 1 : 0, dur = 600, t0 = performance.now();   // finishNow() still lets rapid turns chain

    const dest = g.destIndex, orig = g.origIndex;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const done = () => {
      if (!commit) cfg.setIndex(orig);
      cleanup(); animating = false; finishNow = null;
      if (cfg.afterTurn) cfg.afterTurn(commit ? dest : orig);   // let the app settle (e.g. close-book slide)
    };
    // Lets the NEXT swipe snap this one to its end instantly (no "lull" between turns).
    finishNow = () => { apply(to); done(); };
    const step = (now) => {
      if (!animating) return;
      const k = Math.min(1, (now - t0) / dur);
      apply(from + (to - from) * ease(k));
      if (k < 1) { requestAnimationFrame(step); return; }
      done();
    };
    requestAnimationFrame(step);
  }

  function cleanup() {
    if (g) {
      if (g.wrap && g.wrap.parentNode) g.wrap.parentNode.removeChild(g.wrap);
      if (g.mm) { document.removeEventListener('mousemove', g.mm); document.removeEventListener('mouseup', g.mu); }
    }
    g = null;
  }

  return { init, start, move, end, animate };
})();
