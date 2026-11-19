import { z } from 'zod';
import {
  BODY_PARTS,
  type Exercise,
  type ISODateTime,
  type Template,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from './types';
import { createNameKey, isRealDate, MEMO_MAX_LENGTH, NAME_MAX_LENGTH, REPS_MAX, TARGET_SETS_MAX } from './validation';

export const BACKUP_FORMAT = 'workout-tracker-backup';
export const BACKUP_VERSION = 1;
/** エラーとして返す詳細の最大件数 */
const MAX_ISSUES = 10;

export interface BackupData {
  exercises: Exercise[];
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  sets: WorkoutSet[];
  templates: Template[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: ISODateTime;
  data: BackupData;
}

export type BackupParseResult =
  | { ok: true; value: BackupFile }
  | { ok: false; error: string; issues: string[] };

/** エクスポート用のファイル内容を作る（REQ-5.1, 5.2）。 */
export function createBackupFile(data: BackupData, exportedAt: ISODateTime): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, data };
}

// ---- スキーマ（形式と値の範囲）----------------------------------------------

const charLength = (text: string) => Array.from(text).length;

const id = z.string().min(1);
const isoDate = z.string().refine(isRealDate, '日付（YYYY-MM-DD）として正しくありません');
const isoDateTime = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), '日時として正しくありません');
const name = z.string().refine((s) => {
  const length = charLength(s.trim());
  return length >= 1 && length <= NAME_MAX_LENGTH;
}, `名前は 1〜${NAME_MAX_LENGTH} 文字である必要があります`);
const targetSets = z.number().int().min(1).max(TARGET_SETS_MAX).nullable();
const order = z.number().int().min(0);

