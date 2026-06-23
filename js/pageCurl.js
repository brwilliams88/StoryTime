// =====================================================================
// pageCurl.js — finger-following page turn for the reading view.
//
// Approach (robust, no rasterizing):
//   • On drag, we CLONE the current page's real DOM (its text + images) into a
//     fixed overlay — the "leaf" — and flip the live page underneath to the
//     destination. As the finger moves, the leaf rotates about the spine edge,
//     so the page (and all its content) turns with your finger, revealing the
//     next page beneath. Release past the middle (or a flick) commits; else it
//     springs back. Landscape turns left/right, portrait up/down.
//
//   • Driven by touch/mouse handlers the Vue template binds straight onto the
//     page area (no attach timing to get wrong). Falls back to nothing harmful.
// =====================================================================
window.PageCurl = (function () {
  let cfg = null, animating = false, g = null;
  const MAX = 158, COMMIT = 0.38, FLICK = 0.4, START = 10;

  function init(c) { cfg = c; }

  function point(e) {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
  }

  function start(e, areaEl) {
    if (animating || g || !areaEl || !cfg) return;
    if (e.target.closest && e.target.closest('button, a, input, textarea, .inspect-btn')) return;
    const p = point(e);
    g = { area: areaEl, x0: p.x, y0: p.y, t0: Date.now(), axis: cfg.isPortrait() ? 'y' : 'x', started: false };
    if (e.type === 'mousedown') {   // desktop: follow the cursor on the document
      g.mm = (ev) => move(ev); g.mu = (ev) => end(ev);
      document.addEventListener('mousemove', g.mm);
      document.addEventListener('mouseup', g.mu);
    }
  }

  function move(e) {
    if (!g) return;
    const p = point(e);
    const dx = p.x - g.x0, dy = p.y - g.y0;
    const primary = g.axis === 'x' ? dx : dy;
    const cross   = g.axis === 'x' ? dy : dx;

    if (!g.started) {
      if (Math.abs(primary) < START || Math.abs(cross) > Math.abs(primary)) return;
      g.forward = primary < 0;                       // drag left/up = next page
      if (!(g.forward ? cfg.canNext() : cfg.canPrev())) { cleanup(); return; }
      g.started = true;
      g.dim = g.axis === 'x' ? g.area.clientWidth : g.area.clientHeight;
      begin();
    }
    if (e.cancelable) e.preventDefault();
    const now = Date.now();
    g.speed = (Math.abs(primary) - (g.last || 0)) / Math.max(1, now - (g.lastT || g.t0));
    g.last = Math.abs(primary); g.lastT = now;
    g.prog = Math.max(0, Math.min(1, Math.abs(primary) / g.dim));
    apply(g.prog);
  }

  function end() {
    if (!g) return;
    if (!g.started) { cleanup(); return; }
    const commit = g.prog > COMMIT || (g.speed || 0) > FLICK;
    finish(commit);
  }

  // Build the turning leaf (a clone of the live page) and reveal the
  // destination page underneath it.
  function begin() {
    g.origIndex = cfg.index();
    g.destIndex = g.origIndex + (g.forward ? 1 : -1);
    const r = g.area.getBoundingClientRect();
    const src = g.area.querySelector('.book-page');

    g.wrap = document.createElement('div');
    Object.assign(g.wrap.style, {
      position: 'fixed', left: r.left + 'px', top: r.top + 'px',
      width: r.width + 'px', height: r.height + 'px',
      zIndex: 45, pointerEvents: 'none', perspective: '1700px', overflow: 'hidden',
    });

    g.leaf = src ? src.cloneNode(true) : document.createElement('div');
    Object.assign(g.leaf.style, {
      position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', margin: 0,
      transformStyle: 'preserve-3d', willChange: 'transform, opacity', backfaceVisibility: 'hidden',
    });

    g.shade = document.createElement('div');   // darkens the leaf as it lifts
    Object.assign(g.shade.style, {
      position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0,
      background: 'linear-gradient(0deg, rgba(0,0,0,0.28), rgba(0,0,0,0) 60%)',
    });
    g.leaf.appendChild(g.shade);
    g.wrap.appendChild(g.leaf);
    document.body.appendChild(g.wrap);

    cfg.setIndex(g.destIndex);   // destination renders live, under the leaf
    apply(0);
  }

  function apply(p) {
    if (!g || !g.leaf) return;
    const a = p * MAX;
    let t, origin;
    if (g.axis === 'x') {
      if (g.forward) { origin = '0% 50%';  t = 'rotateY(' + (-a) + 'deg)'; }
      else           { origin = '100% 50%'; t = 'rotateY(' + a + 'deg)'; }
    } else {
      if (g.forward) { origin = '50% 0%';  t = 'rotateX(' + a + 'deg)'; }
      else           { origin = '50% 100%'; t = 'rotateX(' + (-a) + 'deg)'; }
    }
    g.leaf.style.transformOrigin = origin;
    g.leaf.style.transform = t;
    g.leaf.style.boxShadow = '0 0 ' + (8 + p * 28) + 'px rgba(0,0,0,' + (0.12 + p * 0.28) + ')';
    g.shade.style.opacity = Math.min(0.5, p * 0.6);
    // fade the leaf out as it passes vertical so we never see its mirrored back
    g.leaf.style.opacity = p < 0.5 ? 1 : Math.max(0, 1 - (p - 0.5) / 0.42);
  }

  function finish(commit) {
    animating = true;
    const from = g.prog || 0, to = commit ? 1 : 0, dur = 260, t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      apply(from + (to - from) * ease(k));
      if (k < 1) { requestAnimationFrame(step); return; }
      if (!commit) cfg.setIndex(g.origIndex);   // spring back to the original page
      cleanup();
      animating = false;
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

  return { init, start, move, end };
})();
