import { describe, expect, it, vi } from 'vitest';
import { parseBackupText, type BackupData } from '../domain/backupSchema';
import { CSV_HEADER } from '../domain/csv';
import { createNameKey } from '../domain/validation';
import { setupTestDb, testDeps } from '../test/testDb';
import {
  backupFileName,
  csvFileName,
  exportBackup,
  exportSetsCsv,
  restoreBackup,
  serializeBackup,
} from './backupService';
import { createTemplate } from './templateService';
import { addExercise, addSet, finishWorkout, startWorkout } from './workoutService';

const ctx = setupTestDb();

const exId = async (name: string) =>
  (await ctx.db.exercises.where('nameKey').equals(createNameKey(name)).first())!.id;

/** 完了したワークアウト 1 件・進行中 1 件・メニュー 1 件を作る。 */
async function populate() {
  const deps = testDeps({ today: '2026-11-10' });
  const bench = await exId('ベンチプレス');
  const squat = await exId('スクワット');

  const w1 = await startWorkout(ctx.db, deps);
  const we1 = await addExercise(ctx.db, w1.workoutId, bench, deps);
  if (!we1.ok) throw new Error('setup');
  await addSet(ctx.db, we1.value.id, { weightKg: 60, reps: 10 }, deps);
  await addSet(ctx.db, we1.value.id, { weightKg: 62.5, reps: 8 }, deps);
  await finishWorkout(ctx.db, w1.workoutId, deps);

  const w2 = await startWorkout(ctx.db, deps);
  const we2 = await addExercise(ctx.db, w2.workoutId, squat, deps);
  if (!we2.ok) throw new Error('setup');
  await addSet(ctx.db, we2.value.id, { weightKg: 100, reps: 5 }, deps);

  await createTemplate(ctx.db, { name: '胸の日', items: [{ exerciseId: bench, targetSets: 3 }] }, deps);
}

/** 全テーブルの内容（ID 順）。変化がないことの確認に使う。 */
async function snapshot(): Promise<BackupData> {
  const byId = <T extends { id: string }>(rows: T[]) => rows.sort((a, b) => a.id.localeCompare(b.id));
  return {
    exercises: byId(await ctx.db.exercises.toArray()),
    workouts: byId(await ctx.db.workouts.toArray()),
    workoutExercises: byId(await ctx.db.workoutExercises.toArray()),
    sets: byId(await ctx.db.sets.toArray()),
    templates: byId(await ctx.db.templates.toArray()),
  };
}

