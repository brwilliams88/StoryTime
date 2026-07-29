// =====================================================================
// StoryTime — Print Export engine (v1.2.0)
// =====================================================================
// Builds printable PDFs of a story, entirely on-device (no API calls):
//
//   • "Storyboard"  — one-sided handout: title banner + rows of
//                     picture | justified text, 3 spreads per Letter page.
//   • "Mini-Book"   — two-sided 6-up imposition: cut + stack + staple
//                     into a real 4×3½ inch book with 3½" square pages.
//
// Architecture: ONE layout spec (a flat list of draw ops per sheet, in
// PDF points, origin TOP-LEFT) is rendered by TWO renderers —
//   renderSheetToCanvas()  → the live preview in the export sheet
//   renderSpecToPdf()      → the actual PDF (pdf-lib + fontkit)
// so what you preview is exactly what prints.
//
// Mini-Book imposition (US Letter, duplex "flip on long edge"):
//   trim ¼" border → 8×10½" → 2×3 grid of 4.0×3.5" cells
//   = 3½" SQUARE page + exactly the ½" staple gutter.  The back of a
//   sheet is mirrored left↔right, so front cells [1,3,5,7,9,11] pair
//   with back cells [4,2,8,6,12,10] — every page lands exactly behind
//   its own leaf. Cut/trim lines print on the FRONT side only.
// =====================================================================

/* global PDFLib, fontkit */

