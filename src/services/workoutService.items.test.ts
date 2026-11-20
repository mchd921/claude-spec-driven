import { describe, expect, it } from 'vitest';
import { createNameKey } from '../domain/validation';
import { setupTestDb, testDeps } from '../test/testDb';
import { deleteExercise } from './exerciseService';
import {
  addExercise,
  addSet,
  deleteSet,
  finishWorkout,
  removeExercise,
  startWorkout,
  updateSet,
} from './workoutService';

const ctx = setupTestDb();

const exerciseId = async (name: string) =>
  (await ctx.db.exercises.where('nameKey').equals(createNameKey(name)).first())!.id;

/** 進行中のワークアウトを作り、種目（ベンチプレス・スクワット）を追加して返す。 */
async function setup() {
  const deps = testDeps();
  const { workoutId } = await startWorkout(ctx.db, deps);
  const bench = await exerciseId('ベンチプレス');
  const squat = await exerciseId('スクワット');
  const a = await addExercise(ctx.db, workoutId, bench, deps);
  const b = await addExercise(ctx.db, workoutId, squat, deps);
  if (!a.ok || !b.ok) throw new Error('setup');
  return { deps, workoutId, bench, squat, weBench: a.value, weSquat: b.value };
}

const workoutUpdatedAt = async (id: string) => (await ctx.db.workouts.get(id))!.updatedAt;
const setsOf = (weId: string) => ctx.db.sets.where('workoutExerciseId').equals(weId).sortBy('order');

describe('addExercise', () => {
  it('REQ-1.4: 種目をワークアウトの末尾に追加する', async () => {
    const s = await setup();
    expect(s.weBench).toMatchObject({ workoutId: s.workoutId, exerciseId: s.bench, order: 0, targetSets: null });
    expect(s.weSquat).toMatchObject({ exerciseId: s.squat, order: 1 });
    expect(await ctx.db.workoutExercises.get(s.weSquat.id)).toEqual(s.weSquat);
  });

  it('REQ-1.4: 種目を削除したあとの追加は、既存の最大の順序の次になる（順序を再利用しない）', async () => {
    const s = await setup();
    await removeExercise(ctx.db, s.weBench.id, s.deps);
    const added = await addExercise(ctx.db, s.workoutId, await exerciseId('デッドリフト'), s.deps);
    expect(added.ok && added.value.order).toBe(2);
  });

  it('REQ-1.4: 同じ種目を同じワークアウトに複数回追加できる', async () => {
    const s = await setup();
    const again = await addExercise(ctx.db, s.workoutId, s.bench, s.deps);
    expect(again.ok).toBe(true);
    expect(await ctx.db.workoutExercises.where('exerciseId').equals(s.bench).count()).toBe(2);
  });

  it('REQ-1.4: 別のワークアウトの順序には影響されない', async () => {
    const s = await setup();
    await ctx.db.workouts.put({ id: 'w2', date: '2026-11-01', status: 'completed', memo: '', createdAt: '2026-11-01T00:00:00.000Z', completedAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' });
    const first = await addExercise(ctx.db, 'w2', s.bench, s.deps);
    expect(first.ok && first.value.order).toBe(0);
  });

  it('REQ-2.9: アーカイブ済みの種目は追加せず、exerciseId のエラーを返す', async () => {
    const s = await setup();
    const target = await exerciseId('デッドリフト');
    await ctx.db.exercises.update(target, { archived: true });
    const before = await ctx.db.workoutExercises.count();
    const result = await addExercise(ctx.db, s.workoutId, target, s.deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.exerciseId).toBeTruthy();
    expect(await ctx.db.workoutExercises.count()).toBe(before);
  });

  it('REQ-1.4: 存在しない種目・ワークアウトはエラーを返し、何も追加しない', async () => {
    const s = await setup();
    const before = await ctx.db.workoutExercises.count();
    expect((await addExercise(ctx.db, s.workoutId, 'ghost', s.deps)).ok).toBe(false);
    expect((await addExercise(ctx.db, 'ghost', s.bench, s.deps)).ok).toBe(false);
    expect(await ctx.db.workoutExercises.count()).toBe(before);
  });

  it('REQ-1.25: 完了済みのワークアウトにも種目を追加できる', async () => {
    const s = await setup();
    await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 10 }, s.deps);
    await finishWorkout(ctx.db, s.workoutId, s.deps);
    const added = await addExercise(ctx.db, s.workoutId, await exerciseId('懸垂'), s.deps);
    expect(added.ok).toBe(true);
  });

  it('REQ-1.18: ワークアウトの更新日時を更新する', async () => {
    const s = await setup();
    expect(await workoutUpdatedAt(s.workoutId)).toBe(s.deps.tick());
  });
});

