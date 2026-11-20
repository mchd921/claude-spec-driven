import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { BODY_PARTS, type Exercise, type Workout } from '../domain/types';
import { createNameKey, validateExerciseName } from '../domain/validation';
import { createDatabase, type WorkoutDatabase } from './database';

let counter = 0;
const opened: WorkoutDatabase[] = [];
const names: string[] = [];

function open(name?: string): WorkoutDatabase {
  const dbName = name ?? `test-db-${Date.now()}-${++counter}`;
  if (!names.includes(dbName)) names.push(dbName);
  const db = createDatabase(dbName);
  opened.push(db);
  return db;
}

afterEach(async () => {
  for (const db of opened.splice(0)) db.close();
  for (const name of names.splice(0)) await Dexie.delete(name);
});

const T = '2026-11-17T10:00:00.000Z';
const exercise = (id: string, name: string): Exercise => ({
  id, name, nameKey: createNameKey(name), bodyPart: 'chest', archived: false, createdAt: T, updatedAt: T,
});

describe('初期データ', () => {
  it('REQ-2.1: 新しい DB を作ると、胸・背中・脚・肩・腕・腹の各部位に 3 種目以上が登録される', async () => {
    const db = open();
    const all = await db.exercises.toArray();
    for (const part of ['chest', 'back', 'legs', 'shoulders', 'arms', 'abs'] as const) {
      expect(all.filter((e) => e.bodyPart === part).length, part).toBeGreaterThanOrEqual(3);
    }
  });

  it('REQ-2.1: 「その他」には初期種目を登録しない', async () => {
    const db = open();
    expect(await db.exercises.where('bodyPart').equals('other').count()).toBe(0);
  });

  it('REQ-2.1: 初期種目は有効（未アーカイブ）で、種目名の検証を満たし、nameKey が一意', async () => {
    const db = open();
    const all = await db.exercises.toArray();
    expect(all.length).toBeGreaterThanOrEqual(18);
    expect(all.every((e) => !e.archived)).toBe(true);
    expect(all.every((e) => (BODY_PARTS as readonly string[]).includes(e.bodyPart))).toBe(true);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    expect(new Set(all.map((e) => e.nameKey)).size).toBe(all.length);
    for (const e of all) {
      expect(e.nameKey).toBe(createNameKey(e.name));
      expect(validateExerciseName(e.name, [], e.id).ok).toBe(true);
      expect(Number.isNaN(Date.parse(e.createdAt))).toBe(false);
    }
  });

  it('REQ-2.1: DB を開き直しても、初期種目が重複して登録されない', async () => {
    const name = `test-db-reopen-${Date.now()}`;
    const first = open(name);
    const count = await first.exercises.count();
    first.close();
    const second = open(name);
    expect(await second.exercises.count()).toBe(count);
  });

  it('REQ-2.1: 初期種目を削除したあとに開き直しても、再登録されない', async () => {
    const name = `test-db-deleted-${Date.now()}`;
    const first = open(name);
    await first.exercises.clear();
    first.close();
    const second = open(name);
    expect(await second.exercises.count()).toBe(0);
  });
});

describe('スキーマ', () => {
  it('設計書 3.3 の 5 つのテーブルを持つ', () => {
    const db = open();
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['exercises', 'sets', 'templates', 'workoutExercises', 'workouts'],
    );
  });

  it('REQ-2.4: nameKey の一意インデックスにより、同じ nameKey の種目を追加できない', async () => {
    const db = open();
    await db.exercises.add(exercise('x1', 'テスト種目'));
    await expect(db.exercises.add(exercise('x2', 'テスト種目'))).rejects.toMatchObject({ name: 'ConstraintError' });
  });

  it('インデックスで、ワークアウト・種目ごとにセットを取り出せる', async () => {
    const db = open();
    const set = (id: string, workoutId: string, exerciseId: string) => ({
      id, workoutExerciseId: `we-${workoutId}-${exerciseId}`, workoutId, exerciseId, order: 1, weightTenthKg: 600, reps: 10, createdAt: T,
    });
    await db.sets.bulkAdd([set('a', 'w1', 'e1'), set('b', 'w1', 'e2'), set('c', 'w2', 'e1')]);
    expect((await db.sets.where('workoutId').equals('w1').toArray()).map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect((await db.sets.where('exerciseId').equals('e1').toArray()).map((s) => s.id).sort()).toEqual(['a', 'c']);
    expect((await db.sets.where('workoutExerciseId').equals('we-w2-e1').toArray()).map((s) => s.id)).toEqual(['c']);
  });

  it('日付・状態でワークアウトを取り出せる', async () => {
    const db = open();
    const workout = (id: string, date: string, status: Workout['status']): Workout => ({
      id, date, status, memo: '', createdAt: T, completedAt: status === 'completed' ? T : null, updatedAt: T,
    });
    await db.workouts.bulkAdd([workout('a', '2026-11-01', 'completed'), workout('b', '2026-11-10', 'in_progress')]);
    expect((await db.workouts.where('status').equals('in_progress').toArray()).map((w) => w.id)).toEqual(['b']);
    expect((await db.workouts.orderBy('date').reverse().toArray()).map((w) => w.id)).toEqual(['b', 'a']);
  });

  it('NFR-7: 保存したデータは DB を開き直しても残る（IndexedDB に保存される）', async () => {
    const name = `test-db-persist-${Date.now()}`;
    const first = open(name);
    await first.workouts.add({ id: 'w1', date: '2026-11-10', status: 'completed', memo: 'メモ', createdAt: T, completedAt: T, updatedAt: T });
    first.close();
    const second = open(name);
    expect((await second.workouts.get('w1'))?.memo).toBe('メモ');
  });
});
