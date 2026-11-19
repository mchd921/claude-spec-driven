import { describe, expect, it } from 'vitest';
import {
  estimated1RM,
  estimated1RMUnits,
  round1,
  seriesByWorkout,
  summarizeWorkout,
  volume,
} from './metrics';
import type { Workout, WorkoutSet } from './types';

const set = (weightKg: number, reps: number, over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `s${Math.random()}`,
  workoutExerciseId: 'we1',
  workoutId: 'w1',
  exerciseId: 'ex1',
  order: 1,
  weightTenthKg: Math.round(weightKg * 10),
  reps,
  createdAt: '2026-11-17T10:00:00.000Z',
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

describe('volume', () => {
  it('REQ-3.2: 重量 × 回数の合計を kg で返す', () => {
    expect(volume([set(60, 10), set(60, 8), set(62.5, 6)])).toBe(600 + 480 + 375);
  });

  it('REQ-3.2: セットがないとき 0 を返す', () => {
    expect(volume([])).toBe(0);
  });

  it('REQ-3.2: 0.1kg 単位の小数でも誤差を出さない', () => {
    expect(volume([set(0.1, 3), set(0.2, 1)])).toBe(0.5);
    expect(volume(Array.from({ length: 10 }, () => set(0.1, 1)))).toBe(1);
  });

  it('REQ-3.2: 0kg のセットはボリュームに加算されない', () => {
    expect(volume([set(0, 15), set(20, 10)])).toBe(200);
  });
});

describe('estimated1RM', () => {
  it('REQ-3.9: Epley 式 重量 × (1 + 回数 / 30) で求める', () => {
    expect(estimated1RM(set(60, 10))).toBeCloseTo(80, 10);
    expect(estimated1RM(set(62.5, 8))).toBeCloseTo(62.5 * (1 + 8 / 30), 10);
  });

  it('REQ-3.9: 回数が 1 のときも式を適用する', () => {
    expect(estimated1RM(set(100, 1))).toBeCloseTo(100 * (1 + 1 / 30), 10);
  });

  it('REQ-3.9: 0kg のとき 0 を返す', () => {
    expect(estimated1RM(set(0, 12))).toBe(0);
  });

  it('REQ-3.13: 比較用の整数値は、同じ推定 1RM なら等しく、異なれば大小が正しい', () => {
    // 推定 1RM が同じ 90kg になる組: 60kg×15回 と 75kg×6回
    expect(estimated1RMUnits(set(60, 15))).toBe(estimated1RMUnits(set(75, 6)));
    expect(estimated1RMUnits(set(60, 16))).toBeGreaterThan(estimated1RMUnits(set(60, 15)));
  });
});

describe('round1', () => {
  it('表示用に小数第 1 位へ丸める', () => {
    expect(round1(78.8333)).toBe(78.8);
    expect(round1(78.86)).toBe(78.9);
    expect(round1(80)).toBe(80);
  });
});

describe('summarizeWorkout', () => {
  it('REQ-3.2: 総セット数と総ボリュームを返す', () => {
    expect(summarizeWorkout([set(60, 10), set(60, 8)])).toEqual({ setCount: 2, totalVolume: 1080 });
  });

  it('REQ-3.2: セットがないとき 0 を返す', () => {
    expect(summarizeWorkout([])).toEqual({ setCount: 0, totalVolume: 0 });
  });
});

describe('seriesByWorkout', () => {
  const workouts = [
    workout('w1', '2026-11-01'),
    workout('w2', '2026-11-08'),
    workout('w3', '2026-11-08', '2026-11-08T18:00:00.000Z'),
    workout('w4', '2026-11-15'),
  ];

  const sets = [
    set(60, 10, { workoutId: 'w1' }),
    set(60, 8, { workoutId: 'w1' }),
    set(62.5, 6, { workoutId: 'w2' }),
    set(50, 10, { workoutId: 'w3' }),
    set(30, 12, { workoutId: 'w4', exerciseId: 'ex2' }),
    set(65, 5, { workoutId: 'w4' }),
  ];

  it('REQ-3.8: 対象の種目があるワークアウトごとに最大重量を返す', () => {
    const series = seriesByWorkout('ex1', sets, workouts);
    expect(series.map((p) => [p.workoutId, p.maxWeight])).toEqual([
      ['w1', 60],
      ['w2', 62.5],
      ['w3', 50],
      ['w4', 65],
    ]);
  });

  it('REQ-3.9: ワークアウトごとの推定 1RM の最大値を返す', () => {
    const series = seriesByWorkout('ex1', sets, workouts);
    expect(series[0]!.maxE1RM).toBeCloseTo(80, 10);
    expect(series[1]!.maxE1RM).toBeCloseTo(62.5 * (1 + 6 / 30), 10);
  });

  it('REQ-3.10: ワークアウトごとのボリュームを返す', () => {
    const series = seriesByWorkout('ex1', sets, workouts);
    expect(series.map((p) => p.volume)).toEqual([1080, 375, 500, 325]);
  });

  it('REQ-3.8: 他の種目のセットは含めない', () => {
    const series = seriesByWorkout('ex2', sets, workouts);
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ workoutId: 'w4', maxWeight: 30, volume: 360 });
  });

  it('REQ-3.8: 日付の古い順に並べ、同じ日付は作成日時の古い順に並べる', () => {
    const shuffled = [workouts[3]!, workouts[2]!, workouts[0]!, workouts[1]!];
    const series = seriesByWorkout('ex1', sets, shuffled);
    expect(series.map((p) => p.workoutId)).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(series.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-08', '2026-11-08', '2026-11-15']);
  });

  it('REQ-3.12: 記録がない種目は空の配列を返す', () => {
    expect(seriesByWorkout('none', sets, workouts)).toEqual([]);
  });

  it('REQ-3.8: 存在しないワークアウトのセットは無視する', () => {
    expect(seriesByWorkout('ex1', [set(60, 10, { workoutId: 'ghost' })], workouts)).toEqual([]);
  });

  it('REQ-3.8: 0kg のセットしかないワークアウトも 0 の点として含める', () => {
    const series = seriesByWorkout('ex1', [set(0, 12, { workoutId: 'w1' })], workouts);
    expect(series).toEqual([
      { workoutId: 'w1', date: '2026-11-01', maxWeight: 0, maxE1RM: 0, volume: 0 },
    ]);
  });
});
