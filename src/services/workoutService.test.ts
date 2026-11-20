import { describe, expect, it } from 'vitest';
import { testDeps, setupTestDb } from '../test/testDb';
import {
  deleteWorkout,
  finishWorkout,
  startWorkout,
  updateDate,
  updateMemo,
} from './workoutService';

const ctx = setupTestDb();
const T = '2026-11-01T10:00:00.000Z';

/** 種目記録とセットを n 件、DB に直接作る。 */
async function addSets(workoutId: string, count: number, exerciseId = 'ex-a') {
  const weId = `we-${workoutId}-${exerciseId}`;
  await ctx.db.workoutExercises.put({ id: weId, workoutId, exerciseId, order: 0, targetSets: null });
  for (let i = 1; i <= count; i++) {
    await ctx.db.sets.add({ id: `${weId}-s${i}`, workoutExerciseId: weId, workoutId, exerciseId, order: i, weightTenthKg: 600, reps: 10, createdAt: T });
  }
}

const completed = (id: string, date = '2026-11-01') =>
  ({ id, date, status: 'completed' as const, memo: '', createdAt: T, completedAt: T, updatedAt: T });

describe('startWorkout', () => {
  it('REQ-1.1: 日付を当日、状態を進行中とする空のワークアウトを作成する', async () => {
    const deps = testDeps({ today: '2026-11-17' });
    const result = await startWorkout(ctx.db, deps);
    expect(result).toEqual({ workoutId: 'id-1', created: true });
    const w = await ctx.db.workouts.get('id-1');
    expect(w).toMatchObject({ date: '2026-11-17', status: 'in_progress', memo: '', completedAt: null });
    expect(w!.createdAt).toBe(w!.updatedAt);
    expect(await ctx.db.workoutExercises.count()).toBe(0);
    expect(await ctx.db.sets.count()).toBe(0);
  });

  it('REQ-1.1: 日付は端末のローカル日付（deps.today）を使う', async () => {
    await startWorkout(ctx.db, testDeps({ today: '2027-01-05' }));
    expect((await ctx.db.workouts.toArray())[0]!.date).toBe('2027-01-05');
  });

  it('REQ-1.24: 進行中のワークアウトがあるとき、新しく作らず既存の ID を返す', async () => {
    const first = await startWorkout(ctx.db, testDeps());
    const second = await startWorkout(ctx.db, testDeps());
    expect(second).toEqual({ workoutId: first.workoutId, created: false });
    expect(await ctx.db.workouts.count()).toBe(1);
  });

  it('REQ-1.24: 完了済みのワークアウトがあっても、新しいワークアウトを開始できる', async () => {
    await ctx.db.workouts.add(completed('old', '2026-11-17'));
    const result = await startWorkout(ctx.db, testDeps({ today: '2026-11-17' }));
    expect(result.created).toBe(true);
    expect(await ctx.db.workouts.count()).toBe(2);
  });

  it('REQ-1.24: 同時に 2 回開始しても、作成されるのは 1 件だけで、同じ ID を返す', async () => {
    const [a, b] = await Promise.all([startWorkout(ctx.db, testDeps()), startWorkout(ctx.db, testDeps())]);
    expect(a.workoutId).toBe(b.workoutId);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(await ctx.db.workouts.count()).toBe(1);
  });
});

