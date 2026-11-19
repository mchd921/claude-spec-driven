import { estimated1RMUnits } from './metrics';
import type { ID, Workout, WorkoutSet } from './types';

export interface PRFlags {
  /** 最大重量の自己ベストを更新したセット */
  weight: boolean;
  /** 推定 1RM の自己ベストを更新したセット */
  e1rm: boolean;
}

const NOT_PR: PRFlags = { weight: false, e1rm: false };

/**
 * 全セットの自己ベスト (PR) 判定を求める（REQ-3.13, 3.14）。
 *
 * - 種目ごとに、ワークアウトの日付 → 作成日時 → セットの順序の時系列で並べる。
 * - 先頭から走査し、それまでの最大重量・最大推定 1RM を厳密に上回ったセットを PR とする。
 * - その種目の最初のセットは比較対象がないため PR としない。
 * - 保存はせず、呼び出しのたびに再計算する。追加・編集・削除・日付変更の結果が常に反映される。
 *
 * 戻り値のキーはセット ID。対応するワークアウトが存在しないセットは含めない。
 */
export function computePRs(
  sets: readonly WorkoutSet[],
  workouts: readonly Workout[],
): Map<ID, PRFlags> {
  const workoutById = new Map(workouts.map((w) => [w.id, w]));

  const byExercise = new Map<ID, WorkoutSet[]>();
  for (const s of sets) {
    if (!workoutById.has(s.workoutId)) continue;
    const list = byExercise.get(s.exerciseId);
    if (list) list.push(s);
    else byExercise.set(s.exerciseId, [s]);
  }

  const result = new Map<ID, PRFlags>();
  for (const list of byExercise.values()) {
    list.sort((a, b) => {
      const wa = workoutById.get(a.workoutId)!;
      const wb = workoutById.get(b.workoutId)!;
      return (
        wa.date.localeCompare(wb.date) ||
        wa.createdAt.localeCompare(wb.createdAt) ||
        wa.id.localeCompare(wb.id) ||
        a.order - b.order ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id)
      );
    });

    let maxWeight: number | null = null;
    let maxUnits: number | null = null;
    for (const s of list) {
      const units = estimated1RMUnits(s);
      if (maxWeight === null || maxUnits === null) {
        result.set(s.id, NOT_PR);
        maxWeight = s.weightTenthKg;
        maxUnits = units;
        continue;
      }
      result.set(s.id, {
        weight: s.weightTenthKg > maxWeight,
        e1rm: units > maxUnits,
      });
      maxWeight = Math.max(maxWeight, s.weightTenthKg);
      maxUnits = Math.max(maxUnits, units);
    }
  }
  return result;
}
