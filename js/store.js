// Domain layer: workout days, templates, settings, backup. Pure data — no DOM.
//
// Day shape:
//   { date: 'YYYY-MM-DD', title: 'Push Day', notes: '',
//     exercises: [{ id, name, sets: [{ weight: kg|null, reps: int|null, done: bool }] }] }
// Weights are always stored in kg; the UI converts for display.
import * as db from './db.js';
import { weekDays } from './dates.js';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const emptyDay = (date) => ({ date, title: '', notes: '', exercises: [] });
export const newSet = (prev) => ({ weight: prev?.weight ?? null, reps: prev?.reps ?? null, done: false });
export const newExercise = (name, setCount = 3) => ({
  id: uid(),
  name: name.trim(),
  sets: Array.from({ length: setCount }, () => newSet()),
});

export const isEmptyDay = (day) => !day.title && !day.notes.trim() && day.exercises.length === 0;

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

export const allDays = () => db.getAll('days');

const norm = (name) => name.trim().toLowerCase();

// Every past session of an exercise, newest first.
export async function exerciseHistory(name, { before } = {}) {
  const days = await allDays();
  const out = [];
  for (const day of days) {
    if (before && day.date >= before) continue;
    for (const ex of day.exercises) {
      if (norm(ex.name) === norm(name) && ex.sets.some((s) => s.weight != null || s.reps != null)) {
        out.push({ date: day.date, title: day.title, sets: ex.sets });
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export async function lastSession(name, beforeDate) {
  return (await exerciseHistory(name, { before: beforeDate }))[0] || null;
}

export async function exerciseNames() {
  const days = await allDays();
  const templates = await getTemplates();
  const names = new Map();
  for (const d of days) for (const e of d.exercises) names.set(norm(e.name), e.name);
  for (const t of templates) for (const e of t.exercises) names.set(norm(e.name), e.name);
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

// Most recent day with the same title before `date` (e.g. last "Push Day").
export async function previousDayWithTitle(title, date) {
  const days = (await allDays())
    .filter((d) => d.date < date && norm(d.title) === norm(title))
    .sort((a, b) => b.date.localeCompare(a.date));
  return days[0] || null;
}

// Copies exercises and set counts; values stay empty so the previous numbers
// show as placeholders until each set is ticked.
export async function copyFromDate(fromDate, toDay) {
  const src = await db.get('days', fromDate);
  if (!src) return null;
  return {
    ...toDay,
    title: toDay.title || src.title,
    exercises: [...toDay.exercises, ...src.exercises.map((e) => newExercise(e.name, e.sets.length))],
  };
}

// ---- Templates ----
// Template shape: { id, name, exercises: [{ name, sets: number }] }
export async function getTemplates() {
  return (await db.getAll('templates')).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveTemplateFromDay(name, day) {
  const existing = (await getTemplates()).find((t) => norm(t.name) === norm(name));
  const tpl = {
    id: existing?.id || uid(),
    name: name.trim(),
    exercises: day.exercises.map((e) => ({ name: e.name, sets: Math.max(1, e.sets.length) })),
  };
  await db.put('templates', tpl);
  return tpl;
}

export const deleteTemplate = (id) => db.del('templates', id);

export function applyTemplate(tpl, day) {
  return {
    ...day,
    title: day.title || tpl.name,
    exercises: [...day.exercises, ...tpl.exercises.map((e) => newExercise(e.name, e.sets))],
  };
}

// ---- Settings ----
export const DEFAULT_SETTINGS = { unit: 'kg', restSeconds: 90 };

export async function getSettings() {
  const row = await db.get('settings', 'app');
  return { ...DEFAULT_SETTINGS, ...(row?.value || {}) };
}

export async function saveSettings(value) {
  await db.put('settings', { key: 'app', value });
}

// ---- Units ----
const LB_PER_KG = 2.2046226218;
export const toDisplay = (kg, unit) => {
  if (kg == null) return '';
  const v = unit === 'lbs' ? kg * LB_PER_KG : kg;
  return String(Math.round(v * 100) / 100);
};
export const fromDisplay = (value, unit) => {
  if (value === '' || value == null) return null;
  const n = parseFloat(String(value).replace(',', '.'));
  if (Number.isNaN(n)) return null;
  return unit === 'lbs' ? n / LB_PER_KG : n;
};

// ---- Backup ----
export async function exportAll() {
  return {
    app: 'tmf-pwa',
    version: 1,
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
  await db.clear('days');
  await db.clear('templates');
  for (const d of data.days) await db.put('days', d);
  for (const t of data.templates || []) await db.put('templates', t);
  if (data.settings) await saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
}

// Adds imported days without losing anything already logged. On a date that
// already has a workout, only exercises not already there are appended, so
// importing the same file twice doesn't duplicate anything.
export async function mergeImport(data) {
  validateBackup(data);
  let added = 0;
  let merged = 0;
  for (const incoming of data.days) {
    const existing = await db.get('days', incoming.date);
    if (!existing) {
      await db.put('days', { ...emptyDay(incoming.date), ...incoming });
      added++;
      continue;
    }
    const have = new Set(existing.exercises.map((e) => norm(e.name)));
    const extra = (incoming.exercises || []).filter((e) => !have.has(norm(e.name)));
    const notes = existing.notes.trim() ? existing.notes : incoming.notes || '';
    if (!extra.length && notes === existing.notes && (existing.title || !incoming.title)) continue;
    await db.put('days', {
      ...existing,
      title: existing.title || incoming.title || '',
      notes,
      exercises: [...existing.exercises, ...extra.map((e) => ({ ...e, id: uid() }))],
    });
    merged++;
  }
  const names = new Set((await getTemplates()).map((t) => norm(t.name)));
  for (const t of data.templates || []) {
    if (!names.has(norm(t.name))) await db.put('templates', { ...t, id: uid() });
  }
  return { added, merged };
}
