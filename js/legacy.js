// Converts days/templates saved before the structured exercise model (no `v`)
// into the current shape. Exercise names from the original Notes import map to
// dataset entries; anything else becomes a custom exercise.
import { byId, findByName, customId } from './library.js';
import { DAY_TYPES } from './library.js';

// lowercase legacy base name -> [dataset id, equipment]
const LEGACY = {
  'push-ups': ['Pushups', 'Bodyweight'],
  'flat chest press': ['Dumbbell_Bench_Press', 'Dumbbell'],
  'incline chest press': ['Incline_Dumbbell_Press', 'Dumbbell'],
  'lat pulldown': ['Wide-Grip_Lat_Pulldown', 'Cable'],
  'dumbbell shoulder press': ['Dumbbell_Shoulder_Press', 'Dumbbell'],
  'bicep curl': ['Standing_Biceps_Cable_Curl', 'Cable'],
  'tricep pushdown': ['Triceps_Pushdown', 'Cable'],
  'rope pushdown': ['Triceps_Pushdown_-_Rope_Attachment', 'Cable'],
  squat: ['Dumbbell_Squat', 'Dumbbell'],
  lunges: ['Dumbbell_Lunges', 'Dumbbell'],
  'leg extension': ['Leg_Extensions', 'Machine'],
  hyperextension: ['Hyperextensions_Back_Extensions', 'Bodyweight'],
  'hammer curl': ['Cable_Hammer_Curls_-_Rope_Attachment', 'Cable'],
  'overhead tricep extension': ['Cable_Rope_Overhead_Triceps_Extension', 'Cable'],
  'forearm curl': ['Cable_Wrist_Curl', 'Cable'],
  'reverse curl': ['Reverse_Cable_Curl', 'Cable'],
  'lying hamstring curl': ['Lying_Leg_Curls', 'Machine'],
  'romanian deadlift': ['Romanian_Deadlift', 'Barbell'],
  'flat dumbbell fly': ['Dumbbell_Flyes', 'Dumbbell'],
  'lateral raise': ['Side_Lateral_Raise', 'Cable'],
  'cable row': ['Seated_Cable_Rows', 'Cable'],
  'preacher curl': ['Machine_Preacher_Curls', 'Plate Machine'],
  'dumbbell rear delt fly': ['Reverse_Flyes', 'Dumbbell'],
  shrugs: ['Dumbbell_Shrug', 'Dumbbell'],
};

const SUFFIX = /\s*\((single cable|dual cable|plate machine)\)\s*$/i;

function legacyExercise(name) {
  let base = name.trim();
  let equipment = null;
  let ratio = null;
  const m = base.match(SUFFIX);
  if (m) {
    base = base.slice(0, m.index);
    const s = m[1].toLowerCase();
    if (s === 'plate machine') equipment = 'Plate Machine';
    else [equipment, ratio] = ['Cable', s === 'single cable' ? '1:1' : '2:1'];
  }
  const mapped = LEGACY[base.toLowerCase()];
  const entry = mapped ? byId(mapped[0]) : findByName(base);
  if (entry) {
    equipment ||= mapped?.[1] || entry.equipment;
    return { exId: entry.id, name: entry.name, equipment, ratio: equipment === 'Cable' ? ratio || '1:1' : null };
  }
  equipment ||= 'Other';
  return { exId: customId(base), name: base, equipment, ratio: equipment === 'Cable' ? ratio || '1:1' : null };
}

export function dayType(title) {
  return DAY_TYPES.find((t) => t.toLowerCase() === (title || '').trim().toLowerCase()) || (title ? 'Custom' : '');
}

export function upgradeDay(day, uid) {
  if (day.v === 2) return day;
  return {
    v: 2,
    date: day.date,
    type: dayType(day.title),
    title: day.title || '',
    notes: day.notes || '',
    exercises: (day.exercises || []).map((e) => ({
      id: uid(),
      ...legacyExercise(e.name),
      unit: 'kg', // legacy weights were always stored in kg
      sets: e.sets.map((s) => ({
        weight: s.weight ?? null,
        reps: s.reps == null ? '' : String(s.reps),
        done: !!s.done,
      })),
    })),
  };
}

export function upgradeTemplate(tpl) {
  if (tpl.v === 2) return tpl;
  return {
    v: 2,
    id: tpl.id,
    name: tpl.name,
    exercises: tpl.exercises.map((e) => ({ ...legacyExercise(e.name), unit: 'kg' })),
  };
}
