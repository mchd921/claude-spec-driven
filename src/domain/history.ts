import { compareWorkouts } from './chronology';
import { summarizeWorkout } from './metrics';
import type { Exercise, ID, Workout, WorkoutExercise, WorkoutSet } from './types';

export const UNKNOWN_EXERCISE_NAME = '（不明な種目）';

export interface HistoryItem {
  workout: Workout;
  /** 実施種目名（種目の順序、重複なし）。アーカイブ済みの種目も含む（REQ-2.10）。 */
  exerciseNames: string[];
  setCount: number;
  /** 総ボリューム（kg） */
  totalVolume: number;
}

/**
 * 履歴一覧用の項目を作る（REQ-3.1, 3.2, 2.10）。
 * 日付の新しい順、同じ日付なら作成日時の新しい順（さらに ID 順）に並べる。
 */
export function buildHistoryItems(
  workouts: readonly Workout[],
  workoutExercises: readonly WorkoutExercise[],
  sets: readonly WorkoutSet[],
  exercises: readonly Exercise[],
): HistoryItem[] {
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));

  const entriesByWorkout = new Map<ID, WorkoutExercise[]>();
  for (const entry of workoutExercises) {
    const list = entriesByWorkout.get(entry.workoutId);
    if (list) list.push(entry);
    else entriesByWorkout.set(entry.workoutId, [entry]);
  }
  const setsByWorkout = new Map<ID, WorkoutSet[]>();
  for (const set of sets) {
    const list = setsByWorkout.get(set.workoutId);
    if (list) list.push(set);
    else setsByWorkout.set(set.workoutId, [set]);
  }

  return [...workouts]
    .sort((a, b) => compareWorkouts(b, a))
    .map((workout) => {
      const entries = [...(entriesByWorkout.get(workout.id) ?? [])].sort((a, b) => a.order - b.order);
      const names = entries.map((e) => nameById.get(e.exerciseId) ?? UNKNOWN_EXERCISE_NAME);
      const { setCount, totalVolume } = summarizeWorkout(setsByWorkout.get(workout.id) ?? []);
      return { workout, exerciseNames: [...new Set(names)], setCount, totalVolume };
    });
}
