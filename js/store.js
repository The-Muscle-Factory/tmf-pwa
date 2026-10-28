// Domain layer: workout days, templates, settings, backup. Pure data — no DOM.
//
// Day shape (v2):
//   { v: 2, date: 'YYYY-MM-DD', type: 'Push' | … | 'Custom' | '', title: 'Push', notes: '',
//     exercises: [Exercise] }
// Exercise:
//   { id, exId: dataset id or 'custom:<slug>', name, equipment, ratio: '1:1'|'2:1'|null,
//     unit: 'kg'|'lbs', sets: [Set] }
// Set: strength { weight: number|null (in the exercise's unit), reps: string, done }
//      cardio   { min: number|null, km: number|null, note: string, done }
// An exercise is cardio when its equipment is 'Cardio'. An exercise you planned
// but couldn't do has `skipped: { note }`; one brought back by "Repeat last"
// after being skipped has `skippedBefore: { date, note }`. A drop set has
// `drop: true` and records only its starting weight. Older data simply lacks
// these optional fields. Skipped exercises never count as a session.
import * as db from './db.js';
import { weekDays } from './dates.js';
import { loadLibrary, movementFamily } from './library.js';
import { upgradeDay, upgradeTemplate } from './legacy.js';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const emptyDay = (date) => ({ v: 2, date, type: '', title: '', notes: '', exercises: [] });
export const isCardio = (ex) => ex.equipment === 'Cardio';
export const variantKey = (ex) => `${ex.exId}|${ex.equipment}|${ex.equipment === 'Cable' ? ex.ratio || '1:1' : ''}`;

export const newSet = (prev, { drop = false } = {}) =>
  ({ weight: prev?.weight ?? null, reps: '', min: null, km: null, note: '', done: false, ...(drop ? { drop: true } : {}) });

export const hasData = (s) =>
  s.weight != null || !!String(s.reps ?? '').trim() || s.min != null || s.km != null || !!s.note?.trim();

export function newExercise({ exId, name, equipment, ratio, unit }) {
  return {
    id: uid(),
    exId,
    name,
    equipment,
    ratio: equipment === 'Cable' ? ratio || '1:1' : null,
    unit: unit || 'kg',
    sets: [newSet()],
  };
}

export const isEmptyDay = (day) => !day.type && !day.title && !day.notes.trim() && day.exercises.length === 0;

// Upgrades anything stored in an older format. Runs once at startup.
export async function migrate() {
  await loadLibrary();
  for (const d of await db.getAll('days')) if (d.v !== 2) await db.put('days', upgradeDay(d, uid));
  for (const t of await db.getAll('templates')) if (t.v !== 2) await db.put('templates', upgradeTemplate(t));
}

// ---- Days ----
export async function getDay(date) {
  return (await db.get('days', date)) || emptyDay(date);
}

export async function saveDay(day) {
  if (isEmptyDay(day)) return db.del('days', day.date);
  return db.put('days', day);
}

export async function getWeek(startIso) {
  const days = weekDays(startIso);
  const stored = await db.getRange('days', days[0], days[6]);
  const byDate = Object.fromEntries(stored.map((d) => [d.date, d]));
  return days.map((d) => byDate[d] || emptyDay(d));
}

const allDaysDesc = async () => (await db.getAll('days')).sort((a, b) => b.date.localeCompare(a.date));

// Sessions of an exercise, newest first. `match` filters exercise entries.
async function sessions(match, before) {
  const out = [];
  for (const day of await allDaysDesc()) {
    if (before && day.date >= before) continue;
    for (const ex of day.exercises) {
      if (!ex.skipped && match(ex) && ex.sets.some(hasData)) out.push({ date: day.date, title: day.title, ex });
    }
  }
  return out;
}

export const historyFor = (exId) => sessions((e) => e.exId === exId);

export async function lastSession(ex, beforeDate) {
  const key = variantKey(ex);
  return (await sessions((e) => variantKey(e) === key, beforeDate))[0] || null;
}

// Sessions of any variation of the same movement (e.g. every squat), on
// dates from `since` up to but not including `before`.
export async function familySessions(ex, since, before) {
  const { key } = movementFamily(ex);
  return (await sessions((e) => movementFamily(e).key === key, before)).filter((s) => s.date >= since);
}

// Equipment/ratio/unit you used last time for this exercise, to preselect them.
export async function lastSetup(exId) {
  for (const day of await allDaysDesc()) {
    const ex = day.exercises.find((e) => e.exId === exId);
    if (ex) return { equipment: ex.equipment, ratio: ex.ratio, unit: ex.unit };
  }
  return null;
}

// Exercises you've logged, most recent first, one per exercise id.
export async function recentExercises() {
  const seen = new Map();
  for (const day of await allDaysDesc()) {
    for (const ex of day.exercises) {
      if (ex.skipped) continue;
      const s = seen.get(ex.exId);
      if (s) s.count++;
      else seen.set(ex.exId, { exId: ex.exId, name: ex.name, equipment: ex.equipment, last: day.date, count: 1 });
    }
  }
  return [...seen.values()];
}

