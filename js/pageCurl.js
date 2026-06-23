// =====================================================================
// pageCurl.js — finger-following page-turn for the reading view.
//
// How it works:
//   • When a reading page settles, we snapshot it to a canvas (html2canvas).
//   • On a drag, we lay a canvas overlay over the page area showing that
//     snapshot, flip the live page underneath to the DESTINATION page (hidden
//     behind the overlay), then peel/curl the snapshot away following the
//     finger — revealing the destination beneath. Release past a threshold (or
//     a flick) commits; otherwise it springs back.
//   • Landscape peels left/right; portrait peels up/down — same feel, swapped
//     axis. The page CONTENT moves with the curl because it's the real bitmap.
//
// Degrades gracefully: if html2canvas is missing or a snapshot isn't ready,
// the same drag just does a threshold page-flip with no curl. Navigation
// always works.
// =====================================================================
window.PageCurl = (function () {
  let cfg = null;            // wiring from the Vue app
  let areaEl = null;         // the .page-area element
  let leaf = null;           // { canvas, w, h, index } — snapshot of current page
  let priming = false;
  let overlay = null, octx = null, odpr = 1;
  let g = null;              // active gesture state
  let animating = false;

  const START = 12;          // px before a drag is considered a turn
  const COMMIT = 0.4;        // fraction of the page to commit a turn
  const FLICK = 0.45;        // px/ms release speed that commits regardless

  function init(c) { cfg = c; }

  function attach(el) {
    if (areaEl) detach();
    areaEl = el;
    if (!areaEl) return;
    areaEl.style.touchAction = 'none';    // we own the drag in both orientations
    areaEl.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    prime();
  }

  function detach() {
    if (!areaEl) return;
    areaEl.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    removeOverlay();
    areaEl = null; leaf = null; g = null;
  }

  // Snapshot the current page so a turn can start instantly.
  async function prime() {
    if (!areaEl || priming || typeof html2canvas === 'undefined') return;
    const page = areaEl.querySelector('.book-page');
    if (!page) return;
    priming = true;
    try {
      const rect = page.getBoundingClientRect();
      const scale = Math.min(2, window.devicePixelRatio || 1);
      const canvas = await html2canvas(page, { backgroundColor: null, scale, logging: false, useCORS: true });
      leaf = { canvas, w: rect.width, h: rect.height, index: cfg.index() };
    } catch (e) {
      leaf = null;
    }
    priming = false;
  }

  function onDown(e) {
    if (animating || g || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // ignore drags that start on a button/link (let them be tapped)
    if (e.target.closest('button, a, .inspect-btn')) return;
    g = {
      x0: e.clientX, y0: e.clientY, t0: Date.now(),
      axis: cfg.isPortrait() ? 'y' : 'x',
      started: false, fallback: false, forward: false, prog: 0, last: 0, lastT: Date.now(),
    };
  }

  function onMove(e) {
    if (!g) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    const primary = g.axis === 'x' ? dx : dy;
    const cross = g.axis === 'x' ? dy : dx;

    if (!g.started) {
      if (Math.abs(primary) < START || Math.abs(cross) > Math.abs(primary)) return;
      g.forward = primary < 0;                    // drag left/up = next
      const canGo = g.forward ? cfg.canNext() : cfg.canPrev();
      if (!canGo) { g = null; return; }
      g.started = true;
      if (!leaf || leaf.index !== cfg.index() || typeof html2canvas === 'undefined') {
        g.fallback = true;                        // no curl this time, just track
      } else {
        beginCurl();
      }
    }
    if (g.fallback) { g.primary = primary; return; }
    e.preventDefault();
    const dim = g.axis === 'x' ? g.W : g.H;
    const now = Date.now();
    g.speed = (Math.abs(primary) - g.last) / Math.max(1, now - g.lastT);
    g.last = Math.abs(primary); g.lastT = now;
    g.prog = Math.max(0, Math.min(1, Math.abs(primary) / dim));
    renderCurl(g.prog);
  }

  function onUp() {
    if (!g) return;
    if (g.fallback) {
      const dim = g.axis === 'x' ? (areaEl ? areaEl.clientWidth : 300) : (areaEl ? areaEl.clientHeight : 500);
      if (Math.abs(g.primary || 0) > Math.min(110, dim * 0.28)) {
        g.forward ? cfg.goNext() : cfg.goPrev();
      }
      g = null;
      return;
    }
    if (!g.started) { g = null; return; }
    const commit = g.prog > COMMIT || (g.speed || 0) > FLICK;
    finishCurl(commit);
  }

  // ---- the curl overlay ----
  function beginCurl() {
    g.origIndex = cfg.index();
    g.destIndex = g.origIndex + (g.forward ? 1 : -1);
    makeOverlay();
    renderCurl(0);
    cfg.setIndex(g.destIndex);   // destination renders live underneath the overlay
  }

  function makeOverlay() {
    const r = areaEl.getBoundingClientRect();
    g.W = r.width; g.H = r.height;
    odpr = Math.min(2, window.devicePixelRatio || 1);
    overlay = document.createElement('canvas');
    overlay.width = Math.round(r.width * odpr);
    overlay.height = Math.round(r.height * odpr);
    Object.assign(overlay.style, {
      position: 'fixed', left: r.left + 'px', top: r.top + 'px',
      width: r.width + 'px', height: r.height + 'px',
      zIndex: 45, pointerEvents: 'none',
    });
    // appended to <body> so Vue re-rendering the page underneath can't disturb it
    document.body.appendChild(overlay);
    octx = overlay.getContext('2d');
    octx.scale(odpr, odpr);
  }

  function removeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null; octx = null;
  }

  // Draw the peeling page: the still-flat part of the snapshot, a curl shadow
  // gradient near the fold (page bending up), a bright fold highlight, and a
  // soft cast shadow on the revealed destination just past the fold.
  function renderCurl(prog) {
    if (!octx || !leaf) return;
    const W = g.W, H = g.H, c = leaf.canvas;
    const sx = c.width / W, sy = c.height / H;
    octx.clearRect(0, 0, W, H);
    const horizontal = g.axis === 'x';
    const len = horizontal ? W : H;
    const fold = g.forward ? len * (1 - prog) : len * prog;   // position of the fold line

    octx.save();
    if (horizontal) {
      if (g.forward) {
        // flat part = [0, fold]; reveal to the right
        if (fold > 0) octx.drawImage(c, 0, 0, fold * sx, c.height, 0, 0, fold, H);
        paintFold(fold, H, true, true);
      } else {
        // flat part = [fold, W]; reveal to the left
        if (fold < W) octx.drawImage(c, fold * sx, 0, (W - fold) * sx, c.height, fold, 0, W - fold, H);
        paintFold(fold, H, true, false);
      }
    } else {
      if (g.forward) {
        if (fold > 0) octx.drawImage(c, 0, 0, c.width, fold * sy, 0, 0, W, fold);
        paintFold(fold, W, false, true);
      } else {
        if (fold < H) octx.drawImage(c, 0, fold * sy, c.width, (H - fold) * sy, 0, fold, W, H - fold);
        paintFold(fold, W, false, false);
      }
    }
    octx.restore();
  }

  // fold = position along the turn axis; span = the other dimension;
  // horizontal = axis is x; toward = forward (true) peels toward the start edge.
  function paintFold(fold, span, horizontal, forward) {
    const lipW = 26, shadowW = 34;
    const dirIn = forward ? -1 : 1;     // from the fold, the flat page lies this way
    const dirOut = -dirIn;              // and the revealed side lies this way

    octx.save();
    // 1) curl shadow on the flat page, darkening toward the fold (it's bending up)
    let g1;
    if (horizontal) g1 = octx.createLinearGradient(fold + dirIn * lipW, 0, fold, 0);
    else g1 = octx.createLinearGradient(0, fold + dirIn * lipW, 0, fold);
    g1.addColorStop(0, 'rgba(0,0,0,0)');
    g1.addColorStop(1, 'rgba(0,0,0,0.22)');
    octx.fillStyle = g1;
    if (horizontal) octx.fillRect(Math.min(fold, fold + dirIn * lipW), 0, lipW, span);
    else octx.fillRect(0, Math.min(fold, fold + dirIn * lipW), span, lipW);

    // 2) bright highlight right at the fold (paper catching light as it bends)
    octx.fillStyle = 'rgba(255,255,255,0.55)';
    if (horizontal) octx.fillRect(fold - 1, 0, 2, span);
    else octx.fillRect(0, fold - 1, span, 2);

    // 3) soft cast shadow on the revealed destination just past the fold
    let g2;
    if (horizontal) g2 = octx.createLinearGradient(fold, 0, fold + dirOut * shadowW, 0);
    else g2 = octx.createLinearGradient(0, fold, 0, fold + dirOut * shadowW);
    g2.addColorStop(0, 'rgba(0,0,0,0.28)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    octx.fillStyle = g2;
    if (horizontal) octx.fillRect(Math.min(fold, fold + dirOut * shadowW), 0, shadowW, span);
    else octx.fillRect(0, Math.min(fold, fold + dirOut * shadowW), span, shadowW);
    octx.restore();
  }

  function finishCurl(commit) {
    animating = true;
    const from = g.prog;
    const to = commit ? 1 : 0;
    const dur = 240;
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const p = from + (to - from) * ease(k);
      renderCurl(p);
      if (k < 1) { requestAnimationFrame(step); return; }
      if (!commit) cfg.setIndex(g.origIndex);   // spring back: restore original page
      removeOverlay();
      animating = false; g = null;
      prime();   // snapshot the now-current page for the next turn
    };
    requestAnimationFrame(step);
  }

  return { init, attach, detach, prime, isAttached: () => !!areaEl };
})();