describe('removeExercise', () => {
  it('REQ-1.13: 種目とその種目の全セットを削除する', async () => {
    const s = await setup();
    await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 10 }, s.deps);
    await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 8 }, s.deps);
    expect(await removeExercise(ctx.db, s.weBench.id, s.deps)).toBe('removed');
    expect(await ctx.db.workoutExercises.get(s.weBench.id)).toBeUndefined();
    expect(await setsOf(s.weBench.id)).toEqual([]);
  });

  it('REQ-1.13: 他の種目とそのセット、種目マスタは削除しない', async () => {
    const s = await setup();
    await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 10 }, s.deps);
    await addSet(ctx.db, s.weSquat.id, { weightKg: 100, reps: 5 }, s.deps);
    const exercises = await ctx.db.exercises.count();
    await removeExercise(ctx.db, s.weBench.id, s.deps);
    expect(await ctx.db.workoutExercises.get(s.weSquat.id)).toBeDefined();
    expect(await setsOf(s.weSquat.id)).toHaveLength(1);
    expect(await ctx.db.exercises.count()).toBe(exercises);
  });

  it('REQ-1.13: 存在しない種目記録は not_found を返す', async () => {
    const s = await setup();
    expect(await removeExercise(ctx.db, 'ghost', s.deps)).toBe('not_found');
  });

  it('REQ-2.8: ワークアウトから種目を外すと、種目マスタの削除でアーカイブされなくなる', async () => {
    const s = await setup();
    await removeExercise(ctx.db, s.weBench.id, s.deps);
    expect(await deleteExercise(ctx.db, s.bench, s.deps)).toBe('deleted');
  });
});

describe('addSet', () => {
  it('REQ-1.8: 有効な重量と回数のセットを種目の末尾に追加する', async () => {
    const s = await setup();
    const r1 = await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 10 }, s.deps);
    const r2 = await addSet(ctx.db, s.weBench.id, { weightKg: 62.5, reps: 8 }, s.deps);
    expect(r1.ok && r1.value).toMatchObject({
      workoutExerciseId: s.weBench.id, workoutId: s.workoutId, exerciseId: s.bench, order: 1, weightTenthKg: 600, reps: 10,
    });
    expect(r2.ok && r2.value).toMatchObject({ order: 2, weightTenthKg: 625, reps: 8 });
    expect((await setsOf(s.weBench.id)).map((x) => [x.weightTenthKg, x.reps])).toEqual([[600, 10], [625, 8]]);
  });

  it('REQ-1.8: 自重種目として 0kg のセットを追加できる', async () => {
    const s = await setup();
    const r = await addSet(ctx.db, s.weBench.id, { weightKg: 0, reps: 12 }, s.deps);
    expect(r.ok && r.value.weightTenthKg).toBe(0);
  });

  it('REQ-1.8: セットの順序は種目ごとに 1 から数える', async () => {
    const s = await setup();
    await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 10 }, s.deps);
    const squat = await addSet(ctx.db, s.weSquat.id, { weightKg: 100, reps: 5 }, s.deps);
    expect(squat.ok && squat.value.order).toBe(1);
  });

  it('REQ-1.8: セットを削除したあとの追加は、既存の最大の順序の次になる', async () => {
    const s = await setup();
    const a = await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 10 }, s.deps);
    await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 9 }, s.deps);
    if (!a.ok) throw new Error('setup');
    await deleteSet(ctx.db, a.value.id, s.deps);
    const c = await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 8 }, s.deps);
    expect(c.ok && c.value.order).toBe(3);
  });

  it('REQ-1.9: 不正な値のときセットを追加せず、不正な項目のエラーを返す', async () => {
    const s = await setup();
    const updatedAt = await workoutUpdatedAt(s.workoutId);
    for (const [input, field] of [
      [{ weightKg: -1, reps: 10 }, 'weight'],
      [{ weightKg: 1000, reps: 10 }, 'weight'],
      [{ weightKg: 60.25, reps: 10 }, 'weight'],
      [{ weightKg: null, reps: 10 }, 'weight'],
      [{ weightKg: 60, reps: 0 }, 'reps'],
      [{ weightKg: 60, reps: 8.5 }, 'reps'],
      [{ weightKg: 60, reps: undefined }, 'reps'],
    ] as const) {
      const r = await addSet(ctx.db, s.weBench.id, input, s.deps);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(Object.keys(r.errors)).toContain(field);
    }
    expect(await ctx.db.sets.count()).toBe(0);
    expect(await workoutUpdatedAt(s.workoutId)).toBe(updatedAt);
  });

  it('REQ-1.8: 存在しない種目記録にはエラーを返し、何も追加しない', async () => {
    const s = await setup();
    expect((await addSet(ctx.db, 'ghost', { weightKg: 60, reps: 10 }, s.deps)).ok).toBe(false);
    expect(await ctx.db.sets.count()).toBe(0);
  });

  it('REQ-1.25: 完了済みのワークアウトにもセットを追加できる', async () => {
    const s = await setup();
    await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 10 }, s.deps);
    await finishWorkout(ctx.db, s.workoutId, s.deps);
    expect((await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 8 }, s.deps)).ok).toBe(true);
  });

  it('REQ-1.18: ワークアウトの更新日時を更新する', async () => {
    const s = await setup();
    await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 10 }, s.deps);
    expect(await workoutUpdatedAt(s.workoutId)).toBe(s.deps.tick());
  });
});

