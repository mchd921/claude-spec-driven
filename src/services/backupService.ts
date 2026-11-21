import type { WorkoutDatabase } from '../db/database';
import { createBackupFile, validateBackup, type BackupData, type BackupFile } from '../domain/backupSchema';
import { createSetsCsv } from '../domain/csv';
import type { ISODate } from '../domain/types';
import { defaultDeps, type ServiceDeps } from './deps';

export interface RestoreCounts {
  exercises: number;
  workouts: number;
  workoutExercises: number;
  sets: number;
  templates: number;
}

export type RestoreResult =
  | { ok: true; counts: RestoreCounts }
  | { ok: false; error: string; issues: string[] };

function allTables(db: WorkoutDatabase) {
  return [db.exercises, db.workouts, db.workoutExercises, db.sets, db.templates];
}

/** 全テーブルを 1 つの読み取りトランザクションで読み、整合した時点のデータを返す。 */
async function readAll(db: WorkoutDatabase): Promise<BackupData> {
  return db.transaction('r', allTables(db), async () => ({
    exercises: await db.exercises.toArray(),
    workouts: await db.workouts.toArray(),
    workoutExercises: await db.workoutExercises.toArray(),
    sets: await db.sets.toArray(),
    templates: await db.templates.toArray(),
  }));
}

/** 全データをバックアップ用のファイル内容にする（REQ-5.1, 5.2）。 */
export async function exportBackup(
  db: WorkoutDatabase,
  deps: ServiceDeps = defaultDeps,
): Promise<BackupFile> {
  return createBackupFile(await readAll(db), deps.now());
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file);
}

/**
 * バックアップの内容で、既存の全データを置き換える（REQ-5.4〜5.6）。
 *
 * 1. 受け取った値を検証する。不正なら何も書き込まずにエラーを返す（REQ-5.5）。
 * 2. 全テーブルを対象とした 1 つのトランザクションで、全件削除 → 一括追加を行う。
 *    途中でエラーが起きたらトランザクションごとロールバックされ、既存データは元のまま残る。
 *    このとき例外はそのまま投げる（REQ-5.6）。
 *
 * 呼び出し側は、ファイルの検証（parseBackupText）と、置き換えの確認を先に済ませておく。
 */
export async function restoreBackup(db: WorkoutDatabase, backup: unknown): Promise<RestoreResult> {
  const checked = validateBackup(backup);
  if (!checked.ok) return checked;

  const { data } = checked.value;
  await db.transaction('rw', allTables(db), async () => {
    for (const table of allTables(db)) await table.clear();
    await db.exercises.bulkAdd(data.exercises);
    await db.workouts.bulkAdd(data.workouts);
    await db.workoutExercises.bulkAdd(data.workoutExercises);
    await db.sets.bulkAdd(data.sets);
    await db.templates.bulkAdd(data.templates);
  });

  return {
    ok: true,
    counts: {
      exercises: data.exercises.length,
      workouts: data.workouts.length,
      workoutExercises: data.workoutExercises.length,
      sets: data.sets.length,
      templates: data.templates.length,
    },
  };
}

/** 全セットの CSV を作る（REQ-5.7）。 */
export async function exportSetsCsv(db: WorkoutDatabase): Promise<string> {
  const data = await readAll(db);
  return createSetsCsv(data);
}

const compactDate = (date: ISODate) => date.replaceAll('-', '');

export function backupFileName(today: ISODate): string {
  return `workout-tracker-${compactDate(today)}.json`;
}

export function csvFileName(today: ISODate): string {
  return `workout-tracker-sets-${compactDate(today)}.csv`;
}
