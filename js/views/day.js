import { h, debounce, toast, sheet, mount } from '../dom.js';
import * as store from '../store.js';
import { weekStart, fullDate, addDays, weekdayLong } from '../dates.js';
import { startTimer } from '../timer.js';

export async function renderDay(root, { date }) {
  let day = await store.getDay(date);
  const settings = await store.getSettings();
  const unit = settings.unit;
  const names = await store.exerciseNames();
  const previous = {}; // exercise name (lowercase) -> last session before this date

  const save = debounce(() => store.saveDay(day), 300);
  // Save immediately when navigating away mid-edit.
  window.addEventListener('hashchange', () => save.flush(), { once: true });

  async function loadPrevious() {
    for (const ex of day.exercises) {
      const k = ex.name.toLowerCase();
      if (!(k in previous)) previous[k] = await store.lastSession(ex.name, date);
    }
  }

  async function commit() {
    await save.flush();
    await loadPrevious();
    draw();
  }

  const fmtSet = (s) => {
    if (!s || (s.weight == null && s.reps == null)) return '—';
    const w = s.weight != null ? `${store.toDisplay(s.weight, unit)}${unit}` : '';
    return s.reps != null ? `${w || 'BW'} × ${s.reps}` : w;
  };

  function exerciseCard(ex, idx) {
    const prev = previous[ex.name.toLowerCase()];
    return h(
      'section',
      { class: 'ex-card' },
      h(
        'div',
        { class: 'ex-head' },
        h('a', { class: 'ex-name', href: `#/history/${encodeURIComponent(ex.name)}` }, ex.name),
        h('button', { class: 'icon-btn small', 'aria-label': 'Exercise options', onclick: () => exerciseMenu(idx) }, '⋯')
      ),
      prev ? h('div', { class: 'ex-last' }, `Last: ${fullDate(prev.date)}`) : null,
      h(
        'div',
        { class: 'sets' },
        h('div', { class: 'set-row head' }, h('span', null, 'SET'), h('span', null, 'PREVIOUS'), h('span', null, unit.toUpperCase()), h('span', null, 'REPS'), h('span', null, '✓')),
        ex.sets.map((s, si) => setRow(ex, s, si, prev?.sets[si]))
      ),
      h(
        'div',
        { class: 'ex-actions' },
        h('button', { class: 'btn ghost', onclick: () => { ex.sets.push(store.newSet(ex.sets[ex.sets.length - 1])); commit(); } }, '+ Add set'),
        ex.sets.length
          ? h('button', { class: 'btn ghost muted', onclick: () => { ex.sets.pop(); commit(); } }, '− Remove set')
          : null
      )
    );
  }

  function setRow(ex, s, si, prevSet) {
    const row = h('div', { class: `set-row ${s.done ? 'done' : ''}` });
    const weight = h('input', {
      class: 'num', type: 'text', inputmode: 'decimal', placeholder: prevSet?.weight != null ? store.toDisplay(prevSet.weight, unit) : '0',
      value: store.toDisplay(s.weight, unit),
      oninput: (e) => { s.weight = store.fromDisplay(e.target.value, unit); save(); },
    });
    const reps = h('input', {
      class: 'num', type: 'text', inputmode: 'numeric', placeholder: prevSet?.reps ?? '0',
      value: s.reps ?? '',
      oninput: (e) => { const n = parseInt(e.target.value, 10); s.reps = Number.isNaN(n) ? null : n; save(); },
    });
    row.append(
      h('span', { class: 'set-num' }, si + 1),
      h('button', {
        class: 'prev', title: 'Copy previous',
        onclick: () => {
          if (!prevSet) return;
          s.weight = prevSet.weight; s.reps = prevSet.reps;
          weight.value = store.toDisplay(s.weight, unit); reps.value = s.reps ?? '';
          save();
        },
      }, fmtSet(prevSet)),
      weight,
      reps,
      h('button', {
        class: `check ${s.done ? 'on' : ''}`, 'aria-label': 'Mark set done',
        onclick: (e) => {
          // Fill blanks from placeholders (previous session) when ticking, like Hevy.
          if (!s.done) {
            if (s.weight == null && prevSet?.weight != null) s.weight = prevSet.weight;
            if (s.reps == null && prevSet?.reps != null) s.reps = prevSet.reps;
            weight.value = store.toDisplay(s.weight, unit); reps.value = s.reps ?? '';
          }
          s.done = !s.done;
          row.classList.toggle('done', s.done);
          e.currentTarget.classList.toggle('on', s.done);
          save();
          if (s.done && settings.restSeconds > 0) startTimer(settings.restSeconds);
        },
      }, '✓')
    );
    return row;
  }

  async function exerciseMenu(idx) {
    const ex = day.exercises[idx];
    const choice = await sheet(ex.name, [
      { label: 'View history', value: 'history' },
      { label: 'Rename', value: 'rename' },
      idx > 0 && { label: 'Move up', value: 'up' },
      idx < day.exercises.length - 1 && { label: 'Move down', value: 'down' },
      { label: 'Delete exercise', value: 'delete', danger: true },
    ].filter(Boolean));
    if (choice === 'history') location.hash = `#/history/${encodeURIComponent(ex.name)}`;
    else if (choice === 'rename') {
      const name = prompt('Exercise name', ex.name)?.trim();
      if (name) { ex.name = name; commit(); }
    } else if (choice === 'up' || choice === 'down') {
      const j = choice === 'up' ? idx - 1 : idx + 1;
      [day.exercises[idx], day.exercises[j]] = [day.exercises[j], day.exercises[idx]];
      commit();
    } else if (choice === 'delete' && confirm(`Delete ${ex.name}?`)) {
      day.exercises.splice(idx, 1);
      commit();
    }
  }

  async function startFrom() {
    const templates = await store.getTemplates();
    const lastWeek = addDays(date, -7);
    const sameTitle = day.title ? await store.previousDayWithTitle(day.title, date) : null;
    const choice = await sheet('Start from', [
      ...templates.map((t) => ({ label: `📋 ${t.name} (${t.exercises.length})`, value: { tpl: t } })),
      sameTitle && { label: `↺ Last "${sameTitle.title}" (${fullDate(sameTitle.date)})`, value: { copy: sameTitle.date } },
      { label: `↺ Last ${weekdayLong(date)} (${fullDate(lastWeek)})`, value: { copy: lastWeek } },
    ].filter(Boolean));
    if (!choice) return;
    if (choice.tpl) day = store.applyTemplate(choice.tpl, day);
    else {
      const copied = await store.copyFromDate(choice.copy, day);
      if (!copied) return toast('Nothing logged that day');
      day = copied;
    }
    commit();
  }

  async function saveTemplate() {
    if (!day.exercises.length) return toast('Add exercises first');
    const name = prompt('Template name', day.title || '')?.trim();
    if (!name) return;
    await store.saveTemplateFromDay(name, day);
    toast(`Saved template "${name}"`);
  }

  function addExercise(input) {
    const name = input.value.trim();
    if (!name) return;
    day.exercises.push(store.newExercise(name));
    input.value = '';
    commit();
  }

  function draw() {
    const scrollY = window.scrollY;
    const addInput = h('input', {
      class: 'text', type: 'text', placeholder: 'Add exercise (e.g. Bench Press)', list: 'exercise-names',
      autocapitalize: 'words', enterkeyhint: 'done',
      onkeydown: (e) => e.key === 'Enter' && addExercise(e.target),
    });
    mount(root,
      h(
        'header',
        { class: 'topbar' },
        h('a', { class: 'icon-btn', href: `#/week/${weekStart(date)}`, 'aria-label': 'Back to week' }, '‹'),
        h('div', { class: 'topbar-title' }, h('div', null, weekdayLong(date)), h('div', { class: 'sub' }, fullDate(date))),
        h('button', { class: 'icon-btn', 'aria-label': 'Next day', onclick: () => (location.hash = `#/day/${addDays(date, 1)}`) }, '›')
      ),
      h('input', {
        class: 'title-input', type: 'text', placeholder: 'Workout name (e.g. Push Day)', value: day.title,
        autocapitalize: 'words', oninput: (e) => { day.title = e.target.value; save(); },
      }),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn secondary', onclick: startFrom }, day.exercises.length ? '+ Add from template' : 'Start from template / last week')
      ),
      day.exercises.map(exerciseCard),
      h('div', { class: 'add-ex' }, addInput, h('button', { class: 'btn primary', onclick: () => addExercise(addInput) }, 'Add')),
      h('datalist', { id: 'exercise-names' }, names.map((n) => h('option', { value: n }))),
      h('label', { class: 'label' }, 'Notes'),
      h('textarea', {
        class: 'notes', rows: 3, placeholder: 'How did it feel? Energy, pain, PRs…', value: day.notes,
        oninput: (e) => { day.notes = e.target.value; save(); },
      }),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn ghost', onclick: saveTemplate }, 'Save as template'))
    );
    window.scrollTo(0, scrollY);
  }

  await loadPrevious();
  draw();
}
