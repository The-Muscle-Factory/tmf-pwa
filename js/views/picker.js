// Full-screen exercise search. Resolves with { exId, name, equipment } or null.
import { h } from '../dom.js';
import { search, byId, customId, EQUIPMENT, MUSCLES, loadLibrary } from '../library.js';
import { recentExercises } from '../store.js';
import { exerciseSummary, showInfo } from './exercise-info.js';

export function pickExercise() {
  return new Promise((resolve) => {
    let equipment = '';
    let muscle = '';
    let recent = [];

    const done = (val) => {
      overlay.remove();
      resolve(val);
    };

    const input = h('input', {
      class: 'text search', type: 'search', placeholder: 'Search exercises', autocapitalize: 'off',
      autocorrect: 'off', enterkeyhint: 'search', oninput: () => draw(),
    });
    const results = h('div', { class: 'picker-list' });

    const equipSelect = h(
      'select',
      { class: 'select small', onchange: (e) => { equipment = e.target.value; draw(); } },
      h('option', { value: '' }, 'All equipment'),
      EQUIPMENT.map((x) => h('option', { value: x }, x))
    );
    const muscleSelect = h(
      'select',
      { class: 'select small', onchange: (e) => { muscle = e.target.value; draw(); } },
      h('option', { value: '' }, 'All muscles'),
      MUSCLES.map((m) => h('option', { value: m }, m.charAt(0).toUpperCase() + m.slice(1)))
    );

    const row = (entry, sub) =>
      h(
        'div',
        { class: 'picker-row' },
        h(
          'button',
          { class: 'picker-main', onclick: () => done({ exId: entry.id, name: entry.name, equipment: entry.equipment }) },
          h('div', { class: 'picker-name' }, entry.name),
          h('div', { class: 'picker-sub' }, sub ?? exerciseSummary(entry))
        ),
        entry.instructions ? h('button', { class: 'icon-btn small info-btn', 'aria-label': 'Exercise info', onclick: () => showInfo(entry) }, 'ⓘ') : null
      );

    function draw() {
      const q = input.value.trim();
      const filtered = !!(q || equipment || muscle);
      const items = [];
      if (!filtered && recent.length) {
        items.push(h('div', { class: 'picker-section' }, 'Your exercises'));
        for (const r of recent) {
          const entry = byId(r.exId) || { id: r.exId, name: r.name, equipment: r.equipment, primary: [] };
          items.push(row(entry, `${r.equipment} · ${r.count}×`));
        }
        items.push(h('div', { class: 'picker-section' }, 'All exercises'));
      }
      const found = search(q, { equipment, muscle, preferIds: new Set(recent.map((r) => r.exId)) });
      // Custom exercises you've used also show up in searches.
      const customs = filtered
        ? recent.filter((r) => r.exId.startsWith('custom:') && r.name.toLowerCase().includes(q.toLowerCase()) && (!equipment || r.equipment === equipment) && !muscle)
        : [];
      for (const r of customs) items.push(row({ id: r.exId, name: r.name, equipment: r.equipment, primary: [] }, `${r.equipment} · custom`));
      for (const e of found) items.push(row(e));
      if (q && !found.some((e) => e.name.toLowerCase() === q.toLowerCase()) && !customs.some((r) => r.name.toLowerCase() === q.toLowerCase())) {
        items.push(
          h('button', { class: 'picker-create', onclick: () => done({ exId: customId(q), name: q, equipment: equipment || 'Other' }) },
            `＋ Create “${q}”`)
        );
      }
      if (!items.length) items.push(h('p', { class: 'empty' }, 'No matches'));
      results.replaceChildren(...items);
    }

    const overlay = h(
      'div',
      { class: 'overlay' },
      h(
        'div',
        { class: 'overlay-head' },
        h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Cancel'),
        h('div', { class: 'overlay-title' }, 'Add exercise'),
        h('span', { class: 'spacer' })
      ),
      h('div', { class: 'picker-search' }, input, h('div', { class: 'picker-filters' }, equipSelect, muscleSelect)),
      results
    );
    document.body.append(overlay);
    input.focus(); // inside the tap gesture so iOS shows the keyboard

    Promise.all([loadLibrary(), recentExercises()]).then(([, r]) => {
      recent = r;
      draw();
    });
  });
}
