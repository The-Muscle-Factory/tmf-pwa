import { h, mount } from '../dom.js';
import * as store from '../store.js';
import { addDays, weekStart, todayISO, weekdayShort, dayMonth, fromISO } from '../dates.js';

export async function renderWeek(root, { date }) {
  const start = weekStart(date);
  const days = await store.getWeek(start);
  const today = todayISO();
  const thisWeek = weekStart(today);

  const end = addDays(start, 6);
  const sameYear = fromISO(start).getFullYear() === fromISO(today).getFullYear();
  const range = `${dayMonth(start)} – ${dayMonth(end)}${sameYear ? '' : ` ${fromISO(end).getFullYear()}`}`;

  const workouts = days.filter((d) => d.exercises.length).length;
  const totalSets = days.reduce((n, d) => n + d.exercises.reduce((m, e) => m + (e.skipped ? 0 : e.sets.filter((s) => s.done).length), 0), 0);

  mount(root,
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Previous week', onclick: () => (location.hash = `#/week/${addDays(start, -7)}`) }, '‹'),
      h(
        'div',
        { class: 'topbar-title' },
        h('div', null, range),
        h('div', { class: 'sub' }, start === thisWeek ? 'This week' : h('a', { href: `#/week/${thisWeek}` }, 'Go to this week'))
      ),
      h('button', { class: 'icon-btn', 'aria-label': 'Next week', onclick: () => (location.hash = `#/week/${addDays(start, 7)}`) }, '›')
    ),
    h(
      'div',
      { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, workouts), h('span', null, 'workouts')),
      h('div', { class: 'stat' }, h('b', null, totalSets), h('span', null, 'sets done'))
    ),
    h(
      'div',
      { class: 'day-list' },
      days.map((d) => {
        const done = d.exercises.filter((e) => !e.skipped);
        const skipped = d.exercises.length - done.length;
        const doneSets = done.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
        const allSets = done.reduce((n, e) => n + e.sets.length, 0);
        return h(
          'a',
          { class: `day-card ${d.date === today ? 'today' : ''} ${d.exercises.length ? 'logged' : ''}`, href: `#/day/${d.date}` },
          h('div', { class: 'day-date' }, h('div', { class: 'dow' }, weekdayShort(d.date)), h('div', { class: 'dom' }, fromISO(d.date).getDate())),
          h(
            'div',
            { class: 'day-body' },
            h('div', { class: 'day-title' }, d.title || (d.exercises.length ? 'Workout' : 'No workout logged')),
            d.exercises.length
              ? h('div', { class: 'day-meta' }, `${d.exercises.length} exercises · ${doneSets}/${allSets} sets${skipped ? ` · ${skipped} skipped` : ''}`)
              : d.notes
                ? h('div', { class: 'day-meta' }, d.notes.slice(0, 60))
                : null
          ),
          h('div', { class: 'chev' }, '›')
        );
      })
    )
  );
}