const STExport = (() => {
  // ---- Geometry (points; 72/inch) ------------------------------------
  // A cut piece = 3½" square art face + a ¼" spine margin — 270 × 252pt,
  // nothing extra. 2×270 across + 3×252 down tiles Letter with a ½" side
  // trim and a ¼" top/bottom trim. The centre cut sits EXACTLY on the
  // sheet's mirror axis (x = 306 = 612/2), which is what makes the duplex
  // long-edge flip land every back precisely behind its front.
  const PAGE_W = 612, PAGE_H = 792;              // US Letter portrait
  const TRIM_X = 36;                              // ½" side trim
  const TRIM_Y = 18;                              // ¼" top/bottom trim
  const CELL_W = 270, CELL_H = 252;               // one cut piece
  const SQ = 252;                                 // 3.5" square page face
  const GUT = 18;                                 // ¼" binding margin (the spine)
  // NO BLEED, by choice: every page's ink stops EXACTLY at the cut lines,
  // so nothing from one page can ever end up printed on a neighbour's
  // piece. (Trade-off, accepted: if a cut wanders a hair off the line, the
  // sliver shows as white paper rather than a neighbour's colour.)
  // cells in order r1L r1R r2L r2R r3L r3R
  const CELL_POS = [
    [TRIM_X, TRIM_Y], [TRIM_X + CELL_W, TRIM_Y],
    [TRIM_X, TRIM_Y + CELL_H], [TRIM_X + CELL_W, TRIM_Y + CELL_H],
    [TRIM_X, TRIM_Y + 2 * CELL_H], [TRIM_X + CELL_W, TRIM_Y + 2 * CELL_H],
  ];

  // ---- Colours --------------------------------------------------------
  const C = {
    indigo:    [0x1b / 255, 0x1b / 255, 0x3a / 255],   // spine band
    gold:      [0xea / 255, 0xa9 / 255, 0x3f / 255],   // staple marks
    ink:       [0x3e / 255, 0x2c / 255, 0x12 / 255],   // story text
    inkSoft:   [0x4a / 255, 0x3c / 255, 0x20 / 255],   // back-cover summary
    meta:      [0x8a / 255, 0x7a / 255, 0x56 / 255],   // small credits
    collate:   [0xa9 / 255, 0xad / 255, 0xb5 / 255],   // gutter numbers
    cutline:   [0x9a / 255, 0xa0 / 255, 0xab / 255],
    trimline:  [0xc9 / 255, 0xce / 255, 0xd6 / 255],
    parchment: [0xfb / 255, 0xf3 / 255, 0xdf / 255],
    parchBrd:  [0xe4 / 255, 0xd5 / 255, 0xb0 / 255],
    plateBrd:  [0xca / 255, 0xa8 / 255, 0x58 / 255],
    panel:     [0xfd / 255, 0xf8 / 255, 0xec / 255],   // back-cover panel
    heart:     [0x27 / 255, 0x27 / 255, 0x5e / 255],   // dark-indigo heart
    spare:     [0xc9 / 255, 0xc9 / 255, 0xc9 / 255],
    guide:     [0x8c / 255, 0x9e / 255, 0xd9 / 255],   // preview-only cut guides
    white:     [1, 1, 1],
    banner:    [0xd9 / 255, 0xc9 / 255, 0xa6 / 255],   // storyboard rule
    pageno:    [0xb0 / 255, 0x9c / 255, 0x6d / 255],
  };

  const HEART_PATH = 'M12 21s-6.7-4.5-9.3-8.1C.6 9.9 2.2 5.7 5.7 4.8c2-.5 4.1.3 5.3 2 ' +
                     '1.2-1.7 3.3-2.5 5.3-2 3.5.9 5.1 5.1 3 8.1C16.7 16.5 12 21 12 21z';

  // ---- Fonts ----------------------------------------------------------
  // Fraunces (regular / semibold / italic) is embedded & SUBSET into the
  // PDF; Helvetica (built-in, no embed) covers the small meta lines.
  let _fontBytes = null;   // { reg, semi, ital } ArrayBuffers, fetched once
  async function loadFontBytes(version) {
    if (_fontBytes) return _fontBytes;
    const v = encodeURIComponent(version || '');
    const get = (p) => fetch(`assets/fonts/${p}?v=${v}`).then((r) => {
      if (!r.ok) throw new Error(`font ${p}: HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    _fontBytes = {
      reg:  await get('Fraunces-Regular.ttf'),
      semi: await get('Fraunces-SemiBold.ttf'),
      ital: await get('Fraunces-Italic.ttf'),
    };
    return _fontBytes;
  }

  // The canvas PREVIEW must draw with the same Fraunces faces the PDF
  // embeds — the app's stylesheet doesn't load the italic (or a true 600),
  // and a fallback face has different widths, so justified words would
  // look collided in the preview while the PDF is actually fine. Register
  // our shipped TTFs with the browser once, before any preview renders.
  let _previewFontsReady = false;
  async function ensurePreviewFonts(version) {
    if (_previewFontsReady) return;
    _previewFontsReady = true;
    const v = encodeURIComponent(version || '');
    const faces = [
      ['assets/fonts/Fraunces-Regular.ttf',  { style: 'normal', weight: '400' }],
      ['assets/fonts/Fraunces-SemiBold.ttf', { style: 'normal', weight: '600' }],
      ['assets/fonts/Fraunces-Italic.ttf',   { style: 'italic', weight: '400' }],
    ];
    await Promise.all(faces.map(async ([url, desc]) => {
      try {
        const f = new FontFace('Fraunces', `url(${url}?v=${v})`, desc);
        await f.load();
        document.fonts.add(f);
      } catch (e) { /* preview falls back; the PDF is unaffected */ }
    }));
  }

  // Measuring doc: a throwaway PDFDocument whose only job is giving us
  // font metrics for line breaking (the real doc embeds its own copies).
  let _measure = null;   // { serif, serifBold, serifItal, sans, sansBold }
  async function ensureMeasuringFonts(version) {
    if (_measure) return _measure;
    const bytes = await loadFontBytes(version);
    const doc = await PDFLib.PDFDocument.create();
    doc.registerFontkit(fontkit);
    _measure = {
      serif:     await doc.embedFont(bytes.reg),
      serifBold: await doc.embedFont(bytes.semi),
      serifItal: await doc.embedFont(bytes.ital),
      sans:      await doc.embedFont(PDFLib.StandardFonts.Helvetica),
      sansBold:  await doc.embedFont(PDFLib.StandardFonts.HelveticaBold),
    };
    return _measure;
  }

  // ---- Text layout ----------------------------------------------------
  // Wrap `text` at `maxW`, then emit one 'line' op per line: every word
  // carries its own absolute x, so justification is identical in the
  // canvas preview and the PDF. align: 'justify' | 'left' | 'center'.
  function layoutText(fontKey, text, size, maxW, align) {
    const font = _measure[fontKey];
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const spaceW = font.widthOfTextAtSize(' ', size);
    const lines = [];
    let cur = [], curW = 0;
    for (const w of words) {
      const wW = font.widthOfTextAtSize(w, size);
      if (cur.length && curW + spaceW + wW > maxW) { lines.push({ words: cur, width: curW }); cur = []; curW = 0; }
      if (cur.length) curW += spaceW;
      cur.push({ t: w, w: wW });
      curW += wW;
    }
    if (cur.length) lines.push({ words: cur, width: curW });

    return lines.map((ln, i) => {
      const isLast = i === lines.length - 1;
      let gap = spaceW, startX = 0;
      if (align === 'justify' && !isLast && ln.words.length > 1) {
        const extra = (maxW - ln.width) / (ln.words.length - 1);
        // justify every full line; bail out only on the truly grotesque
        // (a 2-word line stretching across the page)
        if (extra < spaceW * 6) gap = spaceW + extra;
      } else if (align === 'center') {
        startX = (maxW - ln.width) / 2;
      }
      let x = startX;
      const out = ln.words.map((wd) => { const o = { t: wd.t, x }; x += wd.w + gap; return o; });
      return { words: out };
    });
  }

  // Fit a block: step the size down (never below minSize) until the
  // wrapped text fits maxH. Returns { lines, size, lineH, height }.
  function fitText(fontKey, text, baseSize, minSize, maxW, maxH, align, lh) {
    for (let size = baseSize; ; size -= 0.5) {
      const lines = layoutText(fontKey, text, size, maxW, align);
      const lineH = size * (lh || 1.62);
      const height = lines.length * lineH;
      if (height <= maxH || size <= minSize) return { lines, size, lineH, height };
    }
  }

  // Emit line ops for a laid-out block at (x, topY).
  function pushTextBlock(ops, block, fontKey, color, x, topY) {
    let y = topY + block.size * 0.78;              // first baseline
    for (const ln of block.lines) {
      ops.push({ op: 'line-text', words: ln.words, x, y, size: block.size, fontKey, color });
      y += block.lineH;
    }
  }

  // "THE END" — app-style: uppercase, letter-spaced 0.4em, no underline.
  function pushTheEnd(ops, fontKey, size, color, cx, baselineY) {
    const font = _measure[fontKey];
    const text = 'THE END';
    const track = size * 0.4;
    let total = 0;
    const glyphs = [...text].map((ch) => {
      const w = ch === ' ' ? font.widthOfTextAtSize(' ', size) : font.widthOfTextAtSize(ch, size);
      total += w + track;
      return { ch, w };
    });
    total -= track;
    let x = cx - total / 2;
    const words = [];
    for (const g of glyphs) { if (g.ch !== ' ') words.push({ t: g.ch, x: x - (cx - total / 2) }); x += g.w + track; }
    ops.push({ op: 'line-text', words, x: cx - total / 2, y: baselineY, size, fontKey, color });
    return total;
  }

  // cover-fit: scale `nat` (natural w/h) to fully cover rect, centered.
  function coverFit(natW, natH, x, y, w, h) {
    const s = Math.max(w / natW, h / natH);
    const dw = natW * s, dh = natH * s;
    return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
  }

  function pushClippedImage(ops, key, x, y, w, h) {
    ops.push({ op: 'image', key, x, y, w, h });
  }

  // =====================================================================
  //  MINI-BOOK
  // =====================================================================
  // Booklet pagination: 1=cover · 2k=picture k · 2k+1=words k (last one
  // carries The End) · final=back cover. Leaves = pages/2; 6 leaves/sheet.
  function bookletPages(story) {
    const pages = story.pages || [];
    const last = 2 * pages.length + 2;
    const P = { 1: { kind: 'cover' } };
    P[last] = { kind: 'back' };
    pages.forEach((pg, k) => {
      P[2 * (k + 1)] = { kind: 'img', imageKey: 'p' + k };
      P[2 * (k + 1) + 1] = { kind: 'text', text: pg.text, last: k === pages.length - 1 };
    });
    return { P, last };
  }

  function bookletImposition(lastPage) {
    const leaves = Math.ceil(lastPage / 2);
    const sheetCount = Math.ceil(leaves / 6);
    const sheets = [];
    for (let s = 0; s < sheetCount; s++) {
      const front = [], back = [];
      for (let c = 0; c < 6; c++) {
        const leaf = s * 6 + c + 1;                 // 1-based leaf number
        const recto = 2 * leaf - 1, verso = 2 * leaf;
        front.push(recto <= lastPage ? recto : 0);
        // duplex long-edge flip mirrors columns: back of column L is
        // column R of the back canvas (and vice versa) on the same row.
        back.push(0);
      }
      for (let c = 0; c < 6; c++) {
        const mirror = c % 2 === 0 ? c + 1 : c - 1; // L↔R within the row
        const leaf = s * 6 + c + 1;
        const verso = 2 * leaf;
        back[mirror] = verso <= lastPage ? verso : 0;
      }
      sheets.push({ front, back });
    }
    return sheets;
  }

  // One text size for the WHOLE book: fit every page (the last one reserves
  // room for The End), take the smallest size that fits, lay all pages out
  // at that size. Mixed sizes across a printed book read as a mistake.
  function uniformTextBlocks(P, story, pad, endReserve) {
    const pages = story.pages || [];
    const maxW = SQ - 2 * pad;
    let g = 12;                                    // a notch bigger — fills the page more
    pages.forEach((pg, k) => {
      const isLast = k === pages.length - 1;
      const f = fitText('serif', pg.text, 12, 9, maxW, SQ - 2 * pad - (isLast ? endReserve : 0), 'justify', 1.62);
      if (f.size < g) g = f.size;
    });
    pages.forEach((pg, k) => {
      const n = 2 * (k + 1) + 1;
      const lines = layoutText('serif', pg.text, g, maxW, 'justify');
      P[n].block = { lines, size: g, lineH: g * 1.62, height: lines.length * g * 1.62 };
    });
  }

  function buildMiniBookSpec(story, meta) {
    const { P, last } = bookletPages(story);
    uniformTextBlocks(P, story, 20, 34);
    const sheets = [];
    for (const imp of bookletImposition(last)) {
      sheets.push({ ops: miniSheetOps(imp.front, 'left', true, P, last, meta) });
      // back:true → the PDF renderer applies the per-printer duplex offset
      sheets.push({ ops: miniSheetOps(imp.back, 'right', false, P, last, meta), back: true });
    }
    return { kind: 'minibook', sheets, bookPages: last, sheetsOfPaper: sheets.length / 2 };
  }

  // Two draw layers per sheet: ART first (everything that bleeds), then
  // FURNITURE (spine bands, white margins, text faces, plates, panels) on
  // top. That way a neighbour's bleed smear can never sit on any kept
  // surface — margins and page faces are repainted clean over it.
  function miniSheetOps(cells, gutterSide, isFront, P, last, meta) {
    const art = [], furn = [];
    cells.forEach((pg, ci) => {
      const [cx, cy] = CELL_POS[ci];
      miniCellOps(art, furn, pg, cx, cy, gutterSide, P, last, meta);
    });
    const ops = art.concat(furn);
    const dash = { dash: [3, 3] };
    const lines = [
      { op: 'rule', x1: TRIM_X, y1: 0, x2: TRIM_X, y2: PAGE_H, color: C.trimline, width: 0.8, ...dash },
      { op: 'rule', x1: PAGE_W - TRIM_X, y1: 0, x2: PAGE_W - TRIM_X, y2: PAGE_H, color: C.trimline, width: 0.8, ...dash },
      { op: 'rule', x1: 0, y1: TRIM_Y, x2: PAGE_W, y2: TRIM_Y, color: C.trimline, width: 0.8, ...dash },
      { op: 'rule', x1: 0, y1: PAGE_H - TRIM_Y, x2: PAGE_W, y2: PAGE_H - TRIM_Y, color: C.trimline, width: 0.8, ...dash },
      { op: 'rule', x1: PAGE_W / 2, y1: 0, x2: PAGE_W / 2, y2: PAGE_H, color: C.cutline, width: 1, ...dash },
      { op: 'rule', x1: 0, y1: TRIM_Y + CELL_H, x2: PAGE_W, y2: TRIM_Y + CELL_H, color: C.cutline, width: 1, ...dash },
      { op: 'rule', x1: 0, y1: TRIM_Y + 2 * CELL_H, x2: PAGE_W, y2: TRIM_Y + 2 * CELL_H, color: C.cutline, width: 1, ...dash },
    ];
    if (isFront) {
      ops.push(...lines);                       // printed — you cut on these
    } else {
      // back sides stay clean on paper, but the PREVIEW shows the same
      // grid in blue so alignment can be checked by eye
      ops.push(...lines.map((l) => ({ ...l, color: C.guide, width: 0.8, previewOnly: true })));
    }
    return ops;
  }

  function miniCellOps(art, furn, pg, cx, cy, gutterSide, P, last, meta) {
    if (!pg) {                                      // spare piece → discarded
      furn.push({ op: 'rect', x: cx, y: cy, w: CELL_W, h: CELL_H, color: C.white });
      furn.push({ op: 'rect-outline', x: cx + CELL_W / 2 - 48, y: cy + 112, w: 96, h: 26, color: C.spare, dash: [3, 3], width: 0.8 });
      furn.push({ op: 'ctext', text: 'spare — recycle', fontKey: 'sans', size: 7.5, color: C.spare, cx: cx + CELL_W / 2, y: cy + 129 });
      return;
    }
    const p = P[pg];
    const gutterX = gutterSide === 'left' ? cx : cx + CELL_W - GUT;
    const sqX = gutterSide === 'left' ? cx + GUT : cx;
    const outerEdge = gutterSide === 'left' ? 'right' : 'left';   // square's cut-line side
    const isCoverish = p.kind === 'cover' || p.kind === 'back';

    // -- ART layer -----------------------------------------------------
    // The artwork square maps EXACTLY onto the page square — flush to the
    // cut lines on its three outer sides, flush to the spine margin inside.
    const face = { x: sqX, y: cy, w: SQ, h: SQ };
    if (p.kind === 'cover') art.push({ op: 'image-cover', key: 'cover', clip: face });
    if (p.kind === 'img')   art.push({ op: 'image-cover', key: p.imageKey, clip: face });
    if (p.kind === 'back')  art.push({ op: 'image-cover', key: 'coverBlur', clip: face });

    // -- FURNITURE layer -----------------------------------------------
    if (isCoverish) {
      // the whole ¼" binding margin IS the spine band — flush against the
      // art on one side, stopping exactly at the cut/trim line on the other
      furn.push({ op: 'rect', x: gutterX, y: cy, w: GUT, h: CELL_H, color: C.indigo });
      // two gold staple marks — vertical, ½" long (a real staple), spread wide
      const mx = gutterX + GUT / 2;
      const stapleLen = 36, stapleW = 2.4;
      for (const f of [0.16, 0.70]) {
        furn.push({ op: 'rect', x: mx - stapleW / 2, y: cy + CELL_H * f, w: stapleW, h: stapleLen, color: C.gold });
      }
    } else {
      // inner pages: the margin is repainted clean white (covers any
      // neighbour's bleed smear), then the little collation number
      furn.push({ op: 'rect', x: gutterX, y: cy, w: GUT, h: CELL_H, color: C.white });
      furn.push({ op: 'ctext', text: String(pg), fontKey: 'sansBold', size: 7.5, color: C.collate, cx: gutterX + GUT / 2, y: cy + CELL_H * 0.45 + 2.6 });
    }

    if (p.kind === 'cover') {
      // slim title-only plate near the bottom (echoes the in-app cover plate)
      const plateW = SQ - 56, plateX = sqX + 28;
      const title = fitText('serifBold', meta.title, 13.5, 10, plateW - 16, 40, 'center', 1.22);
      const plateH = title.height + 13;
      const plateY = cy + SQ - plateH - 14;
      furn.push({ op: 'rect', x: plateX, y: plateY, w: plateW, h: plateH, color: C.parchment, opacity: 0.94, borderColor: C.plateBrd, borderWidth: 1.2 });
      pushTextBlock(furn, title, 'serifBold', [0x2c / 255, 0x23 / 255, 0x13 / 255], plateX + 8, plateY + 6);
    }

    if (p.kind === 'text') {
      // page face repainted white first — a neighbour's bleed can't streak it
      furn.push({ op: 'rect', x: sqX, y: cy, w: SQ, h: SQ, color: C.white });
      const pad = 20;
      const block = p.block;                        // pre-laid, book-uniform size
      if (!p.last) {
        const top = cy + (SQ - block.height) / 2;
        pushTextBlock(furn, block, 'serif', C.ink, sqX + pad, top);
      } else {
        // centre text + The End TOGETHER as one group (no stray gap)
        const endSize = 11.5, gap = 16;
        const groupH = block.height + gap + endSize;
        const top = cy + (SQ - groupH) / 2;
        pushTextBlock(furn, block, 'serif', C.ink, sqX + pad, top);
        pushTheEnd(furn, 'serifBold', endSize, C.ink, sqX + SQ / 2, top + block.height + gap + endSize * 0.78);
      }
    }

    if (p.kind === 'back') {
      // translucent panel — like the back of a real book jacket. A wider
      // blurred-art border around a slightly smaller panel, a touch of
      // breathing room above the summary, and a bigger summary size.
      const inset = 16;
      const px = sqX + inset, py = cy + inset, pw = SQ - 2 * inset, ph = SQ - 2 * inset;
      furn.push({ op: 'rect', x: px, y: py, w: pw, h: ph, color: C.panel, opacity: 0.9 });
      const tpad = 13, topPad = 19;
      // bottom block reserved first: short gold rule · credits · made-with
      const mSize = 7.5, mLH = mSize * 1.7;
      const bottomH = 10 + (meta.credits.length + 1) * mLH + 12;
      const summary = fitText('serifItal', `${meta.summary || ''}`, 12, 9, pw - 2 * tpad, ph - topPad - 8 - bottomH, 'justify', 1.6);
      pushTextBlock(furn, summary, 'serifItal', C.inkSoft, px + tpad, py + topPad);
      let by = py + ph - bottomH;
      furn.push({ op: 'rule', x1: px + pw / 2 - 26, y1: by, x2: px + pw / 2 + 26, y2: by, color: C.plateBrd, width: 1 });
      by += 10 + mSize * 0.78;
      for (const line of meta.credits) {
        furn.push({ op: 'ctext', text: line, fontKey: 'sans', size: mSize, color: C.meta, cx: px + pw / 2, y: by });
        by += mLH;
      }
      furn.push({ op: 'ctext', text: 'Made with StoryTime', fontKey: 'sans', size: mSize, color: C.meta, cx: px + pw / 2, y: by });
    }
  }

  // =====================================================================
  //  STORYBOARD
  // =====================================================================
  // imgSize 184: with the 116pt banner, three rows land at y=746 on page 1 —
  // pictures as large as the sheet allows without squeezing the footer.
  const SB = {
    margin: 36, imgSize: 184, rowGap: 14, textPad: 15,
    bannerH: 116, rowsPerPage: 3,
  };

  function buildStoryboardSpec(story, meta) {
    const pages = story.pages || [];
    const sheets = [];
    let ops = [];
    let y = SB.margin;

    // ---- banner (first sheet only) ----
    if (meta.hasImages) ops.push({ op: 'image-cover', key: 'cover', clip: { x: SB.margin, y, w: 98, h: 98 } });
    const titleX = SB.margin + (meta.hasImages ? 98 + 16 : 0);
    const titleW = PAGE_W - SB.margin - titleX;
    const title = fitText('serifBold', meta.title, 24, 15, titleW, 64, 'left', 1.18);
    pushTextBlock(ops, title, 'serifBold', [0x2c / 255, 0x23 / 255, 0x13 / 255], titleX, y + 6);
    ops.push({ op: 'line-text', words: [{ t: meta.byline, x: 0 }], x: titleX, y: y + 6 + title.height + 16, size: 10.5, fontKey: 'sans', color: C.meta });
    ops.push({ op: 'rule', x1: SB.margin, y1: y + SB.bannerH - 12, x2: PAGE_W - SB.margin, y2: y + SB.bannerH - 12, color: C.banner, width: 1.6 });
    y += SB.bannerH;

    const rowH = SB.imgSize;
    const flush = (isLastSheet) => {
      ops.push({ op: 'ctext', text: `${meta.title} · Made with StoryTime · page ${sheets.length + 1} of ${meta.sbPageCount}`, fontKey: 'sans', size: 8.5, color: C.pageno, cx: PAGE_W / 2, y: PAGE_H - 22 });
      sheets.push({ ops });
      ops = []; y = SB.margin;
    };

    // ONE text size across every panel: fit each (the last reserves room
    // for The End), take the smallest, lay all panels out at that size.
    const textX = SB.margin + (meta.hasImages ? SB.imgSize + 14 : 0);
    const textW = PAGE_W - SB.margin - textX;
    const maxW = textW - 2 * SB.textPad - 6;
    let gsize = 13.5;
    pages.forEach((pg, i) => {
      const isLast = i === pages.length - 1;
      const f = fitText('serif', pg.text, 13.5, 10, maxW, rowH - 2 * SB.textPad - (isLast ? 30 : 0), 'justify', 1.6);
      if (f.size < gsize) gsize = f.size;
    });
    const blocks = pages.map((pg) => {
      const lines = layoutText('serif', pg.text, gsize, maxW, 'justify');
      return { lines, size: gsize, lineH: gsize * 1.6, height: lines.length * gsize * 1.6 };
    });

    pages.forEach((pg, i) => {
      if (y + rowH > PAGE_H - SB.margin - 8) flush(false);
      const isLast = i === pages.length - 1;
      if (meta.hasImages) {
        const key = 'p' + i;
        if (meta.pageHasImage[i]) ops.push({ op: 'image-cover', key, clip: { x: SB.margin, y, w: SB.imgSize, h: SB.imgSize } });
        else ops.push({ op: 'rect-outline', x: SB.margin, y, w: SB.imgSize, h: SB.imgSize, color: C.parchBrd, dash: [4, 3], width: 1 });
      }
      // parchment text card
      ops.push({ op: 'rect', x: textX, y, w: textW, h: rowH, color: C.parchment, borderColor: C.parchBrd, borderWidth: 1 });
      const block = blocks[i];
      const groupH = isLast ? block.height + 14 + 12 : block.height;
      const top = y + (rowH - groupH) / 2;
      pushTextBlock(ops, block, 'serif', C.ink, textX + SB.textPad, top);
      if (isLast) pushTheEnd(ops, 'serifBold', 12, C.ink, textX + textW / 2, top + block.height + 14 + 12 * 0.78);
      ops.push({ op: 'line-text', words: [{ t: String(i + 1), x: 0 }], x: textX + textW - 14, y: y + rowH - 8, size: 8, fontKey: 'sansBold', color: C.pageno });
      y += rowH + SB.rowGap;
    });
    flush(true);
    return { kind: 'storyboard', sheets, sheetsOfPaper: sheets.length };
  }

  // =====================================================================
  //  COLORING PAGE — art as big as the paper allows, caption at the very
  //  bottom edge (not under the art). No frame.
  // =====================================================================
  function buildColoringSpec(meta) {
    const artSize = PAGE_W - 36;                    // 576pt = 8" square, ¼" side margins
    const ax = 18, ay = 64;
    const ops = [
      { op: 'image-cover', key: 'coloring', clip: { x: ax, y: ay, w: artSize, h: artSize } },
      { op: 'ctext', text: `${meta.title} · Made with StoryTime`, fontKey: 'sans', size: 9.5, color: C.pageno, cx: PAGE_W / 2, y: PAGE_H - 32 },
    ];
    return { kind: 'coloring', sheets: [{ ops }], sheetsOfPaper: 1 };
  }

  // =====================================================================
  //  PRINTER CALIBRATION TEST — one duplex sheet that measures the
  //  printer's back-side vertical drift. THIRTEEN widely-spaced rows,
  //  one per candidate offset: each row has a long line on the front and
  //  a short line on the back, deliberately offset by that row's value.
  //  Held up to a light, the row where the two lines MELT INTO ONE is
  //  the printer's drift — tap that row's number in the app.
  //  (v1.2.4 drew all 13 lines 0.5mm apart around one centre — they
  //  merged into an unreadable bar. Never label lines 1.4pt apart.)
  // =====================================================================
  const MM = 72 / 25.4;
  const CAL_ROWS = (() => {
    const rows = [];
    for (let n = -6; n <= 6; n++) rows.push({ mm: n * 0.5, y: 168 + (n + 6) * 38 });
    return rows;
  })();
  function buildCalibrationSpec() {
    const front = [];
    const say = (arr, text, size, y, fontKey, color) =>
      arr.push({ op: 'ctext', text, fontKey: fontKey || 'sans', size, color: color || C.ink, cx: PAGE_W / 2, y });
    say(front, 'StoryTime · Printer Calibration', 16, 78, 'serifBold');
    say(front, 'Print this sheet 2-sided (flip on long edge, 100% scale),', 11, 106);
    say(front, 'then hold it up to a light. Each row has one line on the front', 11, 124);
    say(front, 'and one on the back — find the row where they melt into ONE line,', 11, 142);
    say(front, 'and tap that row’s number in the app.', 11, 160);
    for (const r of CAL_ROWS) {
      front.push({ op: 'rule', x1: 150, y1: r.y, x2: PAGE_W - 150, y2: r.y, color: C.ink, width: 1 });
    }
    say(front, 'One line = that row’s number is your printer’s setting.', 10, PAGE_H - 96, 'sans', C.meta);

    const back = [];
    say(back, 'Hold up to a light — which row’s lines become ONE?', 12, 106, 'serifBold');
    for (const r of CAL_ROWS) {
      const isZero = r.mm === 0;
      // the back line is drawn OFFSET by the row's value; the printer's
      // real drift cancels it exactly on the matching row
      back.push({ op: 'rule', x1: 216, y1: r.y + r.mm * MM, x2: PAGE_W - 216, y2: r.y + r.mm * MM, color: isZero ? C.gold : C.ink, width: 1 });
      const label = r.mm === 0 ? '0' : (r.mm > 0 ? `+${r.mm.toFixed(1)}` : r.mm.toFixed(1));
      back.push({ op: 'ctext', text: label, fontKey: 'sansBold', size: 11, color: isZero ? C.gold : C.ink, cx: 130, y: r.y + 4 });
      back.push({ op: 'ctext', text: label, fontKey: 'sansBold', size: 11, color: isZero ? C.gold : C.ink, cx: PAGE_W - 130, y: r.y + 4 });
    }
    say(back, 'If two rows look equally good, pick either one.', 10, PAGE_H - 96, 'sans', C.meta);
    return { kind: 'calibration', sheets: [{ ops: front }, { ops: back }], sheetsOfPaper: 1, docTitle: 'StoryTime — Printer Calibration' };
  }

  // How many storyboard pages a story needs (for footers, pre-computed).
  function storyboardPageCount(nPages) {
    // first page: banner + as many rows as fit; then full pages of rows
    const usable1 = PAGE_H - 2 * SB.margin - SB.bannerH;
    const usableN = PAGE_H - 2 * SB.margin;
    const per1 = Math.max(1, Math.floor((usable1 + SB.rowGap) / (SB.imgSize + SB.rowGap)));
    const perN = Math.max(1, Math.floor((usableN + SB.rowGap) / (SB.imgSize + SB.rowGap)));
    if (nPages <= per1) return 1;
    return 1 + Math.ceil((nPages - per1) / perN);
  }

  // =====================================================================
  //  RENDERERS
  // =====================================================================

  // ---- canvas preview -------------------------------------------------
  // `assets` maps image keys → HTMLImageElement (already decoded).
  function renderSheetToCanvas(canvas, sheet, assets) {
    const scale = canvas.width / PAGE_W;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    const css = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
    const fontCss = (key, size) => {
      if (key === 'serif') return `${size}px Fraunces, Georgia, serif`;
      if (key === 'serifBold') return `600 ${size}px Fraunces, Georgia, serif`;
      if (key === 'serifItal') return `italic ${size}px Fraunces, Georgia, serif`;
      if (key === 'sansBold') return `700 ${size}px Nunito, Helvetica, sans-serif`;
      return `${size}px Nunito, Helvetica, sans-serif`;
    };
    for (const o of sheet.ops) {
      if (o.op === 'rect') {
        ctx.globalAlpha = o.opacity != null ? o.opacity : 1;
        ctx.fillStyle = css(o.color);
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.globalAlpha = 1;
        if (o.borderColor) { ctx.strokeStyle = css(o.borderColor); ctx.lineWidth = o.borderWidth || 1; ctx.strokeRect(o.x, o.y, o.w, o.h); }
      } else if (o.op === 'rect-outline') {
        ctx.strokeStyle = css(o.color); ctx.lineWidth = o.width || 1;
        ctx.setLineDash(o.dash || []);
        ctx.strokeRect(o.x, o.y, o.w, o.h);
        ctx.setLineDash([]);
      } else if (o.op === 'image-cover') {
        const img = assets[o.key];
        if (!img) continue;
        const box = o.draw || o.clip;
        const r = coverFit(img.naturalWidth || img.width, img.naturalHeight || img.height, box.x, box.y, box.w, box.h);
        ctx.save(); ctx.beginPath(); ctx.rect(o.clip.x, o.clip.y, o.clip.w, o.clip.h); ctx.clip();
        ctx.drawImage(img, r.x, r.y, r.w, r.h);
        ctx.restore();
      } else if (o.op === 'rule') {
        ctx.strokeStyle = css(o.color); ctx.lineWidth = o.width || 1;
        ctx.setLineDash(o.dash || []);
        ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
        ctx.setLineDash([]);
      } else if (o.op === 'line-text') {
        ctx.fillStyle = css(o.color); ctx.font = fontCss(o.fontKey, o.size); ctx.textBaseline = 'alphabetic';
        for (const w of o.words) ctx.fillText(w.t, o.x + w.x, o.y);
      } else if (o.op === 'ctext') {
        ctx.fillStyle = css(o.color); ctx.font = fontCss(o.fontKey, o.size); ctx.textAlign = 'center';
        ctx.fillText(o.text, o.cx, o.y);
        ctx.textAlign = 'left';
      } else if (o.op === 'heart') {
        ctx.save();
        ctx.translate(o.x, o.y); ctx.scale(o.size / 24, o.size / 24);
        ctx.fillStyle = css(o.color);
        ctx.fill(new Path2D(HEART_PATH));
        ctx.restore();
      }
    }
  }

  // ---- PDF ------------------------------------------------------------
  // opts.backOffsetMm: per-printer duplex correction — every sheet marked
  // back:true is shifted vertically by this amount (positive = down), so
  // the backs land exactly behind the fronts on THIS printer.
  async function renderSpecToPdf(spec, imageBytes, version, opts) {
    const bytes = await loadFontBytes(version);
    const doc = await PDFLib.PDFDocument.create();
    doc.registerFontkit(fontkit);
    doc.setTitle(spec.docTitle || 'StoryTime');
    doc.setProducer('StoryTime');
    doc.setCreator('StoryTime');
    const fonts = {
      serif:     await doc.embedFont(bytes.reg,  { subset: true }),
      serifBold: await doc.embedFont(bytes.semi, { subset: true }),
      serifItal: await doc.embedFont(bytes.ital, { subset: true }),
      sans:      await doc.embedFont(PDFLib.StandardFonts.Helvetica),
      sansBold:  await doc.embedFont(PDFLib.StandardFonts.HelveticaBold),
    };
    // embed only the images this spec actually draws (the asset bag may
    // hold both plain and bleed-extended copies)
    const used = new Set();
    for (const sh of spec.sheets) for (const o of sh.ops) if (o.op === 'image-cover') used.add(o.key);
    const images = {};
    for (const [key, ab] of Object.entries(imageBytes)) {
      if (!used.has(key)) continue;
      const u8 = new Uint8Array(ab);
      const isJpg = u8[0] === 0xff && u8[1] === 0xd8;
      images[key] = isJpg ? await doc.embedJpg(ab) : await doc.embedPng(ab);
    }
    const { rgb } = PDFLib;
    const col = (c) => rgb(c[0], c[1], c[2]);
    const backOffsetPt = (opts && opts.backOffsetMm ? opts.backOffsetMm : 0) * 72 / 25.4;

    for (const sheet of spec.sheets) {
      const page = doc.addPage([PAGE_W, PAGE_H]);
      const dy = sheet.back ? backOffsetPt : 0;
      const Y = (y) => PAGE_H - y - dy;             // top-left → PDF coords (+ duplex shift)
      for (const o of sheet.ops) {
        if (o.previewOnly) continue;              // preview guides never print
        if (o.op === 'rect') {
          page.drawRectangle({ x: o.x, y: Y(o.y + o.h), width: o.w, height: o.h, color: col(o.color), opacity: o.opacity != null ? o.opacity : 1,
            borderColor: o.borderColor ? col(o.borderColor) : undefined, borderWidth: o.borderColor ? (o.borderWidth || 1) : undefined });
        } else if (o.op === 'rect-outline') {
          page.drawRectangle({ x: o.x, y: Y(o.y + o.h), width: o.w, height: o.h, borderColor: col(o.color), borderWidth: o.width || 1,
            borderDashArray: o.dash, color: undefined });
        } else if (o.op === 'image-cover') {
          const img = images[o.key];
          if (!img) continue;
          const box = o.draw || o.clip;
          const r = coverFit(img.width, img.height, box.x, box.y, box.w, box.h);
          const { pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath } = PDFLib;
          page.pushOperators(
            pushGraphicsState(),
            moveTo(o.clip.x, Y(o.clip.y)),
            lineTo(o.clip.x + o.clip.w, Y(o.clip.y)),
            lineTo(o.clip.x + o.clip.w, Y(o.clip.y + o.clip.h)),
            lineTo(o.clip.x, Y(o.clip.y + o.clip.h)),
            closePath(), clip(), endPath()
          );
          page.drawImage(img, { x: r.x, y: Y(r.y + r.h), width: r.w, height: r.h });
          page.pushOperators(popGraphicsState());
        } else if (o.op === 'rule') {
          page.drawLine({ start: { x: o.x1, y: Y(o.y1) }, end: { x: o.x2, y: Y(o.y2) }, thickness: o.width || 1, color: col(o.color), dashArray: o.dash });
        } else if (o.op === 'line-text') {
          for (const w of o.words) page.drawText(w.t, { x: o.x + w.x, y: Y(o.y), size: o.size, font: fonts[o.fontKey], color: col(o.color) });
        } else if (o.op === 'ctext') {
          const f = fonts[o.fontKey];
          const tw = f.widthOfTextAtSize(o.text, o.size);
          page.drawText(o.text, { x: o.cx - tw / 2, y: Y(o.y), size: o.size, font: f, color: col(o.color) });
        } else if (o.op === 'heart') {
          page.drawSvgPath(HEART_PATH, { x: o.x, y: Y(o.y), scale: o.size / 24, color: col(o.color) });
        }
      }
    }
    return doc.save();                              // Uint8Array
  }

  // =====================================================================
  //  ASSET GATHERING
  // =====================================================================
  // Collect image bytes + preview elements for a story: IndexedDB blob
  // first (already there for any story that's been read), signed R2 URL
  // as the fallback. Also builds the soft-blurred back-cover art.
  async function gatherAssets(story, onProgress) {
    const wants = [];
    if (story.cover && story.cover.image_status === 'ready' && story.cover.image_id) wants.push(['cover', story.cover.image_id]);
    (story.pages || []).forEach((p, i) => {
      if (p.image_status === 'ready' && p.image_id) wants.push(['p' + i, p.image_id]);
    });
    const bytes = {}, elements = {};
    const missing = [];
    for (const [key, id] of wants) {
      let blob = null;
      try { blob = await getImageBlob(id); } catch (e) { /* fall through */ }
      if (!blob) missing.push([key, id]);
      else await addAsset(key, blob);
      if (onProgress) onProgress(Object.keys(bytes).length, wants.length);
    }
    if (missing.length) {
      const urls = await signImageUrlsFor(missing.map(([, id]) => id));
      for (const [key, id] of missing) {
        if (!urls[id]) continue;
        try {
          const r = await fetch(urls[id]);
          if (r.ok) await addAsset(key, await r.blob());
        } catch (e) { /* leave it out — layout falls back */ }
        if (onProgress) onProgress(Object.keys(bytes).length, wants.length);
      }
    }
    // blurred echo of the cover for the back cover (downscale→upscale:
    // robust everywhere, no ctx.filter dependency)
    if (elements.cover) {
      const blurred = await makeBlurred(elements.cover);
      bytes.coverBlur = blurred.bytes;
      elements.coverBlur = blurred.el;
    }
    return { bytes, elements };

    async function addAsset(key, blob) {
      bytes[key] = await blob.arrayBuffer();
      elements[key] = await blobToImage(blob);
    }
  }

  function blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  async function makeBlurred(img) {
    const tiny = document.createElement('canvas');
    tiny.width = 14; tiny.height = 14;
    tiny.getContext('2d').drawImage(img, 0, 0, 14, 14);
    const big = document.createElement('canvas');
    big.width = 512; big.height = 512;
    const ctx = big.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // brighten a touch so the panel reads warm, not murky
    ctx.drawImage(tiny, 0, 0, 512, 512);
    ctx.fillStyle = 'rgba(255,252,244,0.16)';
    ctx.fillRect(0, 0, 512, 512);
    const blob = await new Promise((res) => big.toBlob(res, 'image/jpeg', 0.85));
    return { bytes: await blob.arrayBuffer(), el: await blobToImage(blob) };
  }

  // =====================================================================
  //  PUBLIC API
  // =====================================================================
  // meta: { title, summary, byline, credits[], hasImages, pageHasImage[], sbPageCount }
  async function buildSpec(format, story, meta, version) {
    await ensureMeasuringFonts(version);
    await ensurePreviewFonts(version);
    meta.sbPageCount = storyboardPageCount((story.pages || []).length);
    const spec = format === 'minibook' ? buildMiniBookSpec(story, meta)
      : format === 'coloring' ? buildColoringSpec(meta)
      : buildStoryboardSpec(story, meta);
    const label = format === 'minibook' ? 'Mini-Book' : format === 'coloring' ? 'Coloring Page' : 'Storyboard';
    spec.docTitle = `${meta.title} — ${label}`;
    return spec;
  }

  async function buildCalibrationPdf(version) {
    await ensureMeasuringFonts(version);
    return renderSpecToPdf(buildCalibrationSpec(), {}, version);
  }

  return { buildSpec, gatherAssets, renderSheetToCanvas, renderSpecToPdf, buildCalibrationPdf, PAGE_W, PAGE_H };
})();
