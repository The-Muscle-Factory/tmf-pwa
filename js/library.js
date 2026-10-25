// Exercise library from free-exercise-db (public domain), plus the app's fixed lists.
// Pure data — no DOM.

export const DAY_TYPES = ['Push', 'Pull', 'Legs', 'Upper Body', 'Lower Body', 'Arms', 'Abs & Core', 'Full Body', 'Cardio', 'Rest'];

export const EQUIPMENT = [
  'Barbell', 'Dumbbell', 'Cable', 'Machine', 'Plate Machine', 'Smith Machine',
  'EZ Bar', 'Kettlebell', 'Bodyweight', 'Band', 'Cardio', 'Other',
];

export const RATIOS = ['1:1', '2:1'];

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
export const imageUrl = (path) => IMAGE_BASE + path;

let list = [];
let byIdMap = new Map();
let loading;

export function loadLibrary() {
  loading ||= fetch(new URL('../data/exercises.json', import.meta.url))
    .then((r) => r.json())
    .then((data) => {
      list = data;
      byIdMap = new Map(data.map((e) => [e.id, e]));
      for (const e of data) e._hay = haystack(`${e.name} ${e.equipment} ${e.primary.join(' ')}`);
      return list;
    });
  return loading;
}

export const allExercises = () => list;
export const byId = (id) => byIdMap.get(id);
export const isCustomId = (id) => id.startsWith('custom:');

export function customId(name) {
  return 'custom:' + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function findByName(name) {
  const n = name.trim().toLowerCase();
  return list.find((e) => e.name.toLowerCase() === n);
}

// ---- Search ----
const ALIASES = { db: 'dumbbell', bb: 'barbell', rdl: 'romanian deadlift', ohp: 'shoulder press', bicep: 'biceps', tricep: 'triceps' };

function haystack(s) {
  const words = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return { words, squashed: words.replace(/ /g, '') };
}

function tokens(q) {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
    .flatMap((t) => (ALIASES[t] || t).split(' '));
}

// Every query word must appear in the name, equipment or muscles. Exercises in
// `preferIds` (ones you've logged) rank first, then names that start with the query.
export function search(query, { equipment, muscle, preferIds } = {}) {
  const ts = tokens(query);
  const q = ts.join(' ');
  const results = [];
  for (const e of list) {
    if (equipment && e.equipment !== equipment) continue;
    if (muscle && !e.primary.includes(muscle) && !e.secondary.includes(muscle)) continue;
    if (!ts.every((t) => e._hay.words.includes(t) || e._hay.squashed.includes(t))) continue;
    const name = e.name.toLowerCase();
    const rank = preferIds?.has(e.id) ? -1 : !q ? 0 : name.startsWith(q) ? 0 : name.split(/[^a-z0-9]+/).some((w) => w.startsWith(ts[0])) ? 1 : 2;
    results.push([rank, e]);
  }
  return results.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length).map((r) => r[1]);
}

export const MUSCLES = [
  'abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes',
  'hamstrings', 'lats', 'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps',
];
