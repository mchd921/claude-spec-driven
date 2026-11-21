import { describe, expect, it } from 'vitest';
import { createNameKey } from '../domain/validation';
import { setupTestDb, testDeps } from '../test/testDb';
import {
  createTemplate,
  deleteTemplate,
  draftFromWorkout,
  startWorkoutFromTemplate,
  updateTemplate,
} from './templateService';
import { addExercise, addSet, startWorkout } from './workoutService';

const ctx = setupTestDb();

const exId = async (name: string) =>
  (await ctx.db.exercises.where('nameKey').equals(createNameKey(name)).first())!.id;
const archive = (id: string) => ctx.db.exercises.update(id, { archived: true });

async function ids() {
  return {
    bench: await exId('ベンチプレス'),
    squat: await exId('スクワット'),
    dead: await exId('デッドリフト'),
    pull: await exId('懸垂'),
  };
}

describe('createTemplate', () => {
  it('REQ-4.1: 名前と種目の順序を保ってメニューを登録する', async () => {
    const e = await ids();
    const deps = testDeps();
    const items = [
      { exerciseId: e.squat, targetSets: 5 },
      { exerciseId: e.bench, targetSets: null },
      { exerciseId: e.dead, targetSets: 3 },
    ];
    const result = await createTemplate(ctx.db, { name: '  全身の日 ', items }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ id: 'id-1', name: '全身の日', items });
    expect(result.value.createdAt).toBe(result.value.updatedAt);
    expect(await ctx.db.templates.get('id-1')).toEqual(result.value);
  });

  it('REQ-4.4: 目標セット数（1〜20）と未設定（null）を保存する', async () => {
    const e = await ids();
    const items = [
      { exerciseId: e.bench, targetSets: 1 },
      { exerciseId: e.squat, targetSets: 20 },
      { exerciseId: e.dead, targetSets: null },
    ];
    const result = await createTemplate(ctx.db, { name: 'テスト', items }, testDeps());
    expect(result.ok && result.value.items.map((i) => i.targetSets)).toEqual([1, 20, null]);
  });

  it('REQ-4.1: 同じ種目を複数回含められる', async () => {
    const e = await ids();
    const items = [{ exerciseId: e.bench, targetSets: 3 }, { exerciseId: e.bench, targetSets: 2 }];
    expect((await createTemplate(ctx.db, { name: 'ベンチ 2 回', items }, testDeps())).ok).toBe(true);
  });

  it.each([['空', ''], ['空白のみ', '   '], ['51 文字', 'あ'.repeat(51)]])(
    'REQ-4.2: 名前が %s のとき登録せず、name のエラーを返す',
    async (_n, name) => {
      const e = await ids();
      const result = await createTemplate(ctx.db, { name, items: [{ exerciseId: e.bench, targetSets: null }] }, testDeps());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.name).toBeTruthy();
      expect(await ctx.db.templates.count()).toBe(0);
    },
  );

  it('REQ-4.3: 種目が 0 件のとき登録せず、items のエラーを返す', async () => {
    const result = await createTemplate(ctx.db, { name: '空', items: [] }, testDeps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.items).toBeTruthy();
    expect(await ctx.db.templates.count()).toBe(0);
  });

  it.each([0, 21, 2.5])('REQ-4.4: 目標セット数が %s のとき登録せず、その種目のエラーを返す', async (targetSets) => {
    const e = await ids();
    const items = [{ exerciseId: e.bench, targetSets: null }, { exerciseId: e.squat, targetSets }];
    const result = await createTemplate(ctx.db, { name: 'テスト', items }, testDeps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors['items.1.targetSets']).toBeTruthy();
    expect(await ctx.db.templates.count()).toBe(0);
  });

  it('REQ-4.1: 存在しない種目を含むとき登録せず、その種目のエラーを返す', async () => {
    const e = await ids();
    const items = [{ exerciseId: e.bench, targetSets: null }, { exerciseId: 'ghost', targetSets: null }];
    const result = await createTemplate(ctx.db, { name: 'テスト', items }, testDeps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors['items.1.exerciseId']).toBeTruthy();
    expect(await ctx.db.templates.count()).toBe(0);
  });

  it('REQ-2.9: アーカイブ済みの種目は、新しいメニューに追加できない', async () => {
    const e = await ids();
    await archive(e.bench);
    const result = await createTemplate(ctx.db, { name: 'テスト', items: [{ exerciseId: e.bench, targetSets: null }] }, testDeps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors['items.0.exerciseId']).toBeTruthy();
  });

  it('REQ-4.1: 名前と種目がともに不正なとき、両方のエラーを返す', async () => {
    const result = await createTemplate(ctx.db, { name: '', items: [] }, testDeps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['items', 'name']);
  });
});

