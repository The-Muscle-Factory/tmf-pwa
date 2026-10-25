import { h, debounce, toast, sheet, dialog, panel, svgIcon, mount } from '../dom.js';
import * as store from '../store.js';
import { DAY_TYPES, EQUIPMENT, RATIOS, movementFamily } from '../library.js';
import { weekStart, fullDate, addDays, weekdayLong } from '../dates.js';
import { startTimer } from '../timer.js';
import { swipeToDelete, dragToReorder } from '../gestures.js';
import { pickExercise } from './picker.js';

const HISTORY_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 7v5l3 2"/></svg>';
const GRIP_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
const RECENT_DAYS = 21;

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

  // Applies a destructive change and offers Undo for a few seconds.
  function withUndo(message, change) {
    const before = JSON.parse(JSON.stringify(day));
    change();
    commit();
    toast(message, { action: { label: 'Undo', run: () => { day = before; commit(); } } });
  }

  const deleteExercise = (idx) => {
    const { name } = day.exercises[idx];
    withUndo(`Deleted ${name}`, () => day.exercises.splice(idx, 1));
  };

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
  // Each card sits in a wrapper with a Delete button behind it (swipe left).
  function exerciseItem(ex, idx) {
    const card = ex.skipped ? skippedCard(ex, idx) : exerciseCard(ex, idx);
    const wrap = h('div', { class: 'swipe' },
      h('button', { class: 'swipe-delete', onclick: () => deleteExercise(idx) }, 'Delete'),
      card);
    swipeToDelete(wrap, card, () => deleteExercise(idx));
    return wrap;
  }

  const exHead = (ex, idx, ...extra) =>
    h(
      'div',
      { class: 'ex-head' },
      h('button', { class: 'drag-handle', 'aria-label': 'Drag to reorder' }, svgIcon(GRIP_ICON)),
      h('a', { class: 'ex-name', href: `#/exercise/${encodeURIComponent(ex.exId)}`, draggable: 'false' }, ex.name),
      extra,
      h('button', { class: 'icon-btn small', 'aria-label': 'Exercise options', onclick: () => exerciseMenu(idx) }, '⋯')
    );

  function skippedCard(ex, idx) {
    return h(
      'section',
      { class: 'ex-card skipped' },
      exHead(ex, idx),
      h('div', { class: 'skip-note' }, h('b', null, 'Couldn’t do'), ex.skipped.note ? ` · ${ex.skipped.note}` : '')
    );
  }

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
      exHead(ex, idx,
        h('button', { class: 'icon-btn small recent-btn', 'aria-label': 'Recent sets', onclick: () => recentSets(ex) }, svgIcon(HISTORY_ICON))),
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
    const choice = await sheet(ex.name, ex.skipped
      ? [
          { label: 'Undo “Couldn’t do”', value: 'unskip' },
          { label: 'Edit note', value: 'skip' },
          { label: 'Info & history', value: 'info' },
          { label: 'Delete exercise', value: 'delete', danger: true },
        ]
      : [
          { label: 'Recent sets (last 3 weeks)', value: 'recent' },
          { label: 'Info & history', value: 'info' },
          { label: 'Replace exercise', value: 'replace' },
          { label: 'Couldn’t do…', value: 'skip' },
          { label: 'Delete exercise', value: 'delete', danger: true },
        ]);
    if (choice === 'info') location.hash = `#/exercise/${encodeURIComponent(ex.exId)}`;
    else if (choice === 'recent') recentSets(ex);
    else if (choice === 'replace') {
      const picked = await pickExercise();
      if (picked) {
        const setup = await defaults(picked);
        Object.assign(ex, { exId: picked.exId, name: picked.name, ...setup });
        commit();
      }
    } else if (choice === 'skip') {
      const note = await dialog({
        title: `Couldn’t do ${ex.name}`,
        message: 'What got in the way? (optional)',
        input: { placeholder: 'e.g. ran out of time, shoulder pain', value: ex.skipped?.note },
        confirmLabel: 'Save',
      });
      if (note != null) {
        ex.skipped = { note };
        commit();
      }
    } else if (choice === 'unskip') {
      delete ex.skipped;
      commit();
    } else if (choice === 'delete') deleteExercise(idx);
  }

  // Sets from the last 3 weeks of any variation of this movement (all squats,
  // any equipment), each with a button to copy them into today's exercise.
  async function recentSets(ex) {
    const family = movementFamily(ex);
    const list = await store.familySessions(ex, addDays(date, -RECENT_DAYS), date);
    const setup = (e) => (e.equipment === 'Cable' ? `Cable ${e.ratio}` : e.equipment);
    const setText = (e, st) =>
      store.isCardio(e)
        ? [st.min != null && `${store.fmtNum(st.min)} min`, st.km != null && `${store.fmtNum(st.km)} km`].filter(Boolean).join(' · ') || '✓'
        : `${st.weight != null ? `${store.fmtNum(st.weight)} ${e.unit}` : 'BW'} × ${st.reps || '?'}`;

    const use = async (src) => {
      if (ex.sets.some((st) => st.done) && !(await dialog({
        title: 'Replace today’s sets?',
        message: `${ex.name} already has ticked sets. They’ll be replaced with the sets from ${fullDate(src.date)}.`,
        confirmLabel: 'Replace', danger: true,
      }))) return;
      // Today's card becomes that session's exercise and setup, so the numbers make sense.
      Object.assign(ex, {
        exId: src.ex.exId, name: src.ex.name, equipment: src.ex.equipment, ratio: src.ex.ratio, unit: src.ex.unit,
        sets: src.ex.sets.filter(store.hasData).map((st) => ({ ...store.newSet(), weight: st.weight ?? null, reps: st.reps ?? '', min: st.min ?? null, km: st.km ?? null, note: st.note ?? '' })),
      });
      close();
      commit();
      toast(`Copied ${ex.sets.length} sets from ${fullDate(src.date)}`);
    };

    const close = panel(
      `${family.label} · last 3 weeks`,
      list.length
        ? list.map((src) =>
            h('div', { class: 'recent-card' },
              h('div', { class: 'recent-head' },
                h('div', null,
                  h('b', null, fullDate(src.date)), src.title ? h('span', { class: 'muted' }, ` · ${src.title}`) : null,
                  h('div', { class: 'muted small' }, `${src.ex.name} · ${setup(src.ex)}`)),
                h('button', { class: 'btn secondary small-btn', onclick: () => use(src) }, 'Use these sets')),
              h('div', { class: 'chips' },
                src.ex.sets.filter(store.hasData).map((st) => h('span', { class: `chip ${st.done ? '' : 'faded'}` }, setText(src.ex, st))))))
        : h('p', { class: 'empty' }, `No ${family.label.toLowerCase()} sets in the last 3 weeks.`)
    );
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
    root.querySelector('.ex-list > .swipe:last-child')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function dayMenu() {
    const templates = await store.getTemplates();
    const choice = await sheet('Workout', [
      ...templates.map((t) => ({ label: `📋 Load template: ${t.name}`, value: { tpl: t } })),
      { label: 'Save as template', value: { save: true } },
      !store.isEmptyDay(day) && { label: 'Clear workout', value: { clear: true }, danger: true },
    ].filter(Boolean));
    if (!choice) return;
    if (choice.tpl) {
      day = store.applyTemplate(choice.tpl, day);
      if (!day.title) { day.type = DAY_TYPES.includes(choice.tpl.name) ? choice.tpl.name : 'Custom'; day.title = choice.tpl.name; }
      commit();
    } else if (choice.save) {
      if (!day.exercises.length) return toast('Add exercises first');
      const name = await dialog({ title: 'Save as template', input: { placeholder: 'Template name', value: day.title }, confirmLabel: 'Save' });
      if (!name) return;
      await store.saveTemplateFromDay(name, day);
      toast(`Saved template "${name}"`);
    } else if (choice.clear) {
      const n = day.exercises.length;
      const parts = [day.title && `the workout type (${day.title})`, n && `${n} exercise${n === 1 ? '' : 's'}`, day.notes.trim() && 'your notes'].filter(Boolean);
      const ok = await dialog({
        title: 'Clear this workout?',
        message: `This removes ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')} for ${fullDate(date)}.`,
        confirmLabel: 'Clear workout',
        danger: true,
      });
      if (ok) withUndo('Workout cleared', () => { day = store.emptyDay(date); });
    }
  }

  function exerciseList() {
    const list = h('div', { class: 'ex-list' }, day.exercises.map(exerciseItem));
    dragToReorder(list, {
      item: '.swipe',
      handle: '.drag-handle',
      onDrop: (from, to) => {
        const [moved] = day.exercises.splice(from, 1);
        day.exercises.splice(to, 0, moved);
        commit();
      },
    });
    return list;
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
      h('div', { class: 'type-wrap' }, typeSection(), h('button', { class: 'icon-btn small', 'aria-label': 'Workout options', onclick: dayMenu }, '⋯')),
      lastSame && !rest
        ? h('button', { class: 'btn secondary wide', onclick: () => { day = store.repeatExercises(lastSame, day); commit(); } },
            `↺ Repeat last ${day.title} (${fullDate(lastSame.date)})`)
        : null,
      rest ? h('p', { class: 'empty' }, 'Rest day. Recover well 💤') : null,
      exerciseList(),
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
