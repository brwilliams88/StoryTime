// =====================================================================
// pageCurlBend.js — EXPLORATORY "segmented geometric bend" page turn.
//
// This is an ALTERNATIVE to pageCurl.js (which is left untouched). It is
// wired up alongside the classic turn so the reader can A/B between them
// via the diagnostic toggle. Same public API as PageCurl:
//     init(cfg), start(e, areaEl), move(e), end(e), animate(forward)
//
// The idea: instead of folding the leaf as one flat plane, the turning
// half-leaf is sliced into N strips along the turn axis. Each strip is a
// clone of the page clipped to its slice, then placed by simple forward
// kinematics so the strips form a smooth CURVED arc (a cylinder-ish bend)
// that follows the finger — like real paper bowing as it turns. Two
// segmented leaves are used (same staging as the classic turn):
//   • static = the held OLD lay-side half (so it doesn't pop early)
//   • leaf1  = the turning half: lifts + curls away   (p 0 → 0.5)
//   • leaf2  = the next page's half: un-curls down     (p 0.5 → 1)
//   • underneath = the next spread (revealed as leaf1 lifts)
// Per-strip shading darkens the parts that face away; the leaf fades
// through vertical so we never see a mirrored back.
//
// Heavy by design (N DOM clones per strip) — this is to SEE what's
// possible on a phone, not necessarily the final shipping turn. All the
// feel knobs are the consts right below. NOTE: the rotateX (portrait)
// sign is a best guess and may need flipping after seeing it on a device.
// =====================================================================
window.PageCurlBend = (function () {
  let cfg = null, animating = false, g = null;

  // ---- feel knobs ----
  const N = 14;          // strips per leaf (more = smoother bend, heavier)
  const PERSP = 1700;    // perspective depth (px); smaller = more dramatic
  const SWING = 95;      // base swing of the leaf at full lift (deg)
  const CURL = 55;       // extra bend spread from hinge → tip (deg) = the bow
  const COMMIT = 0.35, FLICK = 0.4, START = 8, SENS = 0.6;

  // side → axis + signs. axis 'y' = rotateY (landscape, vertical fold line);
  // axis 'x' = rotateX (portrait, horizontal fold line).
  const SIDE = {
    right:  { axis: 'y', sSign:  1, originPerc: '0% 50%',   rotSign: -1 },
    left:   { axis: 'y', sSign: -1, originPerc: '100% 50%', rotSign:  1 },
    bottom: { axis: 'x', sSign:  1, originPerc: '50% 0%',   rotSign: -1 },
    top:    { axis: 'x', sSign: -1, originPerc: '50% 100%', rotSign:  1 },
  };

  function init(c) { cfg = c; }
  function point(e) {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
  }
  function easeOut(t) { return 1 - Math.pow(1 - t, 2.2); }

  function start(e, areaEl) {
    if (animating || g || !areaEl || !cfg) return;
    if (e.target.closest && e.target.closest('button, a, input, textarea, .inspect-btn, .reader-diag')) return;
    const p = point(e);
    g = { area: areaEl, x0: p.x, y0: p.y, t0: Date.now(), axis: cfg.isPortrait() ? 'y' : 'x', started: false };
    if (e.type === 'mousedown') {
      g.mm = (ev) => move(ev); g.mu = (ev) => end(ev);
      document.addEventListener('mousemove', g.mm); document.addEventListener('mouseup', g.mu);
    }
  }

  function move(e) {
    if (!g) return;
    const p = point(e);
    const dx = p.x - g.x0, dy = p.y - g.y0;
    const primary = g.axis === 'x' ? dx : dy, cross = g.axis === 'x' ? dy : dx;
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
    g.prog = Math.max(0, Math.min(1, Math.abs(primary) / (g.dim * SENS)));
    apply(g.prog);
  }

  function end() {
    if (!g) return;
    if (!g.started) { if (cfg && cfg.onTap) cfg.onTap(); cleanup(); return; }
    if (!g.wrap) { cleanup(); return; }
    finish(g.prog > COMMIT || (g.speed || 0) > FLICK);
  }

  function animate(forward) {
    if (animating || g || !cfg) return;
    const area = document.querySelector('.page-area');
    if (!area) { forward ? cfg.goNext() : cfg.goPrev(); return; }
    if (!(forward ? cfg.canNext() : cfg.canPrev())) return;
    g = { area, axis: cfg.isPortrait() ? 'y' : 'x', forward, started: true, prog: 0 };
    if (!safeBegin()) { commitInstant(); return; }
    finish(true);
  }

  function safeBegin() { try { begin(); return true; } catch (e) { console.warn('bend begin failed', e); return false; } }
  function commitInstant() { cfg.setIndex(cfg.index() + (g.forward ? 1 : -1)); cleanup(); }

  // Build one segmented leaf: N strip clones that setShape() arranges into a
  // curved arc via forward kinematics. Returns { container, setShape }.
  function buildLeaf(side, src, W, H) {
    const c = SIDE[side];
    const axisY = c.axis === 'y';
    const Lhalf = axisY ? W / 2 : H / 2;
    const w = Lhalf / N;

    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'absolute', left: 0, top: 0, width: W + 'px', height: H + 'px',
      transformStyle: 'preserve-3d', willChange: 'opacity',
    });

    const strips = [];
    for (let i = 0; i < N; i++) {
      const strip = document.createElement('div');
      let boxLeft, boxTop, boxW, boxH;
      if (axisY) {
        boxW = w + 0.6; boxH = H; boxTop = 0;
        boxLeft = (c.sSign > 0) ? (W / 2 + i * w) : (W / 2 - (i + 1) * w);
      } else {
        boxH = w + 0.6; boxW = W; boxLeft = 0;
        boxTop = (c.sSign > 0) ? (H / 2 + i * w) : (H / 2 - (i + 1) * w);
      }
      Object.assign(strip.style, {
        position: 'absolute', left: boxLeft + 'px', top: boxTop + 'px',
        width: boxW + 'px', height: boxH + 'px', overflow: 'hidden',
        backfaceVisibility: 'hidden', transformOrigin: c.originPerc, willChange: 'transform',
      });
      const clone = src.cloneNode(true);
      clone.classList.add('pc-clone');   // suppress page-edge lines/crease on the moving leaf
      Object.assign(clone.style, {
        position: 'absolute', left: (-boxLeft) + 'px', top: (-boxTop) + 'px',
        width: W + 'px', height: H + 'px', margin: 0,
      });
      strip.appendChild(clone);
      const shade = document.createElement('div');
      Object.assign(shade.style, { position: 'absolute', inset: 0, pointerEvents: 'none', background: '#000', opacity: 0 });
      strip.appendChild(shade);
      container.appendChild(strip);
      strips.push({ strip, shade });
    }

    function setShape(beta, curl, opacity) {
      container.style.opacity = String(opacity);
      let sAcc = 0, zAcc = 0;                    // running near-edge position on the arc
      for (let i = 0; i < N; i++) {
        const thetaDeg = beta + curl * ((i + 0.5) / N);
        const thr = thetaDeg * Math.PI / 180;
        const deltaS = sAcc - i * w;             // offset from this strip's flat resting position
        const st = strips[i].strip;
        if (axisY) {
          st.style.transform = 'translate3d(' + (c.sSign * deltaS) + 'px,0,' + zAcc + 'px) rotateY(' + (c.rotSign * thetaDeg) + 'deg)';
        } else {
          st.style.transform = 'translate3d(0,' + (c.sSign * deltaS) + 'px,' + zAcc + 'px) rotateX(' + (c.rotSign * thetaDeg) + 'deg)';
        }
        let dark = 0.62 * Math.sin(thr);
        if (thetaDeg > 90) dark += 0.18;         // back-facing strips darker
        if (dark < 0) dark = 0; if (dark > 0.72) dark = 0.72;
        strips[i].shade.style.opacity = String(dark);
        sAcc += w * Math.cos(thr);
        zAcc += w * Math.sin(thr);
      }
    }

    return { container, setShape };
  }

  function begin() {
    g.origIndex = cfg.index(); g.destIndex = g.origIndex + (g.forward ? 1 : -1);
    const r = g.area.getBoundingClientRect(); const W = r.width, H = r.height;
    const horiz = g.axis === 'x';
    g.turnSide = horiz ? (g.forward ? 'right' : 'left') : (g.forward ? 'bottom' : 'top');
    g.laySide  = horiz ? (g.forward ? 'left' : 'right') : (g.forward ? 'top' : 'bottom');
    const srcCur = g.area.querySelector('.book-page'); if (!srcCur) throw new Error('no page');

    g.wrap = document.createElement('div');
    Object.assign(g.wrap.style, {
      position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: W + 'px', height: H + 'px',
      perspective: PERSP + 'px', transformStyle: 'preserve-3d', pointerEvents: 'none', zIndex: 46,
    });
    document.body.appendChild(g.wrap);

    // held OLD lay-side half (flat) under leaf2 so it doesn't change early
    g.static = buildLeaf(g.laySide, srcCur, W, H);
    g.static.container.style.zIndex = '1';
    g.static.setShape(0, 0, 1);
    g.wrap.appendChild(g.static.container);

    // leaf1 = the turning half (curls up and away)
    g.leaf1 = buildLeaf(g.turnSide, srcCur, W, H);
    g.leaf1.container.style.zIndex = '4';
    g.wrap.appendChild(g.leaf1.container);

    cfg.setIndex(g.destIndex);   // next spread renders live underneath
    cfg.afterRender(() => {
      if (!g) return;
      const srcNext = g.area.querySelector('.book-page'); if (!srcNext) return;
      g.leaf2 = buildLeaf(g.laySide, srcNext, W, H);   // next page's half, un-curls down
      g.leaf2.container.style.zIndex = '3';
      g.wrap.appendChild(g.leaf2.container);
      apply(g.prog || 0);
    });
    apply(0);
  }

  function apply(p) {
    if (!g || !g.leaf1) return;
    // leaf1 lifts + curls over the first half, fading through vertical
    const p1 = Math.min(1, p / 0.5);
    let op1 = 1; if (p > 0.46) op1 = p >= 0.54 ? 0 : (0.54 - p) / 0.08;
    g.leaf1.setShape(p1 * SWING, p1 * CURL, op1);
    // leaf2 un-curls down over the second half (ease-out "gravity")
    if (g.leaf2) {
      const p2 = Math.max(0, Math.min(1, (p - 0.5) / 0.5)), e = easeOut(p2);
      let op2 = p < 0.46 ? 0 : (p < 0.54 ? (p - 0.46) / 0.08 : 1);
      g.leaf2.setShape((1 - e) * SWING, (1 - e) * CURL, op2);
    }
  }

  function finish(commit) {
    animating = true;
    const from = g.prog || 0, to = commit ? 1 : 0, dur = 320, t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      apply(from + (to - from) * ease(k));
      if (k < 1) { requestAnimationFrame(step); return; }
      if (!commit) cfg.setIndex(g.origIndex);
      cleanup(); animating = false;
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
