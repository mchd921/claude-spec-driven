import { describe, expect, it } from 'vitest';
import { computePRs } from './pr';
import type { Workout, WorkoutSet } from './types';

let seq = 0;
const set = (id: string, workoutId: string, weightKg: number, reps: number, over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id,
  workoutExerciseId: `${workoutId}-we`,
  workoutId,
  exerciseId: 'ex1',
  order: ++seq,
  weightTenthKg: Math.round(weightKg * 10),
  reps,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const workout = (id: string, date: string, createdAt = `${date}T10:00:00.000Z`): Workout => ({
  id,
  date,
  status: 'completed',
  memo: '',
  createdAt,
  completedAt: createdAt,
  updatedAt: createdAt,
});

const W1 = workout('w1', '2026-11-01');
const W2 = workout('w2', '2026-11-08');
const W3 = workout('w3', '2026-11-15');

describe('computePRs', () => {
  it('REQ-3.13: その種目の最初のセットは PR にならない', () => {
    const prs = computePRs([set('a', 'w1', 60, 10)], [W1]);
    expect(prs.get('a')).toEqual({ weight: false, e1rm: false });
  });

  it('REQ-3.13: 最大重量だけを更新したとき、重量のみ PR になる', () => {
    // 60kg×10回（推定 80kg）→ 62.5kg×8回（推定 約79.2kg）
    const prs = computePRs([set('a', 'w1', 60, 10), set('b', 'w2', 62.5, 8)], [W1, W2]);
    expect(prs.get('b')).toEqual({ weight: true, e1rm: false });
  });

  it('REQ-3.13: 推定 1RM だけを更新したとき、推定 1RM のみ PR になる', () => {
    // 60kg×10回（推定 80kg）→ 50kg×20回（推定 約83.3kg）
    const prs = computePRs([set('a', 'w1', 60, 10), set('b', 'w2', 50, 20)], [W1, W2]);
    expect(prs.get('b')).toEqual({ weight: false, e1rm: true });
  });

  it('REQ-3.13: 重量と推定 1RM をともに更新したとき、両方 PR になる', () => {
    const prs = computePRs([set('a', 'w1', 60, 10), set('b', 'w2', 65, 10)], [W1, W2]);
    expect(prs.get('b')).toEqual({ weight: true, e1rm: true });
  });

  it('REQ-3.13: 過去と同じ値は PR にならない', () => {
    const prs = computePRs([set('a', 'w1', 60, 10), set('b', 'w2', 60, 10)], [W1, W2]);
    expect(prs.get('b')).toEqual({ weight: false, e1rm: false });
  });

  it('REQ-3.13: 推定 1RM が同値（60kg×15回 と 75kg×6回）のとき、後のセットは推定 1RM の PR にならない', () => {
    const prs = computePRs([set('a', 'w1', 60, 15), set('b', 'w2', 75, 6)], [W1, W2]);
    expect(prs.get('b')).toEqual({ weight: true, e1rm: false });
  });

  it('REQ-3.13: 重量も推定 1RM も過去の最高を下回るセットは PR にならない', () => {
    // 70kg×5回（推定 約81.7kg）のあとの 65kg×6回（推定 78kg）
    const prs = computePRs(
      [set('a', 'w1', 60, 10), set('b', 'w2', 70, 5), set('c', 'w3', 65, 6)],
      [W1, W2, W3],
    );
    expect(prs.get('c')).toEqual({ weight: false, e1rm: false });
  });

  it('REQ-3.13: 0kg のセットは PR にならない', () => {
    const prs = computePRs([set('a', 'w1', 0, 10), set('b', 'w2', 0, 20)], [W1, W2]);
    expect(prs.get('a')).toEqual({ weight: false, e1rm: false });
    expect(prs.get('b')).toEqual({ weight: false, e1rm: false });
  });

  it('REQ-3.13: 0kg の記録のあとに初めて重量を使ったセットは PR になる', () => {
    const prs = computePRs([set('a', 'w1', 0, 10), set('b', 'w2', 10, 10)], [W1, W2]);
    expect(prs.get('b')).toEqual({ weight: true, e1rm: true });
  });

  it('REQ-3.13: 同じワークアウト内でも、直前のセットまでの最高記録と比較する', () => {
    const prs = computePRs(
      [set('a', 'w1', 60, 10), set('b', 'w1', 62.5, 8), set('c', 'w1', 62.5, 8)],
      [W1],
    );
    expect(prs.get('a')).toEqual({ weight: false, e1rm: false });
    expect(prs.get('b')).toEqual({ weight: true, e1rm: false });
    expect(prs.get('c')).toEqual({ weight: false, e1rm: false });
  });

  it('REQ-3.13: 種目ごとに別々に判定する', () => {
    const prs = computePRs(
      [set('a', 'w1', 60, 10), set('x', 'w1', 100, 5, { exerciseId: 'ex2' }), set('b', 'w2', 50, 10)],
      [W1, W2],
    );
    expect(prs.get('x')).toEqual({ weight: false, e1rm: false });
    expect(prs.get('b')).toEqual({ weight: false, e1rm: false });
  });

  it('REQ-3.13: 入力の並び順に関係なく、日付順で判定する', () => {
    const a = set('a', 'w1', 60, 10);
    const b = set('b', 'w2', 70, 5);
    const prs = computePRs([b, a], [W2, W1]);
    expect(prs.get('a')).toEqual({ weight: false, e1rm: false });
    expect(prs.get('b')).toEqual({ weight: true, e1rm: true });
  });

  it('REQ-3.13: 同じ日付のワークアウトは作成日時の順で判定する', () => {
    const morning = workout('m', '2026-11-08', '2026-11-08T07:00:00.000Z');
    const evening = workout('e', '2026-11-08', '2026-11-08T19:00:00.000Z');
    const a = set('a', 'm', 60, 10);
    const b = set('b', 'e', 70, 5);
    const prs = computePRs([b, a], [evening, morning]);
    expect(prs.get('a')).toEqual({ weight: false, e1rm: false });
    expect(prs.get('b')).toEqual({ weight: true, e1rm: true });
  });

  it('REQ-3.13: 存在しないワークアウトのセットは判定対象に含めない', () => {
    const prs = computePRs([set('g', 'ghost', 100, 10), set('a', 'w1', 60, 10)], [W1]);
    expect(prs.has('g')).toBe(false);
    expect(prs.get('a')).toEqual({ weight: false, e1rm: false });
  });

  describe('REQ-3.14: セットの追加・編集・削除や日付変更のあとに再計算した結果', () => {
    const base = () => [set('a', 'w1', 60, 10), set('b', 'w2', 62.5, 8), set('c', 'w3', 65, 8)];
    const workouts = [W1, W2, W3];

    it('過去のセットを削除すると、後のセットの判定が変わる', () => {
      const before = computePRs(base(), workouts);
      expect(before.get('b')!.weight).toBe(true);
      const after = computePRs(base().filter((s) => s.id !== 'a'), workouts);
      expect(after.get('b')).toEqual({ weight: false, e1rm: false });
      expect(after.get('c')!.weight).toBe(true);
    });

    it('過去のセットを編集して重くすると、後のセットは PR でなくなる', () => {
      const edited = base().map((s) => (s.id === 'a' ? { ...s, weightTenthKg: 700 } : s));
      const after = computePRs(edited, workouts);
      expect(after.get('b')).toEqual({ weight: false, e1rm: false });
      expect(after.get('c')).toEqual({ weight: false, e1rm: false });
    });

    it('新しいセットを過去の日付に追加すると、それ以降のセットの判定が変わる', () => {
      const added = [...base(), set('d', 'w1', 70, 10)];
      const after = computePRs(added, workouts);
      expect(after.get('b')).toEqual({ weight: false, e1rm: false });
      expect(after.get('c')).toEqual({ weight: false, e1rm: false });
    });

    it('ワークアウトの日付を変更すると、判定の順序が変わる', () => {
      const moved = workouts.map((w) => (w.id === 'w3' ? { ...w, date: '2026-10-01' } : w));
      const after = computePRs(base(), moved);
      // w3(65kg) が最初になり、w1(60kg) と w2(62.5kg) は 65kg を超えない
      expect(after.get('c')).toEqual({ weight: false, e1rm: false });
      expect(after.get('a')).toEqual({ weight: false, e1rm: false });
      expect(after.get('b')).toEqual({ weight: false, e1rm: false });
    });
  });
});
