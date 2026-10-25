import { h, mount } from '../dom.js';
import * as store from '../store.js';
import { byId, search, loadLibrary } from '../library.js';
import { fullDate } from '../dates.js';
import { infoBlock, exerciseSummary } from './exercise-info.js';

const link = (exId) => `#/exercise/${encodeURIComponent(exId)}`;

export async function renderExercises(root) {
  await loadLibrary();
  const recent = await store.recentExercises();
  const list = h('div', { class: 'list' });
  const input = h('input', { class: 'text search', type: 'search', placeholder: 'Search 870+ exercises', oninput: () => draw() });

  const item = (exId, name, sub) =>
    h('a', { class: 'list-item', href: link(exId) },
      h('div', null, h('div', null, name), h('div', { class: 'muted small' }, sub)), h('span', { class: 'chev' }, '›'));

  function draw() {
    const q = input.value.trim();
    const rows = q
      ? search(q, { preferIds: new Set(recent.map((r) => r.exId)) }).slice(0, 100).map((e) => item(e.id, e.name, exerciseSummary(e)))
      : recent.map((r) => item(r.exId, r.name, `${r.equipment} · ${r.count} sessions · last ${fullDate(r.last)}`));
    list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'list-item muted' }, q ? 'No matches' : 'Log a workout and your exercises show up here.')]));
  }

  mount(
    root,
    h('header', { class: 'topbar' }, h('div', { class: 'topbar-title' }, h('div', null, 'Exercises'))),
    h('div', { class: 'picker-search' }, input),
    h('h3', { class: 'label' }, 'Your exercises'),
    list
  );
  draw();
}

// Epley estimated one-rep max.
const e1rm = (kg, reps) => (kg && reps ? kg * (1 + reps / 30) : 0);

export async function renderExercise(root, { exId }) {
  await loadLibrary();
  const entry = byId(exId);
  const { unit: displayUnit } = await store.getSettings();
  const sessions = await store.historyFor(exId);
  const name = entry?.name || sessions[0]?.ex.name || 'Exercise';

  // Group by equipment/ratio so 1:1 and 2:1 cable numbers never mix.
  const groups = new Map();
  for (const s of sessions) {
    const label = s.ex.equipment === 'Cable' ? `Cable ${s.ex.ratio}` : s.ex.equipment;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(s);
  }

  const w = (kg) => `${store.fmtNum(Math.round(store.fromKg(kg, displayUnit) * 10) / 10)} ${displayUnit}`;

  function group(label, list) {
    const cardio = store.isCardio(list[0].ex);
    let best = null;
    let bestE1rm = 0;
    if (!cardio) {
      for (const { ex } of list) {
        for (const s of ex.sets) {
          if (s.weight == null) continue;
          const kg = store.toKg(s.weight, ex.unit);
          const reps = store.repsTotal(s.reps);
          if (!best || kg > best.kg || (kg === best.kg && reps > best.reps)) best = { kg, reps };
          bestE1rm = Math.max(bestE1rm, e1rm(kg, reps));
        }
      }
    }
    const setText = (ex, s) =>
      cardio
        ? [s.min != null && `${store.fmtNum(s.min)} min`, s.km != null && `${store.fmtNum(s.km)} km`, s.note].filter(Boolean).join(' · ')
        : `${s.weight != null ? `${store.fmtNum(s.weight)} ${ex.unit}` : 'BW'} × ${s.reps || '?'}`;
    return [
      h('h3', { class: 'label' }, `${label} · ${list.length} sessions`),
      best
        ? h('div', { class: 'stats' },
            h('div', { class: 'stat' }, h('b', null, w(best.kg)), h('span', null, best.reps ? `heaviest × ${best.reps}` : 'heaviest')),
            h('div', { class: 'stat' }, h('b', null, bestE1rm ? w(bestE1rm) : '—'), h('span', null, 'est. 1RM')))
        : null,
      list.map(({ date, title, ex }) =>
        h('a', { class: 'hist-card', href: `#/day/${date}` },
          h('div', { class: 'hist-head' }, h('b', null, fullDate(date)), title ? h('span', { class: 'muted' }, title) : null),
          h('div', { class: 'chips' },
            ex.sets.filter(store.hasData).map((s) => h('span', { class: `chip ${s.done ? '' : 'faded'}` }, setText(ex, s))))))
    ];
  }

  mount(
    root,
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => history.back() }, '‹'),
      h('div', { class: 'topbar-title' }, h('div', null, name), h('div', { class: 'sub' }, entry ? entry.equipment : 'Custom exercise')),
      h('span', { class: 'icon-btn' })
    ),
    entry ? infoBlock(entry) : null,
    sessions.length ? [...groups].map(([label, list]) => group(label, list)) : h('p', { class: 'empty' }, 'No logged sets for this exercise yet.')
  );
}