describe('exportBackup / serializeBackup', () => {
  it('REQ-5.1: 全ての種目・ワークアウト・セット・メニューを含める', async () => {
    await populate();
    const file = await exportBackup(ctx.db, testDeps());
    const data = await snapshot();
    const sorted = (rows: { id: string }[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    expect(sorted(file.data.exercises)).toEqual(data.exercises);
    expect(sorted(file.data.workouts)).toEqual(data.workouts);
    expect(sorted(file.data.workoutExercises)).toEqual(data.workoutExercises);
    expect(sorted(file.data.sets)).toEqual(data.sets);
    expect(sorted(file.data.templates)).toEqual(data.templates);
    expect(file.data.workouts).toHaveLength(2);
    expect(file.data.sets).toHaveLength(3);
  });

  it('REQ-5.2: 形式名・データ形式のバージョン番号・出力日時を含める', async () => {
    const deps = testDeps();
    const file = await exportBackup(ctx.db, deps);
    expect(file).toMatchObject({ format: 'workout-tracker-backup', version: 1, exportedAt: deps.tick() });
  });

  it('REQ-5.1: 何も記録していなくても、初期種目だけのバックアップを出力できる', async () => {
    const file = await exportBackup(ctx.db, testDeps());
    expect(file.data.exercises.length).toBeGreaterThanOrEqual(18);
    expect(file.data.workouts).toEqual([]);
  });

  it('REQ-5.1: 出力した JSON は、読み込み時の検証を通る', async () => {
    await populate();
    const text = serializeBackup(await exportBackup(ctx.db, testDeps()));
    expect(parseBackupText(text).ok).toBe(true);
  });
});

describe('restoreBackup', () => {
  it('REQ-5.4: 出力 → 変更 → 復元で、出力時点のデータに戻る', async () => {
    await populate();
    const original = await snapshot();
    const text = serializeBackup(await exportBackup(ctx.db, testDeps()));

    await ctx.db.workouts.clear();
    await ctx.db.sets.clear();
    await ctx.db.exercises.where('bodyPart').equals('chest').delete();
    await ctx.db.templates.put({ id: 'noise', name: 'ノイズ', items: [], createdAt: 'x', updatedAt: 'x' });

    const parsed = parseBackupText(text);
    if (!parsed.ok) throw new Error('setup');
    const result = await restoreBackup(ctx.db, parsed.value);
    expect(result.ok).toBe(true);
    expect(await snapshot()).toEqual(original);
  });

  it('REQ-5.4: 既存の全データを、ファイルの内容で置き換える（ファイルにないデータは残さない）', async () => {
    await populate();
    const backup: BackupData = { exercises: [], workouts: [], workoutExercises: [], sets: [], templates: [] };
    const text = JSON.stringify({ format: 'workout-tracker-backup', version: 1, exportedAt: '2026-11-17T10:00:00.000Z', data: backup });
    const parsed = parseBackupText(text);
    if (!parsed.ok) throw new Error('setup');
    const result = await restoreBackup(ctx.db, parsed.value);
    expect(result).toEqual({ ok: true, counts: { exercises: 0, workouts: 0, workoutExercises: 0, sets: 0, templates: 0 } });
    expect(await snapshot()).toEqual(backup);
  });

  it('REQ-5.4: 復元した件数を返す', async () => {
    await populate();
    const file = await exportBackup(ctx.db, testDeps());
    const result = await restoreBackup(ctx.db, file);
    expect(result).toEqual({
      ok: true,
      counts: { exercises: file.data.exercises.length, workouts: 2, workoutExercises: 2, sets: 3, templates: 1 },
    });
  });

  it('REQ-5.5: 不正なバックアップのとき、既存データを変更せずエラーを返す', async () => {
    await populate();
    const before = await snapshot();
    const file = await exportBackup(ctx.db, testDeps());
    const broken = structuredClone(file);
    broken.data.sets[0]!.reps = 0;
    const result = await restoreBackup(ctx.db, broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
      expect(result.issues.length).toBeGreaterThan(0);
    }
    expect(await snapshot()).toEqual(before);
  });

  it('REQ-5.5: 参照の不整合があるバックアップのとき、既存データを変更せずエラーを返す', async () => {
    await populate();
    const before = await snapshot();
    const broken = structuredClone(await exportBackup(ctx.db, testDeps()));
    broken.data.workoutExercises[0]!.workoutId = 'ghost';
    expect((await restoreBackup(ctx.db, broken)).ok).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it('REQ-5.5: バックアップとして不正な値（オブジェクトでない）のとき、エラーを返す', async () => {
    const before = await snapshot();
    expect((await restoreBackup(ctx.db, null)).ok).toBe(false);
    expect((await restoreBackup(ctx.db, 'text')).ok).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it('REQ-5.6: 書き込みの途中でエラーが起きたら、全テーブルが復元前の状態のまま残る', async () => {
    await populate();
    const before = await snapshot();
    const file = await exportBackup(ctx.db, testDeps());
    // 種目は書き込まれたあと、セットの書き込みで失敗する
    vi.spyOn(ctx.db.sets, 'bulkAdd').mockRejectedValueOnce(Object.assign(new Error('disk full'), { name: 'QuotaExceededError' }));

    await ctx.db.workouts.clear(); // 復元前の状態を、バックアップと違うものにしておく
    await ctx.db.templates.clear();
    const changed = await snapshot();
    expect(changed).not.toEqual(before);

    await expect(restoreBackup(ctx.db, file)).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(await snapshot()).toEqual(changed);
  });

  it('REQ-5.6: 途中で失敗したあとも、同じバックアップをもう一度復元できる', async () => {
    await populate();
    const original = await snapshot();
    const file = await exportBackup(ctx.db, testDeps());
    vi.spyOn(ctx.db.sets, 'bulkAdd').mockRejectedValueOnce(new Error('boom'));
    await expect(restoreBackup(ctx.db, file)).rejects.toThrow('boom');
    expect((await restoreBackup(ctx.db, file)).ok).toBe(true);
    expect(await snapshot()).toEqual(original);
  });
});

describe('exportSetsCsv', () => {
  it('REQ-5.7: 全セットを 1 行 1 セットの CSV にする', async () => {
    await populate();
    const csv = await exportSetsCsv(ctx.db);
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines.slice(1, 4)).toEqual([
      '2026-11-10,ベンチプレス,胸,1,60.0,10',
      '2026-11-10,ベンチプレス,胸,2,62.5,8',
      '2026-11-10,スクワット,脚,1,100.0,5',
    ]);
  });

  it('REQ-5.7: セットがないときはヘッダー行だけを出力する', async () => {
    expect(await exportSetsCsv(ctx.db)).toBe(`\uFEFF${CSV_HEADER}\r\n`);
  });
});

describe('ファイル名', () => {
  it('REQ-5.1: バックアップは workout-tracker-YYYYMMDD.json', () => {
    expect(backupFileName('2026-11-17')).toBe('workout-tracker-20261117.json');
  });

  it('REQ-5.7: CSV は workout-tracker-sets-YYYYMMDD.csv', () => {
    expect(csvFileName('2026-01-05')).toBe('workout-tracker-sets-20260105.csv');
  });
});