describe('updateTemplate', () => {
  async function created() {
    const e = await ids();
    const deps = testDeps();
    const r = await createTemplate(ctx.db, {
      name: '胸の日',
      items: [
        { exerciseId: e.bench, targetSets: 3 },
        { exerciseId: e.squat, targetSets: null },
        { exerciseId: e.dead, targetSets: 5 },
      ],
    }, deps);
    if (!r.ok) throw new Error('setup');
    return { e, deps, template: r.value };
  }

  it('REQ-4.6: 名前・種目・目標セット数を更新し、更新日時を更新する（作成日時は変えない）', async () => {
    const { e, deps, template } = await created();
    const items = [{ exerciseId: e.pull, targetSets: 4 }];
    const result = await updateTemplate(ctx.db, template.id, { name: ' 背中の日 ', items }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ id: template.id, name: '背中の日', items, createdAt: template.createdAt });
    expect(result.value.updatedAt).not.toBe(template.updatedAt);
    expect(await ctx.db.templates.get(template.id)).toEqual(result.value);
  });

  it('REQ-4.5: 種目を並べ替えて更新すると、新しい順序で保存される', async () => {
    const { deps, template } = await created();
    const [a, b, c] = template.items as [typeof template.items[0], typeof template.items[0], typeof template.items[0]];
    const result = await updateTemplate(ctx.db, template.id, { name: template.name, items: [c, a, b] }, deps);
    expect(result.ok).toBe(true);
    expect((await ctx.db.templates.get(template.id))?.items).toEqual([c, a, b]);
  });

  it('REQ-4.6: 不正な値のとき更新せず、エラーを返す', async () => {
    const { template } = await created();
    const r1 = await updateTemplate(ctx.db, template.id, { name: '', items: template.items }, testDeps());
    const r2 = await updateTemplate(ctx.db, template.id, { name: '胸の日', items: [] }, testDeps());
    const r3 = await updateTemplate(ctx.db, template.id, { name: '胸の日', items: [{ exerciseId: template.items[0]!.exerciseId, targetSets: 99 }] }, testDeps());
    expect([r1.ok, r2.ok, r3.ok]).toEqual([false, false, false]);
    expect(await ctx.db.templates.get(template.id)).toEqual(template);
  });

  it('REQ-4.6: 存在しないメニューはエラーを返す', async () => {
    const e = await ids();
    const r = await updateTemplate(ctx.db, 'ghost', { name: 'x', items: [{ exerciseId: e.bench, targetSets: null }] }, testDeps());
    expect(r.ok).toBe(false);
  });

  it('REQ-4.6: すでにメニューに含まれているアーカイブ済みの種目は、そのまま残して編集できる', async () => {
    const { e, deps, template } = await created();
    await archive(e.bench);
    const result = await updateTemplate(ctx.db, template.id, { name: '名前だけ変更', items: template.items }, deps);
    expect(result.ok).toBe(true);
    expect((await ctx.db.templates.get(template.id))?.items).toEqual(template.items);
  });

  it('REQ-2.9: 編集で、アーカイブ済みの種目を新しく追加することはできない', async () => {
    const { e, deps, template } = await created();
    await archive(e.pull);
    const items = [...template.items, { exerciseId: e.pull, targetSets: null }];
    const result = await updateTemplate(ctx.db, template.id, { name: template.name, items }, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors['items.3.exerciseId']).toBeTruthy();
    expect(await ctx.db.templates.get(template.id)).toEqual(template);
  });
});

