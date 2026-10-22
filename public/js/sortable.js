// ═══════════════════════════════════════════════════════════
//  Liste horizontale réordonnable
//  Doigt : appui long puis glisser. Souris : cliquer-glisser.
//  Les autres éléments s'écartent pendant le geste ; la liste
//  défile toute seule près des bords.
// ═══════════════════════════════════════════════════════════
function makeSortable(container, itemSelector, onDrop) {
  const LONG_PRESS_MS = 350, MOVE_TOL = 8, EDGE = 44;
  let drag = null, suppressClick = false;

  container.addEventListener('pointerdown', e => {
    const item = e.target.closest(itemSelector);
    if (!item || drag || !container.contains(item)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const idx = [...container.querySelectorAll(itemSelector)].indexOf(item);
    drag = { idx, item, pointerId: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, x: e.clientX, active: false };
    drag.timer = setTimeout(start, LONG_PRESS_MS);
  });
  window.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX;
    if (!drag.active) {
      // Bouger avant l'appui long = défilement (doigt) ou glisser direct (souris)
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > MOVE_TOL) {
        if (drag.type === 'mouse') start(); else cancel();
      }
      return;
    }
    layout();
  });
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  // Bloque le défilement pendant le glisser (iOS)
  container.addEventListener('touchmove', e => { if (drag && drag.active) e.preventDefault(); }, { passive: false });
  container.addEventListener('contextmenu', e => { if (e.target.closest(itemSelector)) e.preventDefault(); });
  // Le « clic » qui suit un glisser ne doit rien déclencher
  container.addEventListener('click', e => {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; }
  }, true);

  function cancel() { if (drag) clearTimeout(drag.timer); drag = null; }
  function start() {
    if (!drag || drag.active) return;
    clearTimeout(drag.timer);
    const items = [...container.querySelectorAll(itemSelector)];
    const cr = container.getBoundingClientRect();
    drag.items = items;
    drag.rects = items.map(c => { const r = c.getBoundingClientRect(); return { left: r.left - cr.left + container.scrollLeft, width: r.width }; });
    const gap = items.length > 1 ? drag.rects[1].left - (drag.rects[0].left + drag.rects[0].width) : 6;
    drag.shift = drag.rects[drag.idx].width + gap;
    drag.target = drag.idx;
    drag.x0 = drag.x;
    drag.scroll0 = container.scrollLeft;
    drag.active = true;
    drag.item.classList.add('dragging');
    drag.item.style.transform = 'scale(1.06)';
    container.classList.add('drag-mode');
    try { drag.item.setPointerCapture(drag.pointerId); } catch (e) {}
    drag.raf = requestAnimationFrame(loop);
  }
  function layout() {
    const dx = drag.x - drag.x0 + (container.scrollLeft - drag.scroll0);
    drag.item.style.transform = `translateX(${dx}px) scale(1.06)`;
    const r = drag.rects[drag.idx];
    const center = r.left + r.width / 2 + dx;
    let t = 0;
    drag.rects.forEach((o, j) => { if (j !== drag.idx && o.left + o.width / 2 < center) t++; });
    drag.target = t;
    drag.items.forEach((c, j) => {
      if (j === drag.idx) return;
      let s = 0;
      if (j > drag.idx && j <= t) s = -drag.shift;
      else if (j < drag.idx && j >= t) s = drag.shift;
      c.style.transform = s ? `translateX(${s}px)` : '';
    });
  }
  function loop() {
    if (!drag || !drag.active) return;
    const cr = container.getBoundingClientRect();
    let v = 0;
    if (drag.x < cr.left + EDGE) v = -Math.ceil((cr.left + EDGE - drag.x) / 4);
    else if (drag.x > cr.right - EDGE) v = Math.ceil((drag.x - (cr.right - EDGE)) / 4);
    if (v) {
      const before = container.scrollLeft;
      container.scrollLeft += v;
      if (container.scrollLeft !== before) layout();
    }
    drag.raf = requestAnimationFrame(loop);
  }
  function end(e) {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    clearTimeout(drag.timer);
    const d = drag;
    drag = null;
    if (!d.active) return;
    cancelAnimationFrame(d.raf);
    container.classList.remove('drag-mode');
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 120);
    onDrop(d.idx, d.target);   // l'appelant reconstruit la liste (efface les décalages)
  }
  return { isActive: () => !!(drag && drag.active) };
}

// Nouvel index d'un élément après un déplacement from → to
function remapIndex(i, from, to) {
  if (i < 0) return i;
  if (i === from) return to;
  if (from < to && i > from && i <= to) return i - 1;
  if (from > to && i >= to && i < from) return i + 1;
  return i;
}
