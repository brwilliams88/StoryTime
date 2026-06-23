// =====================================================================
// pageCurl.js — finger-following page turn, hinged at the CENTRAL spine.
//
// The reading view is an open-book spread (image | crease | text). A turn
// behaves like a real book leaf: the page on the side you swipe FROM pivots
// about the centre spine and lifts away, revealing the next spread beneath.
// The other half is held showing the current page until the turn commits,
// then cross-fades to the next page. Content is a live DOM clone, so the
// text + image turn with the page. A shading "curl" softens the cardboard feel.
//
// Driven by touch/mouse handlers the Vue template binds onto .page-area, plus
// PageCurl.animate(forward) for arrow keys. Falls back to an instant page flip
// if anything goes wrong, so navigation never breaks.
// =====================================================================
window.PageCurl = (function () {
  let cfg = null, animating = false, g = null;
  const MAX = 92, COMMIT = 0.38, FLICK = 0.4, START = 10;

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
    if (e.type === 'mousedown') {
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
      g.forward = primary < 0;
      if (!(g.forward ? cfg.canNext() : cfg.canPrev())) { cleanup(); return; }
      g.started = true;
      g.dim = g.axis === 'x' ? g.area.clientWidth : g.area.clientHeight;
      if (!safeBegin()) { commitInstant(); return; }
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
    if (!g.started) { if (cfg && cfg.onTap) cfg.onTap(); cleanup(); return; }
    if (!g.wrapT) { cleanup(); return; }   // instant path already handled
    finish(g.prog > COMMIT || (g.speed || 0) > FLICK);
  }

  // Programmatic turn (arrow keys): play the same animation, then commit.
  function animate(forward) {
    if (animating || g || !cfg) return;
    const area = document.querySelector('.page-area');
    if (!area) { forward ? cfg.goNext() : cfg.goPrev(); return; }
    if (!(forward ? cfg.canNext() : cfg.canPrev())) return;
    g = { area, axis: cfg.isPortrait() ? 'y' : 'x', forward, started: true, prog: 0 };
    if (!safeBegin()) { commitInstant(); return; }
    finish(true);
  }

  function safeBegin() { try { begin(); return true; } catch (e) { return false; } }
  function commitInstant() { cfg.setIndex(cfg.index() + (g.forward ? 1 : -1)); cleanup(); }

  // ---- build the two half-overlays (turning leaf + held static half) ----
  function begin() {
    g.origIndex = cfg.index();
    g.destIndex = g.origIndex + (g.forward ? 1 : -1);
    const r = g.area.getBoundingClientRect();
    const W = r.width, H = r.height;
    const horiz = g.axis === 'x';
    g.side = horiz ? (g.forward ? 'right' : 'left') : (g.forward ? 'bottom' : 'top');
    const src = g.area.querySelector('.book-page');
    if (!src) throw new Error('no page');

    // geometry per turning side: [wrapLeft, wrapTop, wrapW, wrapH, cloneLeft, cloneTop]
    // for the turning half, the static half, and the rotation transform.
    let tw, sw, cloneTOff, cloneSOff, rotate;
    if (g.side === 'right') {
      tw = [r.left + W / 2, r.top, W / 2, H]; cloneTOff = [-W / 2, 0];
      sw = [r.left, r.top, W / 2, H];        cloneSOff = [0, 0];
      rotate = (a) => 'rotateY(' + (-a) + 'deg)';
    } else if (g.side === 'left') {
      tw = [r.left, r.top, W / 2, H];        cloneTOff = [0, 0];
      sw = [r.left + W / 2, r.top, W / 2, H]; cloneSOff = [-W / 2, 0];
      rotate = (a) => 'rotateY(' + a + 'deg)';
    } else if (g.side === 'bottom') {
      tw = [r.left, r.top + H / 2, W, H / 2]; cloneTOff = [0, -H / 2];
      sw = [r.left, r.top, W, H / 2];         cloneSOff = [0, 0];
      rotate = (a) => 'rotateX(' + a + 'deg)';
    } else {
      tw = [r.left, r.top, W, H / 2];         cloneTOff = [0, 0];
      sw = [r.left, r.top + H / 2, W, H / 2]; cloneSOff = [0, -H / 2];
      rotate = (a) => 'rotateX(' + (-a) + 'deg)';
    }
    g.rotate = rotate;

    g.wrapS = makeWrap(sw, src, cloneSOff, W, H, false);
    g.wrapT = makeWrap(tw, src, cloneTOff, W, H, true);
    g.cloneT = g.wrapT.firstChild;
    g.shadeT = g.cloneT.lastChild;   // the shade overlay (rotates with the leaf)
    document.body.appendChild(g.wrapS);
    document.body.appendChild(g.wrapT);

    cfg.setIndex(g.destIndex);   // next spread renders live underneath
    apply(0);
  }

  function makeWrap(box, src, off, W, H, turning) {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      position: 'fixed', left: box[0] + 'px', top: box[1] + 'px',
      width: box[2] + 'px', height: box[3] + 'px',
      overflow: 'hidden', pointerEvents: 'none',
      zIndex: turning ? 46 : 45, perspective: turning ? '1600px' : 'none',
    });
    const clone = src.cloneNode(true);
    Object.assign(clone.style, {
      position: 'absolute', left: off[0] + 'px', top: off[1] + 'px',
      width: W + 'px', height: H + 'px', margin: 0,
      transformOrigin: '50% 50%', backfaceVisibility: 'hidden', willChange: 'transform',
    });
    wrap.appendChild(clone);
    if (turning) {
      const shade = document.createElement('div');
      const dir = g.side === 'right' ? 'to right' : g.side === 'left' ? 'to left'
                : g.side === 'bottom' ? 'to bottom' : 'to top';
      Object.assign(shade.style, {
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0,
        background: 'linear-gradient(' + dir + ', rgba(255,255,255,0.18), rgba(0,0,0,0) 30%, rgba(0,0,0,0.12) 70%, rgba(0,0,0,0.5))',
      });
      // shade lives OVER the clone but rotates with the wrap's child? keep it on the clone
      clone.appendChild(shade);
    }
    return wrap;
  }

  function apply(p) {
    if (!g || !g.cloneT) return;
    const a = p * MAX;
    g.cloneT.style.transform = g.rotate(a);
    g.cloneT.style.boxShadow = '0 0 ' + (6 + p * 26) + 'px rgba(0,0,0,' + (0.1 + p * 0.3) + ')';
    if (g.shadeT) g.shadeT.style.opacity = Math.min(0.7, p * 0.85);
    g.cloneT.style.opacity = p < 0.82 ? 1 : Math.max(0, 1 - (p - 0.82) / 0.18);
  }

  function finish(commit) {
    animating = true;
    const from = g.prog || 0, to = commit ? 1 : 0, dur = 250, t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const p = from + (to - from) * ease(k);
      apply(p);
      if (commit && g.wrapS) g.wrapS.style.opacity = String(Math.max(0, 1 - ease(k) * 1.1));
      if (k < 1) { requestAnimationFrame(step); return; }
      if (!commit) cfg.setIndex(g.origIndex);   // spring back to original page
      cleanup();
      animating = false;
    };
    requestAnimationFrame(step);
  }

  function cleanup() {
    if (g) {
      if (g.wrapT && g.wrapT.parentNode) g.wrapT.parentNode.removeChild(g.wrapT);
      if (g.wrapS && g.wrapS.parentNode) g.wrapS.parentNode.removeChild(g.wrapS);
      if (g.mm) { document.removeEventListener('mousemove', g.mm); document.removeEventListener('mouseup', g.mu); }
    }
    g = null;
  }

  return { init, start, move, end, animate };
})();