describe('finishWorkout', () => {
  it('REQ-1.20: セットがあるとき、状態を完了にして完了日時を記録する', async () => {
    const { workoutId } = await startWorkout(ctx.db, testDeps());
    await addSets(workoutId, 2);
    const deps = testDeps();
    expect(await finishWorkout(ctx.db, workoutId, deps)).toEqual({ status: 'finished' });
    const w = (await ctx.db.workouts.get(workoutId))!;
    expect(w.status).toBe('completed');
    expect(w.completedAt).toBe(deps.tick());
    expect(w.updatedAt).toBe(deps.tick());
  });

  it('REQ-1.21: セットが 1 つもないとき、完了せずに破棄の確認が必要だと返す', async () => {
    const { workoutId } = await startWorkout(ctx.db, testDeps());
    const before = await ctx.db.workouts.get(workoutId);
    expect(await finishWorkout(ctx.db, workoutId)).toEqual({ status: 'needs_discard_confirm' });
    expect(await ctx.db.workouts.get(workoutId)).toEqual(before);
  });

  it('REQ-1.21: 種目だけを追加してセットがない場合も、破棄の確認が必要と返す', async () => {
    const { workoutId } = await startWorkout(ctx.db, testDeps());
    await ctx.db.workoutExercises.add({ id: 'we1', workoutId, exerciseId: 'ex-a', order: 0, targetSets: null });
    expect(await finishWorkout(ctx.db, workoutId)).toEqual({ status: 'needs_discard_confirm' });
  });

  it('REQ-1.20: 他のワークアウトのセットは数えない', async () => {
    await ctx.db.workouts.add(completed('other'));
    await addSets('other', 3);
    const { workoutId } = await startWorkout(ctx.db, testDeps());
    expect(await finishWorkout(ctx.db, workoutId)).toEqual({ status: 'needs_discard_confirm' });
  });

  it('REQ-1.20: すでに完了しているワークアウトは変更せず、完了として返す', async () => {
    await ctx.db.workouts.add(completed('done'));
    await addSets('done', 1);
    expect(await finishWorkout(ctx.db, 'done')).toEqual({ status: 'finished' });
    expect(await ctx.db.workouts.get('done')).toEqual(completed('done'));
  });

  it('REQ-1.20: 終了したあとは、新しいワークアウトを開始できる', async () => {
    const deps = testDeps();
    const first = await startWorkout(ctx.db, deps);
    await addSets(first.workoutId, 1);
    await finishWorkout(ctx.db, first.workoutId, deps);
    const second = await startWorkout(ctx.db, deps);
    expect(second.created).toBe(true);
    expect(second.workoutId).not.toBe(first.workoutId);
  });

  it('REQ-1.20: 存在しないワークアウトは not_found を返す', async () => {
    expect(await finishWorkout(ctx.db, 'ghost')).toEqual({ status: 'not_found' });
  });
});

describe('deleteWorkout', () => {
  it('REQ-1.22: セットのないワークアウトを破棄すると、ワークアウトと種目記録を削除する', async () => {
    const { workoutId } = await startWorkout(ctx.db, testDeps());
    await ctx.db.workoutExercises.add({ id: 'we1', workoutId, exerciseId: 'ex-a', order: 0, targetSets: null });
    expect(await deleteWorkout(ctx.db, workoutId)).toBe('deleted');
    expect(await ctx.db.workouts.get(workoutId)).toBeUndefined();
    expect(await ctx.db.workoutExercises.count()).toBe(0);
  });

  it('REQ-3.5: ワークアウトと、含まれる全種目記録・全セットを削除する', async () => {
    await ctx.db.workouts.add(completed('w1'));
    await addSets('w1', 3, 'ex-a');
    await addSets('w1', 2, 'ex-b');
    expect(await deleteWorkout(ctx.db, 'w1')).toBe('deleted');
    expect(await ctx.db.workouts.count()).toBe(0);
    expect(await ctx.db.workoutExercises.count()).toBe(0);
    expect(await ctx.db.sets.count()).toBe(0);
  });

  it('REQ-3.5: 他のワークアウトのデータと、種目マスタは削除しない', async () => {
    await ctx.db.workouts.bulkAdd([completed('w1'), completed('w2', '2026-11-02')]);
    await addSets('w1', 2);
    await addSets('w2', 4);
    const exercises = await ctx.db.exercises.count();
    await deleteWorkout(ctx.db, 'w1');
    expect((await ctx.db.workouts.toArray()).map((w) => w.id)).toEqual(['w2']);
    expect(await ctx.db.sets.where('workoutId').equals('w2').count()).toBe(4);
    expect(await ctx.db.workoutExercises.where('workoutId').equals('w2').count()).toBe(1);
    expect(await ctx.db.exercises.count()).toBe(exercises);
  });

  it('REQ-3.5: 存在しないワークアウトは not_found を返す', async () => {
    expect(await deleteWorkout(ctx.db, 'ghost')).toBe('not_found');
  });
});

