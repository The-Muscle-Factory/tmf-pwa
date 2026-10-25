// Touch gestures for exercise cards: swipe left to delete, drag a handle to reorder.
// Uses pointer events; cards need `touch-action: pan-y` so vertical scrolling
// still belongs to the browser.

let closeOpen = null; // closes whichever card is currently swiped open

// Swipe `card` left inside `wrap` to reveal the delete button behind it. A long
// swipe (past 60% of the width) deletes straight away.
export function swipeToDelete(wrap, card, onDelete) {
  const REVEAL = 92;
  let startX = null;
  let startY = 0;
  let pointer = null;
  let mode = null; // null until the gesture direction is known, then 'swipe' | 'scroll'
  let base = 0;
  let dx = 0;
  let swallowClick = false;

  const setX = (x, animate) => {
    card.style.transition = animate ? 'transform 0.2s ease' : 'none';
    card.style.transform = x ? `translateX(${x}px)` : '';
    wrap.classList.toggle('swiping', x !== 0);
  };
  const close = () => {
    base = 0;
    setX(0, true);
    if (closeOpen === close) closeOpen = null;
  };

  card.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('input, select, textarea, .drag-handle')) return;
    if (closeOpen && closeOpen !== close) closeOpen();
    startX = e.clientX;
    startY = e.clientY;
    pointer = e.pointerId;
    mode = null;
    dx = base;
  });

  card.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointer || startX == null) return;
    const mx = e.clientX - startX;
    const my = e.clientY - startY;
    if (!mode) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) * 1.5) {
        mode = 'swipe';
        card.setPointerCapture(pointer);
      } else if (Math.abs(my) > 8) mode = 'scroll';
      else return;
    }
    if (mode !== 'swipe') return;
    dx = Math.min(0, base + mx);
    setX(dx, false);
  });

  const end = (e) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    startX = null;
    if (mode !== 'swipe') return;
    swallowClick = true;
    if (dx < -wrap.offsetWidth * 0.6) {
      setX(-wrap.offsetWidth, true);
      setTimeout(onDelete, 180);
    } else if (dx < -REVEAL / 2) {
      base = -REVEAL;
      setX(base, true);
      closeOpen = close;
      // Any touch outside this card closes it again.
      const outside = (ev) => {
        if (wrap.contains(ev.target)) return;
        document.removeEventListener('pointerdown', outside, true);
        if (closeOpen === close) close();
      };
      document.addEventListener('pointerdown', outside, true);
    } else close();
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);

  // The tap that ends a swipe, or any tap on an open card, shouldn't press buttons.
  card.addEventListener('click', (e) => {
    if (swallowClick || base) {
      e.stopPropagation();
      e.preventDefault();
      if (!swallowClick) close();
      swallowClick = false;
    }
  }, true);
}

// Drag items of `list` by their handle. While dragging, `list` gets the class
// `reordering` (CSS collapses cards so the whole workout fits on screen).
export function dragToReorder(list, { item, handle, onDrop }) {
  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest(handle);
    if (!grip || e.button > 0) return;
    e.preventDefault();
    closeOpen?.();
    const items = [...list.querySelectorAll(item)];
    const dragged = grip.closest(item);
    const from = items.indexOf(dragged);
    if (from < 0) return;

    list.classList.add('reordering');
    const rects = items.map((el) => el.getBoundingClientRect()); // measured after collapsing
    const r = rects[from];
    const gap = items.length > 1 ? rects[1].top - rects[0].bottom : 0;
    const step = r.height + gap; // how far neighbours move to make room
    let to = from;
    dragged.classList.add('dragging');
    grip.setPointerCapture(e.pointerId);

    const move = (ev) => {
      const y = ev.clientY;
      dragged.style.transform = `translateY(${y - (r.top + r.height / 2)}px)`;
      to = rects.filter((rc, i) => i !== from && rc.top + rc.height / 2 < y).length;
      items.forEach((el, i) => {
        if (i === from) return;
        let shift = 0;
        if (to > from && i > from && i <= to) shift = -step;
        if (to < from && i >= to && i < from) shift = step;
        el.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const finish = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', finish);
      grip.removeEventListener('pointercancel', finish);
      for (const el of items) el.style.transform = '';
      dragged.classList.remove('dragging');
      list.classList.remove('reordering');
      if (to !== from) onDrop(from, to);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);
    move(e);
  });
}