const exerciseSchema = z.strictObject({
  id,
  name,
  nameKey: z.string().min(1),
  bodyPart: z.enum(BODY_PARTS),
  archived: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const workoutSchema = z.strictObject({
  id,
  date: isoDate,
  status: z.enum(['in_progress', 'completed']),
  memo: z.string().refine((s) => charLength(s) <= MEMO_MAX_LENGTH, `メモは ${MEMO_MAX_LENGTH} 文字以内である必要があります`),
  createdAt: isoDateTime,
  completedAt: isoDateTime.nullable(),
  updatedAt: isoDateTime,
});

const workoutExerciseSchema = z.strictObject({
  id,
  workoutId: id,
  exerciseId: id,
  order,
  targetSets,
});

const setSchema = z.strictObject({
  id,
  workoutExerciseId: id,
  workoutId: id,
  exerciseId: id,
  order,
  weightTenthKg: z.number().int().min(0).max(9999),
  reps: z.number().int().min(1).max(REPS_MAX),
  createdAt: isoDateTime,
});

const templateSchema = z.strictObject({
  id,
  name,
  items: z.array(z.strictObject({ exerciseId: id, targetSets })).min(1),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const backupSchema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: isoDateTime,
  data: z.strictObject({
    exercises: z.array(exerciseSchema),
    workouts: z.array(workoutSchema),
    workoutExercises: z.array(workoutExerciseSchema),
    sets: z.array(setSchema),
    templates: z.array(templateSchema),
  }),
});

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((acc, seg) => {
    if (typeof seg === 'number') return `${acc}[${seg}]`;
    return acc ? `${acc}.${String(seg)}` : String(seg);
  }, '');
}

// ---- データどうしの整合性 --------------------------------------------------

function checkIntegrity(data: BackupData): string[] {
  const issues: string[] = [];

  const tables = [
    ['exercises', data.exercises],
    ['workouts', data.workouts],
    ['workoutExercises', data.workoutExercises],
    ['sets', data.sets],
    ['templates', data.templates],
  ] as const;
  for (const [table, rows] of tables) {
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      if (seen.has(row.id)) issues.push(`data.${table}[${i}]: ID「${row.id}」が重複しています。`);
      seen.add(row.id);
    });
  }

  const exerciseIds = new Set(data.exercises.map((e) => e.id));
  const workoutIds = new Set(data.workouts.map((w) => w.id));
  const workoutExerciseById = new Map(data.workoutExercises.map((we) => [we.id, we]));

  const nameKeys = new Set<string>();
  data.exercises.forEach((e, i) => {
    if (e.nameKey !== createNameKey(e.name)) {
      issues.push(`data.exercises[${i}]: nameKey が種目名「${e.name}」と一致しません。`);
    }
    if (nameKeys.has(e.nameKey)) {
      issues.push(`data.exercises[${i}]: 種目名「${e.name}」が他の種目と重複しています。`);
    }
    nameKeys.add(e.nameKey);
  });

  data.workoutExercises.forEach((we, i) => {
    if (!workoutIds.has(we.workoutId)) {
      issues.push(`data.workoutExercises[${i}]: 存在しないワークアウト「${we.workoutId}」を参照しています。`);
    }
    if (!exerciseIds.has(we.exerciseId)) {
      issues.push(`data.workoutExercises[${i}]: 存在しない種目「${we.exerciseId}」を参照しています。`);
    }
  });

  data.sets.forEach((s, i) => {
    const we = workoutExerciseById.get(s.workoutExerciseId);
    if (!we) {
      issues.push(`data.sets[${i}]: 存在する種目記録「${s.workoutExerciseId}」を参照していません。`);
      return;
    }
    if (s.workoutId !== we.workoutId) {
      issues.push(`data.sets[${i}]: workoutId が種目記録のものと食い違っています。`);
    }
    if (s.exerciseId !== we.exerciseId) {
      issues.push(`data.sets[${i}]: exerciseId が種目記録のものと食い違っています。`);
    }
  });

  data.templates.forEach((t, i) => {
    t.items.forEach((item, j) => {
      if (!exerciseIds.has(item.exerciseId)) {
        issues.push(`data.templates[${i}].items[${j}]: 存在しない種目「${item.exerciseId}」を参照しています。`);
      }
    });
  });

  const inProgress = data.workouts.filter((w) => w.status === 'in_progress').length;
  if (inProgress > 1) {
    issues.push(`data.workouts: 進行中のワークアウトが ${inProgress} 件あります（1 件までです）。`);
  }

  return issues;
}

// ---- 公開 API ------------------------------------------------------------

const reject = (error: string, issues: string[] = []): BackupParseResult => ({
  ok: false,
  error,
  issues: issues.slice(0, MAX_ISSUES),
});

/** 読み込んだ値がバックアップとして妥当か検証する（REQ-5.5）。 */
export function validateBackup(input: unknown): BackupParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return reject('バックアップファイルの形式が正しくありません。', ['ファイルの内容がオブジェクトではありません。']);
  }
  const record = input as Record<string, unknown>;
  if (record.format !== BACKUP_FORMAT) {
    return reject('このアプリのバックアップファイルではありません。');
  }
  if (record.version !== BACKUP_VERSION) {
    const found = record.version === undefined ? 'なし' : String(record.version);
    return reject(`このバックアップのバージョン（${found}）には対応していません（対応: ${BACKUP_VERSION}）。`);
  }

  const parsed = backupSchema.safeParse(input, { error: z.locales.ja().localeError });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => {
      const path = formatPath(i.path);
      return path ? `${path}: ${i.message}` : i.message;
    });
    return reject('バックアップファイルの形式が正しくありません。', issues);
  }

  const value = parsed.data as BackupFile;
  const integrityIssues = checkIntegrity(value.data);
  if (integrityIssues.length > 0) {
    return reject('バックアップのデータに不整合があります。', integrityIssues);
  }
  return { ok: true, value };
}

/** ファイルの文字列を読み込んで検証する（REQ-5.5）。 */
export function parseBackupText(text: string): BackupParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return reject('ファイルを JSON として読み込めませんでした。');
  }
  return validateBackup(json);
}