describe('updateMemo', () => {
  it('REQ-1.14: メモをワークアウトに保存し、更新日時を更新する', async () => {
    const deps = testDeps();
    const { workoutId } = await startWorkout(ctx.db, deps);
    const before = (await ctx.db.workouts.get(workoutId))!;
    const result = await updateMemo(ctx.db, workoutId, '調子が良かった', deps);
    expect(result).toEqual({ ok: true, value: '調子が良かった' });
    const after = (await ctx.db.workouts.get(workoutId))!;
    expect(after.memo).toBe('調子が良かった');
    expect(after.updatedAt).not.toBe(before.updatedAt);
  });

  it('REQ-1.14: 空のメモに更新できる（メモの削除）', async () => {
    await ctx.db.workouts.add({ ...completed('w1'), memo: '旧メモ' });
    expect(await updateMemo(ctx.db, 'w1', '')).toEqual({ ok: true, value: '' });
    expect((await ctx.db.workouts.get('w1'))?.memo).toBe('');
  });

  it('REQ-1.15: 500 文字ちょうどのメモはそのまま保存する', async () => {
    await ctx.db.workouts.add(completed('w1'));
    await updateMemo(ctx.db, 'w1', 'あ'.repeat(500));
    expect((await ctx.db.workouts.get('w1'))?.memo).toHaveLength(500);
  });

  it('REQ-1.15: 501 文字以上は 500 文字に切り詰めて保存し、保存した値を返す', async () => {
    await ctx.db.workouts.add(completed('w1'));
    const result = await updateMemo(ctx.db, 'w1', 'あ'.repeat(600));
    expect(result.ok && result.value).toBe('あ'.repeat(500));
    expect((await ctx.db.workouts.get('w1'))?.memo).toBe('あ'.repeat(500));
  });

  it('REQ-1.14: 存在しないワークアウトはエラーを返す', async () => {
    expect((await updateMemo(ctx.db, 'ghost', 'x')).ok).toBe(false);
  });
});

describe('updateDate', () => {
  const deps = () => testDeps({ today: '2026-11-17' });

  it('REQ-1.16: 当日以前の日付に変更する', async () => {
    await ctx.db.workouts.add(completed('w1', '2026-11-17'));
    for (const date of ['2026-11-16', '2026-11-17', '2025-01-01']) {
      expect(await updateDate(ctx.db, 'w1', date, deps())).toEqual({ ok: true, value: date });
      expect((await ctx.db.workouts.get('w1'))?.date).toBe(date);
    }
  });

  it('REQ-1.16: 完了済みのワークアウトの日付も変更できる', async () => {
    await ctx.db.workouts.add(completed('w1', '2026-11-01'));
    expect((await updateDate(ctx.db, 'w1', '2026-10-31', deps())).ok).toBe(true);
  });

  it('REQ-1.17: 翌日以降の日付は変更せず、date のエラーを返す', async () => {
    await ctx.db.workouts.add(completed('w1', '2026-11-10'));
    for (const date of ['2026-11-18', '2027-01-01']) {
      const result = await updateDate(ctx.db, 'w1', date, deps());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.date).toBeTruthy();
    }
    expect((await ctx.db.workouts.get('w1'))?.date).toBe('2026-11-10');
  });

  it('REQ-1.17: 日付として不正な値は変更しない', async () => {
    await ctx.db.workouts.add(completed('w1', '2026-11-10'));
    for (const date of ['', '2026-02-30', 'abc']) {
      expect((await updateDate(ctx.db, 'w1', date, deps())).ok).toBe(false);
    }
    expect((await ctx.db.workouts.get('w1'))?.date).toBe('2026-11-10');
  });

  it('REQ-1.16: 存在しないワークアウトはエラーを返す', async () => {
    expect((await updateDate(ctx.db, 'ghost', '2026-11-10', deps())).ok).toBe(false);
  });
});