// Most recent day before `date` with the same workout title (e.g. the last "Push").
export async function previousSameWorkout(day) {
  const title = day.title.trim().toLowerCase();
  if (!title) return null;
  return (await allDaysDesc()).find((d) => d.date < day.date && d.title.trim().toLowerCase() === title && d.exercises.length) || null;
}

// Appends another day's exercises with one empty set each; PREVIOUS shows the old numbers.
// Exercises skipped last time are flagged so the card can say so; a first set
// that was a drop set starts as one again.
export function repeatExercises(source, day) {
  const copies = source.exercises.map((e) => {
    const ex = newExercise(e);
    if (e.sets?.[0]?.drop) ex.sets[0].drop = true;
    if (e.skipped) ex.skippedBefore = { date: source.date, note: e.skipped.note || '' };
    return ex;
  });
  return { ...day, exercises: [...day.exercises, ...copies] };
}

// ---- Templates ----
// Template shape: { v: 2, id, name, exercises: [{ exId, name, equipment, ratio, unit }] }
export async function getTemplates() {
  return (await db.getAll('templates')).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveTemplateFromDay(name, day) {
  const existing = (await getTemplates()).find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
  const tpl = {
    v: 2,
    id: existing?.id || uid(),
    name: name.trim(),
    exercises: day.exercises.map(({ exId, name: n, equipment, ratio, unit }) => ({ exId, name: n, equipment, ratio, unit })),
  };
  await db.put('templates', tpl);
  return tpl;
}

export const deleteTemplate = (id) => db.del('templates', id);

export const applyTemplate = (tpl, day) => repeatExercises(tpl, day);

// ---- Settings ----
export const DEFAULT_SETTINGS = { unit: 'kg', restSeconds: 90 };

export async function getSettings() {
  const row = await db.get('settings', 'app');
  return { ...DEFAULT_SETTINGS, ...(row?.value || {}) };
}

export async function saveSettings(value) {
  await db.put('settings', { key: 'app', value });
}

// ---- Numbers ----
const LB_PER_KG = 2.2046226218;
export const toKg = (w, unit) => (unit === 'lbs' ? w / LB_PER_KG : w);
export const fromKg = (kg, unit) => (unit === 'lbs' ? kg * LB_PER_KG : kg);
export const fmtNum = (n) => (n == null ? '' : String(Math.round(n * 100) / 100));
export const parseNum = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
};
// Text for one logged set, e.g. "60 kg × 8", "10 kg × 8+6 · drop", "20 min · 3 km".
export function setLabel(ex, s, { withNote = false } = {}) {
  if (isCardio(ex)) {
    return [s.min != null && `${fmtNum(s.min)} min`, s.km != null && `${fmtNum(s.km)} km`, withNote && s.note]
      .filter(Boolean).join(' · ') || '✓';
  }
  const text = `${s.weight != null ? `${fmtNum(s.weight)} ${ex.unit}` : 'BW'} × ${s.reps || '?'}`;
  return s.drop ? `${text} · drop` : text;
}

// "7+3" -> 10
export const repsTotal = (reps) => (String(reps ?? '').match(/\d+/g) || []).reduce((a, b) => a + Number(b), 0);

// ---- Backup ----
export async function exportAll() {
  return {
    app: 'tmf-pwa',
    version: 2,
    exportedAt: new Date().toISOString(),
    days: await db.getAll('days'),
    templates: await db.getAll('templates'),
    settings: await getSettings(),
  };
}

function validateBackup(data) {
  if (!data || data.app !== 'tmf-pwa' || !Array.isArray(data.days)) {
    throw new Error('Not a TMF backup file');
  }
}

export async function importAll(data) {
  validateBackup(data);
  await loadLibrary();
  await db.clear('days');
  await db.clear('templates');
  for (const d of data.days) await db.put('days', upgradeDay(d, uid));
  for (const t of data.templates || []) await db.put('templates', upgradeTemplate(t));
  if (data.settings) await saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
}

// Adds imported days without losing anything already logged. On a date that
// already has a workout, only exercises not already there are appended, so
// importing the same file twice doesn't duplicate anything.
export async function mergeImport(data) {
  validateBackup(data);
  await loadLibrary();
  let added = 0;
  let merged = 0;
  for (const raw of data.days) {
    const incoming = upgradeDay(raw, uid);
    const existing = await db.get('days', incoming.date);
    if (!existing) {
      await db.put('days', incoming);
      added++;
      continue;
    }
    const have = new Set(existing.exercises.map(variantKey));
    const extra = incoming.exercises.filter((e) => !have.has(variantKey(e)));
    const notes = existing.notes.trim() ? existing.notes : incoming.notes;
    if (!extra.length && notes === existing.notes && (existing.title || !incoming.title)) continue;
    await db.put('days', {
      ...existing,
      type: existing.type || incoming.type,
      title: existing.title || incoming.title,
      notes,
      exercises: [...existing.exercises, ...extra.map((e) => ({ ...e, id: uid() }))],
    });
    merged++;
  }
  const names = new Set((await getTemplates()).map((t) => t.name.toLowerCase()));
  for (const t of data.templates || []) {
    if (!names.has(t.name.toLowerCase())) await db.put('templates', { ...upgradeTemplate(t), id: uid() });
  }
  return { added, merged };
}
