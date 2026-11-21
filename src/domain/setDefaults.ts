import { compareSetsInWorkout, compareWorkouts } from './chronology';
import type { ID, ISODate, Workout, WorkoutSet } from './types';

export interface SetDefaults {
  weightTenthKg: number;
  reps: number;
}

export interface PreviousRecord {
  workoutId: ID;
  date: ISODate;
  /** その種目の全セット（記録順） */
  sets: WorkoutSet[];
}

/**
 * 現在のワークアウトより前（日付 → 作成日時の順）で、その種目を行った最も新しいワークアウトの記録（REQ-1.5）。
 * 日付を過去に変更したワークアウトでは、変更後の日付より前のものだけを対象にする。
 */
export function findPreviousRecord(
  exerciseId: ID,
  current: Workout,
  sets: readonly WorkoutSet[],
  workouts: readonly Workout[],
): PreviousRecord | null {
  const exerciseSetsByWorkout = new Map<ID, WorkoutSet[]>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId) continue;
    const list = exerciseSetsByWorkout.get(s.workoutId);
    if (list) list.push(s);
    else exerciseSetsByWorkout.set(s.workoutId, [s]);
  }

  let previous: Workout | null = null;
  for (const w of workouts) {
    if (!exerciseSetsByWorkout.has(w.id)) continue;
    if (compareWorkouts(w, current) >= 0) continue;
    if (previous === null || compareWorkouts(w, previous) > 0) previous = w;
  }
  if (previous === null) return null;

  return {
    workoutId: previous.id,
    date: previous.date,
    sets: [...exerciseSetsByWorkout.get(previous.id)!].sort(compareSetsInWorkout),
  };
}

/**
 * セット入力欄の初期値（REQ-1.6, 1.7）。
 * 1. 現在のワークアウトに同じ種目のセットがあれば、その最後のセット
 * 2. なければ、前回の記録の最初のセット
 * 3. どちらもなければ null（空欄）
 */
export function getSetDefaults(
  exerciseId: ID,
  current: Workout,
  sets: readonly WorkoutSet[],
  workouts: readonly Workout[],
): SetDefaults | null {
  const currentSets = sets
    .filter((s) => s.workoutId === current.id && s.exerciseId === exerciseId)
    .sort(compareSetsInWorkout);
  const last = currentSets.at(-1);
  if (last) return { weightTenthKg: last.weightTenthKg, reps: last.reps };

  const first = findPreviousRecord(exerciseId, current, sets, workouts)?.sets[0];
  return first ? { weightTenthKg: first.weightTenthKg, reps: first.reps } : null;
}
