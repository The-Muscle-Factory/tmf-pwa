// Dataset details for an exercise: equipment, muscles, photos, instructions.
import { h } from '../dom.js';
import { imageUrl } from '../library.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function exerciseSummary(entry) {
  return [entry.equipment, ...entry.primary.map(cap)].join(' · ');
}

export function infoBlock(entry) {
  return h(
    'div',
    { class: 'info' },
    h(
      'div',
      { class: 'chips' },
      h('span', { class: 'chip' }, entry.equipment),
      entry.level ? h('span', { class: 'chip faded' }, cap(entry.level)) : null,
      entry.primary.map((m) => h('span', { class: 'chip muscle' }, cap(m))),
      entry.secondary.map((m) => h('span', { class: 'chip faded' }, cap(m)))
    ),
    entry.images.length
      ? h(
          'div',
          { class: 'info-images' },
          entry.images.map((p) => h('img', { src: imageUrl(p), alt: '', loading: 'lazy', onerror: (e) => e.target.remove() }))
        )
      : null,
    entry.instructions.length
      ? h('details', { class: 'info-steps' }, h('summary', null, 'How to do it'), h('ol', null, entry.instructions.map((s) => h('li', null, s))))
      : null
  );
}

// Full-screen overlay version, used from the exercise picker.
export function showInfo(entry) {
  const overlay = h(
    'div',
    { class: 'overlay' },
    h(
      'div',
      { class: 'overlay-head' },
      h('button', { class: 'btn ghost', onclick: () => overlay.remove() }, 'Close'),
      h('div', { class: 'overlay-title' }, entry.name),
      h('span', { class: 'spacer' })
    ),
    h('div', { class: 'overlay-body' }, infoBlock(entry))
  );
  document.body.append(overlay);
}
