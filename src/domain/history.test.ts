import { describe, expect, it } from 'vitest';
import { buildHistoryItems } from './history';
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from './types';

const workout = (id: string, date: string, createdAt: string): Workout => ({
  id, date, status: 'completed', memo: '', createdAt, completedAt: createdAt, updatedAt: createdAt,
});
const exercise = (id: string, name: string, archived = false): Exercise => ({
  id, name, nameKey: name, bodyPart: 'chest', archived, createdAt: 'x', updatedAt: 'x',
});
const entry = (id: string, workoutId: string, exerciseId: string, order: number): WorkoutExercise => ({
  id, workoutId, exerciseId, order, targetSets: null,
});
const set = (id: string, we: WorkoutExercise, weightTenthKg: number, reps: number, order: number): WorkoutSet => ({
  id, workoutExerciseId: we.id, workoutId: we.workoutId, exerciseId: we.exerciseId, order, weightTenthKg, reps, createdAt: 'x',
});

const bench = exercise('e1', 'ベンチプレス');
const squat = exercise('e2', 'スクワット', true);

describe('buildHistoryItems', () => {
  it('REQ-3.1: 日付の新しい順に並べ、同じ日付なら作成日時の新しい順にする', () => {
    const items = buildHistoryItems(
      [
        workout('a', '2026-11-10', '2026-11-10T08:00:00Z'),
        workout('b', '2026-11-12', '2026-11-12T08:00:00Z'),
        workout('c', '2026-11-10', '2026-11-10T20:00:00Z'),
      ],
      [], [], [],
    );
    expect(items.map((i) => i.workout.id)).toEqual(['b', 'c', 'a']);
  });

  it('REQ-3.1: 日付と作成日時が同じなら ID の順で安定して並ぶ', () => {
    const ws = [workout('b', '2026-11-10', 't'), workout('a', '2026-11-10', 't')];
    const ids = (list: Workout[]) => buildHistoryItems(list, [], [], []).map((i) => i.workout.id);
    expect(ids(ws)).toEqual(ids([...ws].reverse()));
  });

  it('REQ-3.2: 実施種目名（種目の順）・総セット数・総ボリュームを求める', () => {
    const w = workout('w', '2026-11-10', 't');
    const e1 = entry('we1', 'w', 'e1', 1);
    const e2 = entry('we2', 'w', 'e1', 0);
    const [item] = buildHistoryItems(
      [w],
      [e1, e2],
      [set('s1', e1, 600, 10, 1), set('s2', e1, 625, 8, 2), set('s3', e2, 1000, 5, 1)],
      [bench],
    );
    expect(item).toMatchObject({ exerciseNames: ['ベンチプレス'], setCount: 3 });
    expect(item!.totalVolume).toBe(600 * 10 / 10 + 625 * 8 / 10 + 1000 * 5 / 10);
  });

  it('REQ-3.2: 同じ種目を複数回行っても、種目名は 1 回だけ表示する', () => {
    const w = workout('w', '2026-11-10', 't');
    const [item] = buildHistoryItems(
      [w],
      [entry('we1', 'w', 'e1', 0), entry('we2', 'w', 'e1', 1)],
      [], [bench],
    );
    expect(item!.exerciseNames).toEqual(['ベンチプレス']);
  });

  it('REQ-2.10: アーカイブ済みの種目も、種目名付きで含める', () => {
    const w = workout('w', '2026-11-10', 't');
    const [item] = buildHistoryItems(
      [w], [entry('we1', 'w', 'e2', 0), entry('we2', 'w', 'e1', 1)], [], [bench, squat],
    );
    expect(item!.exerciseNames).toEqual(['スクワット', 'ベンチプレス']);
  });

  it('REQ-2.10: マスタに存在しない種目は、不明な種目として表示する', () => {
    const w = workout('w', '2026-11-10', 't');
    const [item] = buildHistoryItems([w], [entry('we1', 'w', 'gone', 0)], [], []);
    expect(item!.exerciseNames).toEqual(['（不明な種目）']);
  });

  it('REQ-3.2: 種目もセットもないワークアウトは、0 件・0kg で含める', () => {
    const [item] = buildHistoryItems([workout('w', '2026-11-10', 't')], [], [], []);
    expect(item).toMatchObject({ exerciseNames: [], setCount: 0, totalVolume: 0 });
  });

  it('REQ-3.2: 他のワークアウトの種目・セットは集計に含めない', () => {
    const e = entry('we1', 'other', 'e1', 0);
    const [item] = buildHistoryItems(
      [workout('w', '2026-11-10', 't')], [e], [set('s', e, 600, 10, 1)], [bench],
    );
    expect(item).toMatchObject({ exerciseNames: [], setCount: 0 });
  });
});
