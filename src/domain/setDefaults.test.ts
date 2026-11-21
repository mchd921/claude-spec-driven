import { describe, expect, it } from 'vitest';
import { findPreviousRecord, getSetDefaults } from './setDefaults';
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
const CURRENT = { ...workout('cur', '2026-11-15'), status: 'in_progress' as const };

describe('getSetDefaults', () => {
  it('REQ-1.6: 同じワークアウトに同種目のセットがあるとき、最後のセットの重量と回数を返す', () => {
    const sets = [set('a', 'cur', 60, 10), set('b', 'cur', 62.5, 8), set('p', 'w2', 50, 5)];
    expect(getSetDefaults('ex1', CURRENT, sets, [W2, CURRENT])).toEqual({ weightTenthKg: 625, reps: 8 });
  });

  it('REQ-1.6: 入力の並び順に関係なく、セットの順序で最後のものを選ぶ', () => {
    const a = set('a', 'cur', 60, 10);
    const b = set('b', 'cur', 62.5, 8);
    expect(getSetDefaults('ex1', CURRENT, [b, a], [CURRENT])).toEqual({ weightTenthKg: 625, reps: 8 });
  });

  it('REQ-1.6: 同じワークアウトのセットがあれば、過去の記録より優先する', () => {
    const sets = [set('p', 'w2', 100, 3), set('a', 'cur', 40, 12)];
    expect(getSetDefaults('ex1', CURRENT, sets, [W2, CURRENT])).toEqual({ weightTenthKg: 400, reps: 12 });
  });

  it('REQ-1.7: 同じワークアウトにセットがないとき、直近のワークアウトの最初のセットを返す', () => {
    const sets = [set('p1', 'w2', 60, 10), set('p2', 'w2', 60, 8), set('p3', 'w2', 55, 6)];
    expect(getSetDefaults('ex1', CURRENT, sets, [W2, CURRENT])).toEqual({ weightTenthKg: 600, reps: 10 });
  });

  it('REQ-1.7: 直近より前のワークアウトは参照しない', () => {
    const sets = [set('old', 'w1', 40, 15), set('new', 'w2', 60, 10)];
    expect(getSetDefaults('ex1', CURRENT, sets, [W1, W2, CURRENT])).toEqual({ weightTenthKg: 600, reps: 10 });
  });

  it('REQ-1.7: その種目を行っていない直近のワークアウトは飛ばして、行った最も新しいものを参照する', () => {
    const sets = [set('old', 'w1', 40, 15), set('other', 'w2', 80, 5, { exerciseId: 'ex2' })];
    expect(getSetDefaults('ex1', CURRENT, sets, [W1, W2, CURRENT])).toEqual({ weightTenthKg: 400, reps: 15 });
  });

  it('REQ-1.6, 1.7: 記録がどこにもないとき null を返す', () => {
    expect(getSetDefaults('ex1', CURRENT, [], [CURRENT])).toBeNull();
    expect(getSetDefaults('ex1', CURRENT, [set('o', 'w2', 80, 5, { exerciseId: 'ex2' })], [W2, CURRENT])).toBeNull();
  });

  it('REQ-1.6: 他のワークアウトのセットを、同じワークアウトのセットとして扱わない', () => {
    // 'cur' にセットがないので、過去（w2）の最初のセットを返す。w2 の最後のセット(55kg×6)ではない。
    const sets = [set('p1', 'w2', 60, 10), set('p2', 'w2', 55, 6)];
    expect(getSetDefaults('ex1', CURRENT, sets, [W2, CURRENT])).toEqual({ weightTenthKg: 600, reps: 10 });
  });

  it('REQ-1.7: 日付を過去に変更したワークアウトでは、それより前のワークアウトだけを参照する', () => {
    const moved = { ...CURRENT, date: '2026-11-05' };
    const sets = [set('w1s', 'w1', 40, 15), set('w2s', 'w2', 60, 10)];
    expect(getSetDefaults('ex1', moved, sets, [W1, W2, moved])).toEqual({ weightTenthKg: 400, reps: 15 });
  });

  it('REQ-1.7: 同じ日付では、作成日時が前のワークアウトだけを参照する', () => {
    const morning = workout('m', '2026-11-15', '2026-11-15T07:00:00.000Z');
    const noon = workout('n', '2026-11-15', '2026-11-15T12:00:00.000Z');
    const evening = workout('e', '2026-11-15', '2026-11-15T19:00:00.000Z');
    const sets = [set('ms', 'm', 60, 10), set('es', 'e', 90, 3)];
    // 昼のワークアウトから見ると、朝は前回、夕方は後なので参照しない
    expect(getSetDefaults('ex1', noon, sets, [morning, noon, evening])).toEqual({ weightTenthKg: 600, reps: 10 });
    // 朝のワークアウトから見ると、同じ日の前のワークアウトはない
    expect(getSetDefaults('ex1', { ...morning, id: 'm2' }, [set('es', 'e', 90, 3)], [morning, evening])).toBeNull();
  });
});

describe('findPreviousRecord', () => {
  it('REQ-1.5: 直近のワークアウトでのその種目の全セットを、順序どおりに返す', () => {
    const p2 = set('p2', 'w2', 60, 8);
    const p1 = set('p1', 'w2', 60, 10, { order: p2.order - 1 });
    const sets = [set('old', 'w1', 40, 15), p2, p1, set('x', 'w2', 100, 1, { exerciseId: 'ex2' })];
    const record = findPreviousRecord('ex1', CURRENT, sets, [W1, W2, CURRENT]);
    expect(record?.workoutId).toBe('w2');
    expect(record?.date).toBe('2026-11-08');
    expect(record?.sets.map((s) => s.id)).toEqual(['p1', 'p2']);
  });

  it('REQ-1.5: 過去の記録がないとき null を返す', () => {
    expect(findPreviousRecord('ex1', CURRENT, [set('a', 'cur', 60, 10)], [CURRENT])).toBeNull();
  });

  it('REQ-1.5: 現在のワークアウト自身は前回の記録として扱わない', () => {
    const sets = [set('a', 'cur', 60, 10)];
    expect(findPreviousRecord('ex1', CURRENT, sets, [CURRENT])).toBeNull();
  });

  it('REQ-1.5: 現在より後のワークアウトは前回の記録として扱わない', () => {
    const later = workout('later', '2026-12-01');
    expect(findPreviousRecord('ex1', CURRENT, [set('l', 'later', 99, 9)], [CURRENT, later])).toBeNull();
  });
});
