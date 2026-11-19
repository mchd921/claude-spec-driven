import { compareWorkouts } from './chronology';
import type { ISODate, Workout, WorkoutSet } from './types';

type SetValue = Pick<WorkoutSet, 'weightTenthKg' | 'reps'>;

/** 表示用に小数第 1 位へ丸める。内部計算は丸めない。 */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** ボリュームの合計（kg）。整数のまま合計して最後に 10 で割り、誤差を避ける。 */
export function volume(sets: readonly SetValue[]): number {
  let tenthKgTimesReps = 0;
  for (const s of sets) tenthKgTimesReps += s.weightTenthKg * s.reps;
  return tenthKgTimesReps / 10;
}

/**
 * 推定 1RM を 1/300kg 単位の整数で返す。
 * Epley 式 重量 × (1 + 回数 / 30) = (重量×10) × (30 + 回数) / 300 を整数のまま扱い、
 * PR 判定での「厳密に上回る」比較が浮動小数の誤差で狂わないようにする（REQ-3.13）。
 */
export function estimated1RMUnits(s: SetValue): number {
  return s.weightTenthKg * (30 + s.reps);
}

/** 推定 1RM（kg）。Epley 式（REQ-3.9）。 */
export function estimated1RM(s: SetValue): number {
  return estimated1RMUnits(s) / 300;
}

export interface WorkoutSummary {
  setCount: number;
  totalVolume: number;
}

/** 履歴一覧用の集計（REQ-3.2）。 */
export function summarizeWorkout(sets: readonly SetValue[]): WorkoutSummary {
  return { setCount: sets.length, totalVolume: volume(sets) };
}

export interface ExercisePoint {
  workoutId: string;
  date: ISODate;
  maxWeight: number;
  maxE1RM: number;
  volume: number;
}

/** 種目ごとの、ワークアウト単位の推移データ（REQ-3.8〜3.10）。古い順。 */
export function seriesByWorkout(
  exerciseId: string,
  sets: readonly WorkoutSet[],
  workouts: readonly Workout[],
): ExercisePoint[] {
  const byWorkout = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId) continue;
    const list = byWorkout.get(s.workoutId);
    if (list) list.push(s);
    else byWorkout.set(s.workoutId, [s]);
  }

  return workouts
    .filter((w) => byWorkout.has(w.id))
    .sort(compareWorkouts)
    .map((w) => {
      const list = byWorkout.get(w.id)!;
      return {
        workoutId: w.id,
        date: w.date,
        maxWeight: Math.max(...list.map((s) => s.weightTenthKg)) / 10,
        maxE1RM: Math.max(...list.map(estimated1RMUnits)) / 300,
        volume: volume(list),
      };
    });
}
