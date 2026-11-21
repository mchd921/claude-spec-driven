import { describe, expect, it, vi } from 'vitest';
import { createNameKey } from '../domain/validation';
import { testDeps, setupTestDb } from '../test/testDb';
import {
  createExercise,
  deleteExercise,
  restoreExercise,
  updateExercise,
} from './exerciseService';

const ctx = setupTestDb();
const T = '2026-11-17T10:00:00.000Z';

async function findByName(name: string) {
  return ctx.db.exercises.where('nameKey').equals(createNameKey(name)).first();
}

async function useInWorkout(exerciseId: string) {
  await ctx.db.workouts.add({ id: 'w1', date: '2026-11-10', status: 'completed', memo: '', createdAt: T, completedAt: T, updatedAt: T });
  await ctx.db.workoutExercises.add({ id: 'we1', workoutId: 'w1', exerciseId, order: 0, targetSets: null });
}

async function useInTemplate(exerciseId: string) {
  await ctx.db.templates.add({ id: 't1', name: '胸の日', items: [{ exerciseId, targetSets: 3 }], createdAt: T, updatedAt: T });
}

describe('createExercise', () => {
  it('REQ-2.2: 種目名と部位を指定して種目を登録する', async () => {
    const deps = testDeps();
    const result = await createExercise(ctx.db, { name: '  チンニング ', bodyPart: 'back' }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: 'id-1', name: 'チンニング', nameKey: createNameKey('チンニング'), bodyPart: 'back', archived: false,
    });
    expect(result.value.createdAt).toBe(result.value.updatedAt);
    expect(await ctx.db.exercises.get('id-1')).toEqual(result.value);
  });

  it.each([['空', ''], ['空白のみ', '   '], ['51 文字', 'あ'.repeat(51)]])(
    'REQ-2.3: 種目名が %s のとき登録せず、name のエラーを返す',
    async (_n, name) => {
      const before = await ctx.db.exercises.count();
      const result = await createExercise(ctx.db, { name, bodyPart: 'chest' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.name).toBeTruthy();
      expect(await ctx.db.exercises.count()).toBe(before);
    },
  );

  it.each(['ベンチプレス', ' ベンチプレス ', 'ﾍﾞﾝﾁﾌﾟﾚｽ'])(
    'REQ-2.4: 既存の種目と重複する名前（%s）は登録せず、重複のエラーを返す',
    async (name) => {
      const before = await ctx.db.exercises.count();
      const result = await createExercise(ctx.db, { name, bodyPart: 'chest' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.name).toContain('重複');
      expect(await ctx.db.exercises.count()).toBe(before);
    },
  );

  it('REQ-2.4: アーカイブ済みの種目と同じ名前も重複として拒否する', async () => {
    const bench = (await findByName('ベンチプレス'))!;
    await useInWorkout(bench.id);
    expect(await deleteExercise(ctx.db, bench.id)).toBe('archived');
    const result = await createExercise(ctx.db, { name: 'ベンチプレス', bodyPart: 'chest' });
    expect(result.ok).toBe(false);
  });

  it('REQ-2.4: 同じ名前を同時に 2 回登録しても、登録されるのは 1 件だけ', async () => {
    const [a, b] = await Promise.all([
      createExercise(ctx.db, { name: '新種目', bodyPart: 'other' }),
      createExercise(ctx.db, { name: '新種目', bodyPart: 'other' }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(await ctx.db.exercises.where('nameKey').equals(createNameKey('新種目')).count()).toBe(1);
  });

  it('REQ-2.4: 一意インデックス違反が起きたときも、重複のエラーとして返す', async () => {
    vi.spyOn(ctx.db.exercises, 'add').mockRejectedValueOnce(
      Object.assign(new Error('Key already exists'), { name: 'ConstraintError' }),
    );
    const result = await createExercise(ctx.db, { name: '新種目', bodyPart: 'other' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toContain('重複');
  });

  it('REQ-2.2: 部位が不正なとき登録せず、bodyPart のエラーを返す', async () => {
    const before = await ctx.db.exercises.count();
    const result = await createExercise(ctx.db, { name: '新種目', bodyPart: 'neck' as never });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.bodyPart).toBeTruthy();
    expect(await ctx.db.exercises.count()).toBe(before);
  });

  it('REQ-2.2: DB のエラーは握りつぶさず、そのまま投げる', async () => {
    vi.spyOn(ctx.db.exercises, 'add').mockRejectedValueOnce(Object.assign(new Error('disk full'), { name: 'QuotaExceededError' }));
    await expect(createExercise(ctx.db, { name: '新種目', bodyPart: 'other' })).rejects.toMatchObject({ name: 'QuotaExceededError' });
  });
});

describe('updateExercise', () => {
  it('REQ-2.5: 名前と部位を更新し、nameKey と更新日時も更新する（作成日時は変えない）', async () => {
    const deps = testDeps();
    const created = await createExercise(ctx.db, { name: '旧名', bodyPart: 'arms' }, deps);
    if (!created.ok) throw new Error('setup');
    const result = await updateExercise(ctx.db, created.value.id, { name: ' 新名 ', bodyPart: 'shoulders' }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ name: '新名', nameKey: createNameKey('新名'), bodyPart: 'shoulders', createdAt: created.value.createdAt });
    expect(result.value.updatedAt > created.value.updatedAt).toBe(true);
    expect(await ctx.db.exercises.get(created.value.id)).toEqual(result.value);
  });

  it('REQ-2.5: 名前を変えずに部位だけ変更できる（自分自身との重複にならない）', async () => {
    const bench = (await findByName('ベンチプレス'))!;
    const result = await updateExercise(ctx.db, bench.id, { name: 'ベンチプレス', bodyPart: 'arms' });
    expect(result.ok).toBe(true);
    expect((await ctx.db.exercises.get(bench.id))?.bodyPart).toBe('arms');
  });

  it('REQ-2.5: 大文字・小文字や全角・半角だけを変える編集もできる', async () => {
    const created = await createExercise(ctx.db, { name: 'Bench', bodyPart: 'chest' });
    if (!created.ok) throw new Error('setup');
    const result = await updateExercise(ctx.db, created.value.id, { name: 'ＢＥＮＣＨ', bodyPart: 'chest' });
    expect(result.ok).toBe(true);
    expect((await ctx.db.exercises.get(created.value.id))?.name).toBe('ＢＥＮＣＨ');
  });

  it('REQ-2.6: 他の種目と重複する名前に変更しようとすると、更新せずエラーを返す', async () => {
    const bench = (await findByName('ベンチプレス'))!;
    const result = await updateExercise(ctx.db, bench.id, { name: 'スクワット', bodyPart: 'chest' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toContain('重複');
    expect(await ctx.db.exercises.get(bench.id)).toEqual(bench);
  });

  it.each([['空', ''], ['51 文字', 'あ'.repeat(51)]])('REQ-2.6: 名前が %s のとき更新せずエラーを返す', async (_n, name) => {
    const bench = (await findByName('ベンチプレス'))!;
    const result = await updateExercise(ctx.db, bench.id, { name, bodyPart: 'chest' });
    expect(result.ok).toBe(false);
    expect(await ctx.db.exercises.get(bench.id)).toEqual(bench);
  });

  it('REQ-2.5: 部位が不正なとき更新せずエラーを返す', async () => {
    const bench = (await findByName('ベンチプレス'))!;
    const result = await updateExercise(ctx.db, bench.id, { name: 'ベンチプレス', bodyPart: 'neck' as never });
    expect(result.ok).toBe(false);
    expect(await ctx.db.exercises.get(bench.id)).toEqual(bench);
  });

  it('REQ-2.5: 存在しない種目のときエラーを返す', async () => {
    const result = await updateExercise(ctx.db, 'ghost', { name: '何か', bodyPart: 'chest' });
    expect(result.ok).toBe(false);
  });

  it('REQ-2.5: アーカイブ済みの種目も編集でき、アーカイブ状態は変わらない', async () => {
    const bench = (await findByName('ベンチプレス'))!;
    await useInWorkout(bench.id);
    await deleteExercise(ctx.db, bench.id);
    const result = await updateExercise(ctx.db, bench.id, { name: 'ベンチ', bodyPart: 'chest' });
    expect(result.ok).toBe(true);
    expect((await ctx.db.exercises.get(bench.id))?.archived).toBe(true);
  });
});

describe('deleteExercise', () => {
  it('REQ-2.7: どこにも使われていない種目は削除する', async () => {
    const bench = (await findByName('ベンチプレス'))!;
    expect(await deleteExercise(ctx.db, bench.id)).toBe('deleted');
    expect(await ctx.db.exercises.get(bench.id)).toBeUndefined();
  });

  it('REQ-2.8: ワークアウトで使われている種目は削除せずアーカイブする', async () => {
    const deps = testDeps();
    const bench = (await findByName('ベンチプレス'))!;
    await useInWorkout(bench.id);
    expect(await deleteExercise(ctx.db, bench.id, deps)).toBe('archived');
    const after = await ctx.db.exercises.get(bench.id);
    expect(after).toMatchObject({ archived: true, name: 'ベンチプレス' });
    expect(after!.updatedAt).not.toBe(bench.updatedAt);
    expect(after!.updatedAt).toBe(deps.tick());
    expect(await ctx.db.workoutExercises.count()).toBe(1);
  });

  it('REQ-2.8: メニューだけで使われている種目も、削除せずアーカイブする', async () => {
    const bench = (await findByName('ベンチプレス'))!;
    await useInTemplate(bench.id);
    expect(await deleteExercise(ctx.db, bench.id)).toBe('archived');
    expect((await ctx.db.exercises.get(bench.id))?.archived).toBe(true);
  });

  it('REQ-2.8: 複数のメニューのうち 2 つ目の項目で使われている場合もアーカイブする', async () => {
    const bench = (await findByName('ベンチプレス'))!;
    const squat = (await findByName('スクワット'))!;
    await ctx.db.templates.add({ id: 't1', name: '全身', items: [{ exerciseId: squat.id, targetSets: null }, { exerciseId: bench.id, targetSets: null }], createdAt: T, updatedAt: T });
    expect(await deleteExercise(ctx.db, bench.id)).toBe('archived');
  });

  it('REQ-2.8: すでにアーカイブ済みで使用中の種目を再度削除しても、アーカイブのまま', async () => {
    const bench = (await findByName('ベンチプレス'))!;
    await useInWorkout(bench.id);
    await deleteExercise(ctx.db, bench.id);
    expect(await deleteExercise(ctx.db, bench.id)).toBe('archived');
    expect(await ctx.db.exercises.get(bench.id)).toBeDefined();
  });

  it('REQ-2.7: アーカイブ済みでも、その後どこにも使われなくなった種目は削除できる', async () => {
    const bench = (await findByName('ベンチプレス'))!;
    await useInWorkout(bench.id);
    await deleteExercise(ctx.db, bench.id);
    await ctx.db.workoutExercises.clear();
    expect(await deleteExercise(ctx.db, bench.id)).toBe('deleted');
    expect(await ctx.db.exercises.get(bench.id)).toBeUndefined();
  });

  it('REQ-2.7: 他の種目が使われていても、別の種目の削除には影響しない', async () => {
    const bench = (await findByName('ベンチプレス'))!;
    const squat = (await findByName('スクワット'))!;
    await useInWorkout(bench.id);
    expect(await deleteExercise(ctx.db, squat.id)).toBe('deleted');
  });

  it('REQ-2.7: 存在しない種目は not_found を返す', async () => {
    expect(await deleteExercise(ctx.db, 'ghost')).toBe('not_found');
  });
});

describe('restoreExercise', () => {
  it('REQ-2.11: アーカイブ済みの種目を有効な種目に戻す', async () => {
    const deps = testDeps();
    const bench = (await findByName('ベンチプレス'))!;
    await useInWorkout(bench.id);
    await deleteExercise(ctx.db, bench.id, deps);
    const archived = (await ctx.db.exercises.get(bench.id))!;
    const result = await restoreExercise(ctx.db, bench.id, deps);
    expect(result.ok).toBe(true);
    const after = (await ctx.db.exercises.get(bench.id))!;
    expect(after.archived).toBe(false);
    expect(after.updatedAt > archived.updatedAt).toBe(true);
  });

  it('REQ-2.11: すでに有効な種目を戻しても、エラーにならず有効なまま', async () => {
    const bench = (await findByName('ベンチプレス'))!;
    const result = await restoreExercise(ctx.db, bench.id);
    expect(result.ok).toBe(true);
    expect((await ctx.db.exercises.get(bench.id))?.archived).toBe(false);
  });

  it('REQ-2.11: 存在しない種目のときエラーを返す', async () => {
    expect((await restoreExercise(ctx.db, 'ghost')).ok).toBe(false);
  });
});
