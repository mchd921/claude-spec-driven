import type { Workout, WorkoutSet } from './types';

/** ワークアウトの時系列順: 日付 → 作成日時 → ID（同じ日付の複数ワークアウトに対応する）。 */
export function compareWorkouts(a: Workout, b: Workout): number {
  return (
    a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
}

/** 同じワークアウト内のセットの順序: セットの順序 → 作成日時 → ID。 */
export function compareSetsInWorkout(a: WorkoutSet, b: WorkoutSet): number {
  return a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}
