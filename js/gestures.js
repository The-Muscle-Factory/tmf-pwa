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
// Fingers use touch events: iOS Safari doesn't reliably honour `touch-action`
// on the handle, so a pointer-based drag gets cancelled when the page starts
// scrolling, whereas preventDefault() on touch events always stops the scroll.
// Mouse and pen use pointer events.
// Holding the item near the top or bottom of the visible area (`bounds()` gives
// the edges in viewport pixels, e.g. below a sticky header and above a tab bar)
// scrolls the page, faster the closer to the edge.
export function dragToReorder(list, { item, handle, onDrop, bounds = () => ({ top: 0, bottom: window.innerHeight }) }) {
  const EDGE = 70; // px from an edge where auto-scroll starts
  const MAX_SPEED = 14; // px per frame at the very edge

  // Starts a drag of the item holding `grip`; returns { move(y), end() }.
  function begin(grip, y) {
    closeOpen?.();
    const items = [...list.querySelectorAll(item)];
    const dragged = grip.closest(item);
    const from = items.indexOf(dragged);
    if (from < 0) return null;

    list.classList.add('reordering');
    // Positions in page coordinates (measured after collapsing), so they stay
    // valid while the page scrolls.
    const tops = items.map((el) => {
      const rc = el.getBoundingClientRect();
      return { top: rc.top + window.scrollY, height: rc.height };
    });
    const r = tops[from];
    const gap = items.length > 1 ? tops[1].top - (tops[0].top + tops[0].height) : 0;
    const step = r.height + gap; // how far neighbours move to make room
    let to = from;
    let lastY = y;
    let frame = 0;
    dragged.classList.add('dragging');

    const place = () => {
      const pageY = lastY + window.scrollY;
      dragged.style.transform = `translateY(${pageY - (r.top + r.height / 2)}px)`;
      to = tops.filter((rc, i) => i !== from && rc.top + rc.height / 2 < pageY).length;
      items.forEach((el, i) => {
        if (i === from) return;
        let shift = 0;
        if (to > from && i > from && i <= to) shift = -step;
        if (to < from && i >= to && i < from) shift = step;
        el.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    // Scrolls while the finger stays in an edge zone, then re-places the item.
    const autoScroll = () => {
      const { top, bottom } = bounds();
      let speed = 0;
      if (lastY < top + EDGE) speed = -MAX_SPEED * Math.min(1, (top + EDGE - lastY) / EDGE);
      else if (lastY > bottom - EDGE) speed = MAX_SPEED * Math.min(1, (lastY - (bottom - EDGE)) / EDGE);
      if (speed) {
        const before = window.scrollY;
        window.scrollBy(0, speed);
        if (window.scrollY !== before) place();
      }
      frame = requestAnimationFrame(autoScroll);
    };
    const move = (cy) => {
      lastY = cy;
      place();
    };
    const end = () => {
      cancelAnimationFrame(frame);
      for (const el of items) el.style.transform = '';
      dragged.classList.remove('dragging');
      list.classList.remove('reordering');
      if (to !== from) onDrop(from, to);
    };
    place();
    frame = requestAnimationFrame(autoScroll);
    return { move, end };
  }

  list.addEventListener('touchstart', (e) => {
    const grip = e.target.closest(handle);
    if (!grip || e.touches.length > 1) return;
    e.preventDefault(); // no scrolling, no tap/click on the handle
    const id = e.changedTouches[0].identifier;
    const drag = begin(grip, e.changedTouches[0].clientY);
    if (!drag) return;
    const find = (ev) => [...ev.changedTouches].find((t) => t.identifier === id);
    const onMove = (ev) => {
      const t = find(ev);
      if (!t) return;
      ev.preventDefault();
      drag.move(t.clientY);
    };
    const onEnd = (ev) => {
      if (!find(ev)) return;
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      drag.end();
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
  }, { passive: false });

  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest(handle);
    if (!grip || e.button > 0 || e.pointerType === 'touch') return;
    e.preventDefault();
    const drag = begin(grip, e.clientY);
    if (!drag) return;
    grip.setPointerCapture(e.pointerId);
    const onMove = (ev) => drag.move(ev.clientY);
    const onEnd = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onEnd);
      grip.removeEventListener('pointercancel', onEnd);
      drag.end();
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onEnd);
    grip.addEventListener('pointercancel', onEnd);
  });
}
