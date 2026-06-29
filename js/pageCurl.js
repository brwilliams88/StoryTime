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

  function makeHalf(side, src, W, H, rotating, wantGutter) {
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
    // direction from the SPINE (inner edge) toward the OUTER edge — used to build the
    // cast-shadow gradient (dark at the spine, fading/projecting toward the outer edge).
    const outerDir = 'to ' + gm.outer;
    let gutter = null;
    if (wantGutter) {
      // The cast shadow the FALLING leaf throws on this (held/beneath) page. z-index
      // ABOVE the picture (.image-frame is z-index:1) so it lands on the image, not
      // just the blurred letterbox. Styled live in apply().
      gutter = document.createElement('div');
      Object.assign(gutter.style, { position: 'absolute', inset: 0, zIndex: '8', pointerEvents: 'none', opacity: 0 });
      el.appendChild(gutter);
    }
    return { el, gm, gutter, outerDir, setAngle(a) { el.style.transform = gm.rot(a); } };
  }

  function begin() {
    g.origIndex = cfg.index();
    g.destIndex = (g.destOverride != null) ? g.destOverride : g.origIndex + (g.forward ? 1 : -1);
    const r = g.area.getBoundingClientRect(); const W = r.width, H = r.height;
    const horiz = g.axis === 'x';
    g.turnSide = horiz ? (g.forward ? 'right' : 'left') : (g.forward ? 'bottom' : 'top');
    g.laySide  = horiz ? (g.forward ? 'left' : 'right') : (g.forward ? 'top' : 'bottom');
    const srcCur = g.area.querySelector('.book-page'); if (!srcCur) throw new Error('no page');

    g.wrap = document.createElement('div');
    Object.assign(g.wrap.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: W + 'px', height: H + 'px', perspective: '1900px', pointerEvents: 'none', zIndex: 46 });
    document.body.appendChild(g.wrap);

    // cast-shadow config — the SHARED model (js/pageShadow.js) owns the physics.
    // We just pass the diagnostics through; geometry (dirs/layers) is set below.
    g.sh = cfg.pageShadow ? cfg.pageShadow() : { on: false };

    // held current page on the side we lay onto (under leaf2). Its gutter carries
    // the cast shadow leaf2 throws on it (the page being COVERED), visible in the
    // shrinking gap ahead of leaf2's edge.
    g.static = makeHalf(g.laySide, srcCur, W, H, false, true);
    g.static.el.style.zIndex = '1';
    g.wrap.appendChild(g.static.el);

    // (No crease here — the fixed .book-crease above this overlay carries the
    // light, symmetric gutter at 90° on its own.)

    // Cast shadow on the page being REVEALED (under leaf1, seen through the wrap).
    // Fades as leaf1 lifts away. Sits over the live next-spread underneath.
    {
      const gm = halfGeom(g.turnSide, W, H);
      g.revealShade = document.createElement('div');
      Object.assign(g.revealShade.style, { position: 'absolute', left: gm.box[0] + 'px', top: gm.box[1] + 'px', width: gm.box[2] + 'px', height: gm.box[3] + 'px', zIndex: '2', pointerEvents: 'none', opacity: 0 });
      g.revealOuterDir = 'to ' + gm.outer;
      g.wrap.appendChild(g.revealShade);
    }

    // leaf1 = the current half we lift away
    g.leaf1 = makeHalf(g.turnSide, srcCur, W, H, true);
    g.leaf1.el.style.zIndex = '4';
    g.wrap.appendChild(g.leaf1.el);

    cfg.setIndex(g.destIndex);   // next spread renders live underneath
    cfg.afterRender(() => {
      if (!g) return;
      const srcNext = g.area.querySelector('.book-page'); if (!srcNext) return;
      g.leaf2 = makeHalf(g.laySide, srcNext, W, H, true);   // next page's half, lays down (no shadow ON it — shadow is on the page beneath)
      g.leaf2.el.style.zIndex = '3'; g.leaf2.el.style.opacity = '0';
      g.wrap.appendChild(g.leaf2.el);
      apply(g.prog || 0);
    });
    apply(0);
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 2.2); }

  function apply(p) {
    if (!g || !g.leaf1) return;
    const PS = window.PageShadow, sh = g.sh;
    const blur = PS ? PS.blurPx(sh) : 0;
    // leaf1 lifts 0→90 over the first half (its top face is lit — no shadow ON it)
    const p1 = Math.min(1, p / 0.5), a1 = p1 * 90;
    g.leaf1.setAngle(a1);
    g.leaf1.el.style.opacity = p < 0.5 ? 1 : 0;
    g.leaf1.el.style.boxShadow = '0 0 ' + (5 + p1 * 16) + 'px rgba(0,0,0,' + (0.06 + p1 * 0.14) + ')';

    // Cast shadow lives on the page BENEATH the turning leaf (shared PageShadow
    // model). Never on the leaf itself — its lit top face carries no shadow.
    // REVEALED page (under leaf1): strong while leaf1 is low, fades by vertical.
    if (g.revealShade && PS) {
      const rs = PS.revealed(p1, g.revealOuterDir, sh);
      g.revealShade.style.opacity = rs.opacity;
      g.revealShade.style.background = rs.background;
      g.revealShade.style.filter = blur ? 'blur(' + blur + 'px)' : '';
    }

    // leaf2 lays 90→0 over the second half (its lit top face carries no shadow)
    let lay2 = 0;
    if (g.leaf2) {
      const p2 = Math.max(0, Math.min(1, (p - 0.5) / 0.5)), p2e = easeOut(p2), a2 = (1 - p2e) * 90;
      lay2 = p2e;
      g.leaf2.setAngle(a2);
      g.leaf2.el.style.opacity = p >= 0.5 ? 1 : 0;
      g.leaf2.el.style.boxShadow = '0 0 ' + (5 + (1 - p2e) * 16) + 'px rgba(0,0,0,' + (0.06 + (1 - p2e) * 0.14) + ')';
    }
    // COVERED page (static, under leaf2): grows as leaf2 lays, strongest just
    // before leaf2 covers it (then occluded — tail fade prevents any pop).
    if (g.static && g.static.gutter && PS) {
      const cs = PS.covered(lay2, g.static.outerDir, sh);
      g.static.gutter.style.opacity = cs.opacity;
      g.static.gutter.style.background = cs.background;
      g.static.gutter.style.filter = blur ? 'blur(' + blur + 'px)' : '';
    }
  }

  function finish(commit) {
    animating = true;
    const from = g.prog || 0, to = commit ? 1 : 0, dur = 340, t0 = performance.now();   // snappier; rapid turns feel responsive
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
