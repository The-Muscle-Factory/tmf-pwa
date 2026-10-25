// Hash router + boot. Routes: #/week/:date, #/day/:date, #/exercises, #/history/:name, #/settings
import { h } from './dom.js';
import { todayISO, weekStart, isValidISO } from './dates.js';
import { mountTimer } from './timer.js';
import { renderWeek } from './views/week.js';
import { renderDay } from './views/day.js';
import { renderExercises, renderHistory } from './views/history.js';
import { renderSettings } from './views/settings.js';

const main = document.getElementById('main');
const tabs = document.getElementById('tabs');

function parse() {
  const [, view, ...rest] = location.hash.split('/');
  const arg = decodeURIComponent(rest.join('/'));
  if (view === 'week' && isValidISO(arg)) return { tab: 'week', render: renderWeek, params: { date: arg } };
  if (view === 'day' && isValidISO(arg)) return { tab: arg === todayISO() ? 'today' : 'week', render: renderDay, params: { date: arg } };
  if (view === 'exercises') return { tab: 'exercises', render: renderExercises, params: {} };
  if (view === 'history' && arg) return { tab: 'exercises', render: renderHistory, params: { name: arg } };
  if (view === 'settings') return { tab: 'settings', render: renderSettings, params: {} };
  return null;
}

let renderId = 0;
async function route({ keepScroll = false } = {}) {
  const r = parse();
  if (!r) {
    location.replace(`#/day/${todayISO()}`);
    return;
  }
  const id = ++renderId;
  const container = h('div', { class: 'view' });
  await r.render(container, r.params, () => route({ keepScroll: true }));
  if (id !== renderId) return; // a newer navigation won
  main.replaceChildren(container);
  if (!keepScroll) window.scrollTo(0, 0);
  for (const a of tabs.querySelectorAll('a')) a.classList.toggle('on', a.dataset.tab === r.tab);
}

tabs.replaceChildren(
  h('a', { href: `#/week/${weekStart(todayISO())}`, 'data-tab': 'week', onclick: (e) => { e.currentTarget.href = `#/week/${weekStart(todayISO())}`; } }, h('span', { class: 'ti' }, '📅'), 'Week'),
  h('a', { href: `#/day/${todayISO()}`, 'data-tab': 'today', onclick: (e) => { e.currentTarget.href = `#/day/${todayISO()}`; } }, h('span', { class: 'ti' }, '🏋️'), 'Today'),
  h('a', { href: '#/exercises', 'data-tab': 'exercises' }, h('span', { class: 'ti' }, '📈'), 'Exercises'),
  h('a', { href: '#/settings', 'data-tab': 'settings' }, h('span', { class: 'ti' }, '⚙️'), 'Settings')
);

window.addEventListener('hashchange', () => route());
mountTimer(document.getElementById('timer'));
route();

navigator.storage?.persist?.();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
