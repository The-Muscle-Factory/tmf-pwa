import { h, mount } from '../dom.js';
import * as store from '../store.js';
import { fullDate } from '../dates.js';

// Epley estimated one-rep max.
const e1rm = (s) => (s.weight && s.reps ? s.weight * (1 + s.reps / 30) : 0);

export async function renderExercises(root) {
  const names = await store.exerciseNames();
  mount(root,
    h('header', { class: 'topbar' }, h('div', { class: 'topbar-title' }, h('div', null, 'Exercises'))),
    names.length
      ? h('div', { class: 'list' }, names.map((n) => h('a', { class: 'list-item', href: `#/history/${encodeURIComponent(n)}` }, h('span', null, n), h('span', { class: 'chev' }, '›'))))
      : h('p', { class: 'empty' }, 'No exercises yet. Log a workout and they show up here.')
  );
}

export async function renderHistory(root, { name }) {
  const { unit } = await store.getSettings();
  const sessions = await store.exerciseHistory(name);
  const w = (kg) => `${store.toDisplay(kg, unit)} ${unit}`;

  let best = null;
  let bestE1rm = 0;
  for (const sess of sessions) {
    for (const s of sess.sets) {
      if (s.weight != null && (!best || s.weight > best.weight || (s.weight === best.weight && (s.reps || 0) > (best.reps || 0)))) best = s;
      bestE1rm = Math.max(bestE1rm, e1rm(s));
    }
  }

  mount(root,
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => history.back() }, '‹'),
      h('div', { class: 'topbar-title' }, h('div', null, name), h('div', { class: 'sub' }, `${sessions.length} sessions`)),
      h('span', { class: 'icon-btn' })
    ),
    sessions.length
      ? h(
          'div',
          { class: 'stats' },
          h('div', { class: 'stat' }, h('b', null, best ? w(best.weight) : '—'), h('span', null, best?.reps ? `heaviest × ${best.reps}` : 'heaviest')),
          h('div', { class: 'stat' }, h('b', null, bestE1rm ? w(bestE1rm) : '—'), h('span', null, 'est. 1RM'))
        )
      : h('p', { class: 'empty' }, 'No logged sets for this exercise yet.'),
    sessions.map((sess) =>
      h(
        'a',
        { class: 'hist-card', href: `#/day/${sess.date}` },
        h('div', { class: 'hist-head' }, h('b', null, fullDate(sess.date)), sess.title ? h('span', { class: 'muted' }, sess.title) : null),
        h(
          'div',
          { class: 'chips' },
          sess.sets
            .filter((s) => s.weight != null || s.reps != null)
            .map((s) => h('span', { class: `chip ${s.done ? '' : 'faded'}` }, `${s.weight != null ? w(s.weight) : 'BW'} × ${s.reps ?? '?'}`))
        )
      )
    )
  );
}