describe('deleteTemplate', () => {
  it('REQ-4.7: メニューを削除する。他のメニューと種目マスタは削除しない', async () => {
    const e = await ids();
    const deps = testDeps();
    const a = await createTemplate(ctx.db, { name: 'A', items: [{ exerciseId: e.bench, targetSets: null }] }, deps);
    const b = await createTemplate(ctx.db, { name: 'B', items: [{ exerciseId: e.squat, targetSets: null }] }, deps);
    if (!a.ok || !b.ok) throw new Error('setup');
    const exercises = await ctx.db.exercises.count();
    expect(await deleteTemplate(ctx.db, a.value.id)).toBe('deleted');
    expect(await ctx.db.templates.get(a.value.id)).toBeUndefined();
    expect(await ctx.db.templates.get(b.value.id)).toBeDefined();
    expect(await ctx.db.exercises.count()).toBe(exercises);
  });

  it('REQ-4.7: 存在しないメニューは not_found を返す', async () => {
    expect(await deleteTemplate(ctx.db, 'ghost')).toBe('not_found');
  });
});

describe('startWorkoutFromTemplate', () => {
  async function template(items?: Array<{ exerciseId: string; targetSets: number | null }>) {
    const e = await ids();
    const r = await createTemplate(ctx.db, {
      name: '全身の日',
      items: items ?? [
        { exerciseId: e.squat, targetSets: 5 },
        { exerciseId: e.bench, targetSets: null },
        { exerciseId: e.dead, targetSets: 3 },
      ],
    }, testDeps());
    if (!r.ok) throw new Error('setup');
    return { e, template: r.value };
  }

  it('REQ-4.8: メニューの種目を順番どおりにワークアウトへ追加し、目標セット数を引き継ぐ', async () => {
    const { e, template: t } = await template();
    const deps = testDeps({ today: '2026-11-17' });
    const result = await startWorkoutFromTemplate(ctx.db, t.id, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ created: true, skippedExerciseNames: [] });
    const workout = await ctx.db.workouts.get(result.value.workoutId);
    expect(workout).toMatchObject({ date: '2026-11-17', status: 'in_progress' });
    const list = await ctx.db.workoutExercises.where('workoutId').equals(result.value.workoutId).sortBy('order');
    expect(list.map((we) => [we.exerciseId, we.order, we.targetSets])).toEqual([
      [e.squat, 0, 5],
      [e.bench, 1, null],
      [e.dead, 2, 3],
    ]);
    expect(await ctx.db.sets.count()).toBe(0);
  });

  it('REQ-4.9: アーカイブ済みの種目はワークアウトに追加せず、追加しなかった種目名を返す', async () => {
    const { e, template: t } = await template();
    await archive(e.bench);
    const result = await startWorkoutFromTemplate(ctx.db, t.id, testDeps());
    expect(result.ok && result.value.skippedExerciseNames).toEqual(['ベンチプレス']);
    if (!result.ok) return;
    const list = await ctx.db.workoutExercises.where('workoutId').equals(result.value.workoutId).sortBy('order');
    expect(list.map((we) => [we.exerciseId, we.order])).toEqual([[e.squat, 0], [e.dead, 1]]);
  });

  it('REQ-4.9: すべての種目がアーカイブ済みのときも、空のワークアウトを作り、種目名を返す', async () => {
    const { e, template: t } = await template([{ exerciseId: (await ids()).bench, targetSets: null }]);
    await archive(e.bench);
    const result = await startWorkoutFromTemplate(ctx.db, t.id, testDeps());
    expect(result.ok && result.value).toMatchObject({ created: true, skippedExerciseNames: ['ベンチプレス'] });
    expect(await ctx.db.workoutExercises.count()).toBe(0);
    expect(await ctx.db.workouts.count()).toBe(1);
  });

  it('REQ-1.24: 進行中のワークアウトがあるとき、新しく作らず種目も追加せず、既存の ID を返す', async () => {
    const { template: t } = await template();
    const running = await startWorkout(ctx.db, testDeps());
    const result = await startWorkoutFromTemplate(ctx.db, t.id, testDeps());
    expect(result.ok && result.value).toEqual({ workoutId: running.workoutId, created: false, skippedExerciseNames: [] });
    expect(await ctx.db.workouts.count()).toBe(1);
    expect(await ctx.db.workoutExercises.count()).toBe(0);
  });

  it('REQ-4.8: 存在しないメニューはエラーを返し、ワークアウトを作らない', async () => {
    const result = await startWorkoutFromTemplate(ctx.db, 'ghost', testDeps());
    expect(result.ok).toBe(false);
    expect(await ctx.db.workouts.count()).toBe(0);
  });

  it('REQ-4.8: メニューは変更しない', async () => {
    const { template: t } = await template();
    await startWorkoutFromTemplate(ctx.db, t.id, testDeps());
    expect(await ctx.db.templates.get(t.id)).toEqual(t);
  });
});

