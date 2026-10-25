import { h, debounce, toast, sheet, mount } from '../dom.js';
import * as store from '../store.js';
import { DAY_TYPES, EQUIPMENT, RATIOS } from '../library.js';
import { weekStart, fullDate, addDays, weekdayLong } from '../dates.js';
import { startTimer } from '../timer.js';
import { pickExercise } from './picker.js';

export async function renderDay(root, { date }) {
  let day = await store.getDay(date);
  const settings = await store.getSettings();
  const previous = {}; // variantKey -> last session before this date
  let lastSame = null; // last day with the same workout title

  const save = debounce(() => store.saveDay(day), 300);
  // Save immediately when navigating away mid-edit.
  window.addEventListener('hashchange', () => save.flush(), { once: true });

  async function refresh() {
    for (const ex of day.exercises) {
      const k = store.variantKey(ex);
      if (!(k in previous)) previous[k] = await store.lastSession(ex, date);
    }
    lastSame = day.exercises.length ? null : await store.previousSameWorkout(day);
  }

  async function commit() {
    await save.flush();
    await refresh();
    draw();
  }

  const fmtPrev = (ex, s) => {
    if (!s || !store.hasData(s)) return '—';
    if (store.isCardio(ex)) {
      return [s.min != null && `${store.fmtNum(s.min)}′`, s.km != null && `${store.fmtNum(s.km)}km`].filter(Boolean).join(' ') || '✓';
    }
    const w = s.weight != null ? `${store.fmtNum(s.weight)}${ex.unit}` : 'BW';
    return s.reps ? `${w} × ${s.reps}` : w;
  };

  // ---- Workout type ----
  function typeSection() {
    const select = h(
      'select',
      {
        class: 'select type-select', value: day.type,
        onchange: (e) => {
          day.type = e.target.value;
          day.title = day.type === 'Custom' ? '' : day.type;
          commit();
        },
      },
      h('option', { value: '' }, 'Choose workout type…'),
      DAY_TYPES.map((t) => h('option', { value: t }, t)),
      h('option', { value: 'Custom' }, 'Custom…')
    );
    return h(
      'div',
      { class: 'type-row' },
      select,
      day.type === 'Custom'
        ? h('input', {
            class: 'text', type: 'text', placeholder: 'Workout name', value: day.title, autocapitalize: 'words',
            oninput: (e) => { day.title = e.target.value; save(); },
            onchange: () => commit(),
          })
        : null
    );
  }

  // ---- Exercise card ----
  function exerciseCard(ex, idx) {
    const prev = previous[store.variantKey(ex)];
    const cardio = store.isCardio(ex);
    const setup = (patch) => {
      Object.assign(ex, patch);
      if (ex.equipment === 'Cable') ex.ratio ||= '1:1';
      else ex.ratio = null;
      commit();
    };
    return h(
      'section',
      { class: 'ex-card' },
      h(
        'div',
        { class: 'ex-head' },
        h('a', { class: 'ex-name', href: `#/exercise/${encodeURIComponent(ex.exId)}` }, ex.name),
        h('button', { class: 'icon-btn small', 'aria-label': 'Exercise options', onclick: () => exerciseMenu(idx) }, '⋯')
      ),
      h(
        'div',
        { class: 'ex-setup' },
        h('select', { class: 'select small', value: ex.equipment, onchange: (e) => setup({ equipment: e.target.value }) },
          EQUIPMENT.map((x) => h('option', { value: x }, x))),
        ex.equipment === 'Cable'
          ? h('select', { class: 'select small', value: ex.ratio, onchange: (e) => setup({ ratio: e.target.value }) },
              RATIOS.map((r) => h('option', { value: r }, `${r} cable`)))
          : null,
        cardio
          ? null
          : h('div', { class: 'seg' }, ['kg', 'lbs'].map((u) =>
              h('button', { class: u === ex.unit ? 'on' : '', onclick: () => ex.unit !== u && setup({ unit: u }) }, u)))
      ),
      prev ? h('div', { class: 'ex-last' }, `Last: ${fullDate(prev.date)}`) : null,
      h(
        'div',
        { class: `sets ${cardio ? 'cardio' : ''}` },
        h('div', { class: 'set-row head' },
          h('span', null, 'SET'), h('span', null, 'PREVIOUS'),
          h('span', null, cardio ? 'MIN' : ex.unit.toUpperCase()), h('span', null, cardio ? 'KM' : 'REPS'), h('span', null, '✓')),
        ex.sets.map((s, si) => setRow(ex, s, si, prev?.ex.sets[si]))
      ),
      h('button', { class: 'btn ghost add-set', onclick: () => { ex.sets.push(store.newSet(ex.sets[ex.sets.length - 1])); commit(); } }, '+ Add set')
    );
  }

  function setRow(ex, s, si, prevSet) {
    const cardio = store.isCardio(ex);
    const row = h('div', { class: `set-row ${s.done ? 'done' : ''}` });
    const numInput = (field, mode, placeholder) =>
      h('input', {
        class: 'num', type: 'text', inputmode: mode, placeholder: placeholder ?? '', value: store.fmtNum(s[field]),
        oninput: (e) => { s[field] = store.parseNum(e.target.value); save(); },
      });

    let a, b;
    if (cardio) {
      a = numInput('min', 'decimal', store.fmtNum(prevSet?.min) || '0');
      b = numInput('km', 'decimal', store.fmtNum(prevSet?.km) || '0');
    } else {
      a = numInput('weight', 'decimal', store.fmtNum(prevSet?.weight) || '0');
      // Text so "7+3" works; the phone keypad has a + key.
      b = h('input', {
        class: 'num', type: 'text', inputmode: 'tel', placeholder: prevSet?.reps || '0', value: s.reps ?? '',
        oninput: (e) => { s.reps = e.target.value.trim(); save(); },
      });
    }
    // Copies last time's numbers: every field when `overwrite`, otherwise only blank ones.
    const fill = (from, overwrite) => {
      const fields = cardio ? ['min', 'km', 'note'] : ['weight', 'reps'];
      for (const f of fields) {
        const blank = s[f] == null || s[f] === '';
        if ((overwrite || blank) && from[f] != null && from[f] !== '') s[f] = from[f];
      }
      a.value = store.fmtNum(cardio ? s.min : s.weight);
      b.value = cardio ? store.fmtNum(s.km) : s.reps;
      if (note) note.value = s.note || '';
      save();
    };

    row.append(
      h('button', { class: 'set-num', 'aria-label': `Set ${si + 1} options`, onclick: () => setMenu(ex, si) }, si + 1),
      h('button', { class: 'prev', title: 'Copy previous', onclick: () => prevSet && fill(prevSet, true) }, fmtPrev(ex, prevSet)),
      a,
      b,
      h('button', {
        class: `check ${s.done ? 'on' : ''}`, 'aria-label': 'Mark set done',
        onclick: (e) => {
          // Blank fields take last time's numbers when ticked.
          if (!s.done && prevSet) fill(prevSet, false);
          s.done = !s.done;
          row.classList.toggle('done', s.done);
          e.currentTarget.classList.toggle('on', s.done);
          save();
          if (s.done && settings.restSeconds > 0 && !cardio) startTimer(settings.restSeconds);
        },
      }, '✓')
    );
    const note = cardio
      ? h('input', {
          class: 'text set-note', type: 'text', placeholder: prevSet?.note || 'Speed / incline / level', value: s.note || '',
          oninput: (e) => { s.note = e.target.value; save(); },
        })
      : null;
    return note ? h('div', { class: 'set-wrap' }, row, note) : row;
  }

  async function setMenu(ex, si) {
    const choice = await sheet(`${ex.name} · Set ${si + 1}`, [{ label: `Delete set ${si + 1}`, value: 'delete', danger: true }]);
    if (choice === 'delete') {
      ex.sets.splice(si, 1);
      commit();
    }
  }

  async function exerciseMenu(idx) {
    const ex = day.exercises[idx];
    const choice = await sheet(ex.name, [
      { label: 'Info & history', value: 'info' },
      { label: 'Replace exercise', value: 'replace' },
      idx > 0 && { label: 'Move up', value: 'up' },
      idx < day.exercises.length - 1 && { label: 'Move down', value: 'down' },
      { label: 'Delete exercise', value: 'delete', danger: true },
    ].filter(Boolean));
    if (choice === 'info') location.hash = `#/exercise/${encodeURIComponent(ex.exId)}`;
    else if (choice === 'replace') {
      const picked = await pickExercise();
      if (picked) {
        const setup = await defaults(picked);
        Object.assign(ex, { exId: picked.exId, name: picked.name, ...setup });
        commit();
      }
    } else if (choice === 'up' || choice === 'down') {
      const j = choice === 'up' ? idx - 1 : idx + 1;
      [day.exercises[idx], day.exercises[j]] = [day.exercises[j], day.exercises[idx]];
      commit();
    } else if (choice === 'delete' && confirm(`Delete ${ex.name}?`)) {
      day.exercises.splice(idx, 1);
      commit();
    }
  }

  // Equipment/ratio/unit: what you used last time, else the dataset's equipment and default unit.
  async function defaults(picked) {
    const last = await store.lastSetup(picked.exId);
    const equipment = last?.equipment || picked.equipment;
    return {
      equipment,
      ratio: equipment === 'Cable' ? last?.ratio || '1:1' : null,
      unit: last?.unit || settings.unit,
    };
  }

  async function addExercise() {
    const picked = await pickExercise();
    if (!picked) return;
    day.exercises.push(store.newExercise({ ...picked, ...(await defaults(picked)) }));
    await commit();
    root.querySelector('.ex-card:last-of-type')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function dayMenu() {
    const templates = await store.getTemplates();
    const choice = await sheet('Workout', [
      ...templates.map((t) => ({ label: `📋 Load template: ${t.name}`, value: { tpl: t } })),
      { label: 'Save as template', value: { save: true } },
    ]);
    if (!choice) return;
    if (choice.tpl) {
      day = store.applyTemplate(choice.tpl, day);
      if (!day.title) { day.type = DAY_TYPES.includes(choice.tpl.name) ? choice.tpl.name : 'Custom'; day.title = choice.tpl.name; }
      commit();
    } else {
      if (!day.exercises.length) return toast('Add exercises first');
      const name = prompt('Template name', day.title || '')?.trim();
      if (!name) return;
      await store.saveTemplateFromDay(name, day);
      toast(`Saved template "${name}"`);
    }
  }

  function draw() {
    const scrollY = window.scrollY;
    const rest = day.type === 'Rest';
    mount(
      root,
      h(
        'header',
        { class: 'topbar' },
        h('a', { class: 'icon-btn', href: `#/week/${weekStart(date)}`, 'aria-label': 'Back to week' }, '‹'),
        h('div', { class: 'topbar-title' }, h('div', null, weekdayLong(date)), h('div', { class: 'sub' }, fullDate(date))),
        h('button', { class: 'icon-btn', 'aria-label': 'Next day', onclick: () => (location.hash = `#/day/${addDays(date, 1)}`) }, '›')
      ),
      h('div', { class: 'type-wrap' }, typeSection(), h('button', { class: 'icon-btn small', 'aria-label': 'Templates', onclick: dayMenu }, '⋯')),
      lastSame && !rest
        ? h('button', { class: 'btn secondary wide', onclick: () => { day = store.repeatExercises(lastSame, day); commit(); } },
            `↺ Repeat last ${day.title} (${fullDate(lastSame.date)})`)
        : null,
      rest ? h('p', { class: 'empty' }, 'Rest day. Recover well 💤') : null,
      day.exercises.map(exerciseCard),
      rest ? null : h('button', { class: 'btn primary wide add-ex-btn', onclick: addExercise }, '+ Add exercise'),
      h('label', { class: 'label' }, 'Notes'),
      h('textarea', {
        class: 'notes', rows: 3, placeholder: 'How did it feel? Energy, pain, PRs…', value: day.notes,
        oninput: (e) => { day.notes = e.target.value; save(); },
      })
    );
    window.scrollTo(0, scrollY);
  }

  await refresh();
  draw();
}