describe('updateSet', () => {
  async function withSet() {
    const s = await setup();
    const r = await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 10 }, s.deps);
    if (!r.ok) throw new Error('setup');
    return { ...s, set: r.value };
  }

  it('REQ-1.10: 重量と回数を更新する（ID・順序・作成日時・所属は変えない）', async () => {
    const s = await withSet();
    const r = await updateSet(ctx.db, s.set.id, { weightKg: 62.5, reps: 8 }, s.deps);
    expect(r.ok && r.value).toEqual({ ...s.set, weightTenthKg: 625, reps: 8 });
    expect(await ctx.db.sets.get(s.set.id)).toEqual({ ...s.set, weightTenthKg: 625, reps: 8 });
  });

  it('REQ-1.10: ワークアウトの更新日時を更新する', async () => {
    const s = await withSet();
    await updateSet(ctx.db, s.set.id, { weightKg: 65, reps: 5 }, s.deps);
    expect(await workoutUpdatedAt(s.workoutId)).toBe(s.deps.tick());
  });

  it('REQ-1.11: 不正な値のとき更新せず、エラーを返す', async () => {
    const s = await withSet();
    const updatedAt = await workoutUpdatedAt(s.workoutId);
    const r = await updateSet(ctx.db, s.set.id, { weightKg: 60, reps: 0 }, s.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.reps).toBeTruthy();
    expect(await ctx.db.sets.get(s.set.id)).toEqual(s.set);
    expect(await workoutUpdatedAt(s.workoutId)).toBe(updatedAt);
  });

  it('REQ-1.10: 存在しないセットはエラーを返す', async () => {
    const s = await setup();
    expect((await updateSet(ctx.db, 'ghost', { weightKg: 60, reps: 10 }, s.deps)).ok).toBe(false);
  });
});

describe('deleteSet', () => {
  it('REQ-1.12: 指定したセットだけを削除する', async () => {
    const s = await setup();
    const a = await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 10 }, s.deps);
    const b = await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 8 }, s.deps);
    if (!a.ok || !b.ok) throw new Error('setup');
    expect(await deleteSet(ctx.db, a.value.id, s.deps)).toBe('deleted');
    expect((await setsOf(s.weBench.id)).map((x) => x.id)).toEqual([b.value.id]);
    expect(await ctx.db.workoutExercises.get(s.weBench.id)).toBeDefined();
  });

  it('REQ-1.12: ワークアウトの更新日時を更新する', async () => {
    const s = await setup();
    const a = await addSet(ctx.db, s.weBench.id, { weightKg: 60, reps: 10 }, s.deps);
    if (!a.ok) throw new Error('setup');
    await deleteSet(ctx.db, a.value.id, s.deps);
    expect(await workoutUpdatedAt(s.workoutId)).toBe(s.deps.tick());
  });

  it('REQ-1.12: 存在しないセットは not_found を返す', async () => {
    const s = await setup();
    expect(await deleteSet(ctx.db, 'ghost', s.deps)).toBe('not_found');
  });
});