describe('draftFromWorkout', () => {
  async function workoutWithSets(setCounts: number[], names = ['ベンチプレス', 'スクワット', 'デッドリフト']) {
    const deps = testDeps();
    const { workoutId } = await startWorkout(ctx.db, deps);
    const exercises: string[] = [];
    for (const [i, count] of setCounts.entries()) {
      const exerciseId = await exId(names[i]!);
      exercises.push(exerciseId);
      const we = await addExercise(ctx.db, workoutId, exerciseId, deps);
      if (!we.ok) throw new Error('setup');
      for (let n = 0; n < count; n++) await addSet(ctx.db, we.value.id, { weightKg: 60, reps: 10 }, deps);
    }
    return { workoutId, exercises };
  }

  it('REQ-4.11: 種目の順序と、各種目のセット数を目標セット数とした下書きを返す', async () => {
    const { workoutId, exercises } = await workoutWithSets([3, 5, 2]);
    const result = await draftFromWorkout(ctx.db, workoutId);
    expect(result.ok && result.value).toEqual({
      name: '',
      items: [
        { exerciseId: exercises[0], targetSets: 3 },
        { exerciseId: exercises[1], targetSets: 5 },
        { exerciseId: exercises[2], targetSets: 2 },
      ],
      excludedExerciseNames: [],
    });
  });

  it('REQ-4.11: 下書きは保存しない', async () => {
    const { workoutId } = await workoutWithSets([3]);
    await draftFromWorkout(ctx.db, workoutId);
    expect(await ctx.db.templates.count()).toBe(0);
  });

  it('REQ-4.11: セット数が 20 を超える種目は 20 にする', async () => {
    const { workoutId } = await workoutWithSets([25]);
    const result = await draftFromWorkout(ctx.db, workoutId);
    expect(result.ok && result.value.items[0]?.targetSets).toBe(20);
  });

  it('REQ-4.11: セットのない種目の目標セット数は null（未設定）にする', async () => {
    const { workoutId } = await workoutWithSets([0, 2]);
    const result = await draftFromWorkout(ctx.db, workoutId);
    expect(result.ok && result.value.items.map((i) => i.targetSets)).toEqual([null, 2]);
  });

  it('REQ-4.11: 同じ種目を複数回行った場合は、種目記録ごとに項目にする', async () => {
    const { workoutId } = await workoutWithSets([3, 2], ['ベンチプレス', 'ベンチプレス']);
    const result = await draftFromWorkout(ctx.db, workoutId);
    expect(result.ok && result.value.items.map((i) => i.targetSets)).toEqual([3, 2]);
  });

  it('REQ-2.9: アーカイブ済みの種目は下書きに含めず、種目名を返す', async () => {
    const { workoutId, exercises } = await workoutWithSets([3, 5]);
    await archive(exercises[0]!);
    const result = await draftFromWorkout(ctx.db, workoutId);
    expect(result.ok && result.value.items.map((i) => i.exerciseId)).toEqual([exercises[1]]);
    expect(result.ok && result.value.excludedExerciseNames).toEqual(['ベンチプレス']);
  });

  it('REQ-4.11: 下書きはそのままメニューとして登録できる（名前を付ければ有効）', async () => {
    const { workoutId } = await workoutWithSets([3, 5]);
    const draft = await draftFromWorkout(ctx.db, workoutId);
    if (!draft.ok) throw new Error('setup');
    const saved = await createTemplate(ctx.db, { name: '今日のメニュー', items: draft.value.items }, testDeps());
    expect(saved.ok).toBe(true);
  });

  it('REQ-4.11: 存在しないワークアウトはエラーを返す', async () => {
    expect((await draftFromWorkout(ctx.db, 'ghost')).ok).toBe(false);
  });
});
