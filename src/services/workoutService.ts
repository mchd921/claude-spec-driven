import type { WorkoutDatabase } from '../db/database';
import type { ID, ISODate, Workout, WorkoutExercise, WorkoutSet } from '../domain/types';
import {
  truncateMemo,
  validateSet,
  validateWorkoutDate,
  type ValidationResult,
} from '../domain/validation';
import { defaultDeps, type ServiceDeps } from './deps';
import { failure, notFound, success } from './result';

const WORKOUT_LABEL = 'ワークアウト';

export interface StartResult {
  workoutId: ID;
  /** 新しく作成したとき true。進行中のワークアウトを返したとき false。 */
  created: boolean;
}

export type FinishResult =
  | { status: 'finished' }
  | { status: 'needs_discard_confirm' }
  | { status: 'not_found' };

/**
 * ワークアウトを開始する（REQ-1.1, 1.24）。
 * 進行中のワークアウトがあるときは、新しく作らずその ID を返す。
 * 確認と作成を 1 つのトランザクションで行い、同時に呼ばれても進行中は 1 件に保つ。
 */
export async function startWorkout(
  db: WorkoutDatabase,
  deps: ServiceDeps = defaultDeps,
): Promise<StartResult> {
  return db.transaction('rw', db.workouts, async () => {
    const running = await db.workouts.where('status').equals('in_progress').first();
    if (running) return { workoutId: running.id, created: false };

    const workout = buildNewWorkout(deps);
    await db.workouts.add(workout);
    return { workoutId: workout.id, created: true };
  });
}

/** 当日の日付・進行中・空のワークアウトを作る（保存はしない）。メニューからの開始でも使う。 */
export function buildNewWorkout(deps: ServiceDeps): Workout {
  const now = deps.now();
  return {
    id: deps.newId(),
    date: deps.today(),
    status: 'in_progress',
    memo: '',
    createdAt: now,
    completedAt: null,
    updatedAt: now,
  };
}

/**
 * ワークアウトを終了する（REQ-1.20, 1.21）。
 * セットが 1 つもないときは終了せず、破棄の確認が必要だと返す。
 */
export async function finishWorkout(
  db: WorkoutDatabase,
  id: ID,
  deps: ServiceDeps = defaultDeps,
): Promise<FinishResult> {
  return db.transaction('rw', db.workouts, db.sets, async () => {
    const workout = await db.workouts.get(id);
    if (!workout) return { status: 'not_found' } as const;
    if (workout.status === 'completed') return { status: 'finished' } as const;

    if ((await db.sets.where('workoutId').equals(id).count()) === 0) {
      return { status: 'needs_discard_confirm' } as const;
    }
    const now = deps.now();
    await db.workouts.put({ ...workout, status: 'completed', completedAt: now, updatedAt: now });
    return { status: 'finished' } as const;
  });
}

/** ワークアウトと、含まれる全種目記録・全セットを削除する（REQ-1.22, 3.5）。 */
export async function deleteWorkout(db: WorkoutDatabase, id: ID): Promise<'deleted' | 'not_found'> {
  return db.transaction('rw', db.workouts, db.workoutExercises, db.sets, async () => {
    if (!(await db.workouts.get(id))) return 'not_found';
    await db.sets.where('workoutId').equals(id).delete();
    await db.workoutExercises.where('workoutId').equals(id).delete();
    await db.workouts.delete(id);
    return 'deleted';
  });
}

/** メモを保存する。500 文字を超える分は切り詰める（REQ-1.14, 1.15）。保存した値を返す。 */
export async function updateMemo(
  db: WorkoutDatabase,
  id: ID,
  memo: string,
  deps: ServiceDeps = defaultDeps,
): Promise<ValidationResult<string>> {
  return db.transaction('rw', db.workouts, async () => {
    const workout = await db.workouts.get(id);
    if (!workout) return notFound<string>(WORKOUT_LABEL);
    const saved = truncateMemo(memo);
    await db.workouts.put({ ...workout, memo: saved, updatedAt: deps.now() });
    return success(saved);
  });
}

/** ワークアウトの日付を、当日以前の日付に変更する（REQ-1.16, 1.17）。 */
export async function updateDate(
  db: WorkoutDatabase,
  id: ID,
  date: ISODate,
  deps: ServiceDeps = defaultDeps,
): Promise<ValidationResult<ISODate>> {
  return db.transaction('rw', db.workouts, async () => {
    const workout = await db.workouts.get(id);
    if (!workout) return notFound<ISODate>(WORKOUT_LABEL);

    const checked = validateWorkoutDate(date, deps.today());
    if (!checked.ok) return failure<ISODate>(checked.errors);

    await db.workouts.put({ ...workout, date: checked.value, updatedAt: deps.now() });
    return success(checked.value);
  });
}

// ---- 種目・セットの操作 ------------------------------------------------------

export interface SetInput {
  weightKg: number | null | undefined;
  reps: number | null | undefined;
}

/** 変更のあったワークアウトの更新日時を更新する。 */
async function touchWorkout(db: WorkoutDatabase, workoutId: ID, now: string): Promise<void> {
  const workout = await db.workouts.get(workoutId);
  if (workout) await db.workouts.put({ ...workout, updatedAt: now });
}

const nextOrder = (orders: readonly number[], first: number): number =>
  orders.length === 0 ? first : Math.max(...orders) + 1;

/**
 * ワークアウトの末尾に種目を追加する（REQ-1.4）。
 * アーカイブ済みの種目は追加できない（REQ-2.9）。完了済みのワークアウトにも追加できる（REQ-1.25）。
 */
export async function addExercise(
  db: WorkoutDatabase,
  workoutId: ID,
  exerciseId: ID,
  deps: ServiceDeps = defaultDeps,
): Promise<ValidationResult<WorkoutExercise>> {
  return db.transaction('rw', db.workouts, db.exercises, db.workoutExercises, async () => {
    if (!(await db.workouts.get(workoutId))) return notFound<WorkoutExercise>(WORKOUT_LABEL);
    const exercise = await db.exercises.get(exerciseId);
    if (!exercise) return failure<WorkoutExercise>({ exerciseId: '種目が見つかりません。' });
    if (exercise.archived) {
      return failure<WorkoutExercise>({ exerciseId: 'アーカイブ済みの種目は追加できません。' });
    }

    const existing = await db.workoutExercises.where('workoutId').equals(workoutId).toArray();
    const workoutExercise: WorkoutExercise = {
      id: deps.newId(),
      workoutId,
      exerciseId,
      order: nextOrder(existing.map((we) => we.order), 0),
      targetSets: null,
    };
    await db.workoutExercises.add(workoutExercise);
    await touchWorkout(db, workoutId, deps.now());
    return success(workoutExercise);
  });
}

/** ワークアウトから種目と、その種目の全セットを削除する（REQ-1.13）。 */
export async function removeExercise(
  db: WorkoutDatabase,
  workoutExerciseId: ID,
  deps: ServiceDeps = defaultDeps,
): Promise<'removed' | 'not_found'> {
  return db.transaction('rw', db.workouts, db.workoutExercises, db.sets, async () => {
    const workoutExercise = await db.workoutExercises.get(workoutExerciseId);
    if (!workoutExercise) return 'not_found';
    await db.sets.where('workoutExerciseId').equals(workoutExerciseId).delete();
    await db.workoutExercises.delete(workoutExerciseId);
    await touchWorkout(db, workoutExercise.workoutId, deps.now());
    return 'removed';
  });
}

/** 種目の末尾にセットを追加する（REQ-1.8, 1.9）。検証に失敗したら何も書き込まない。 */
export async function addSet(
  db: WorkoutDatabase,
  workoutExerciseId: ID,
  input: SetInput,
  deps: ServiceDeps = defaultDeps,
): Promise<ValidationResult<WorkoutSet>> {
  return db.transaction('rw', db.workouts, db.workoutExercises, db.sets, async () => {
    const workoutExercise = await db.workoutExercises.get(workoutExerciseId);
    if (!workoutExercise) return notFound<WorkoutSet>('種目');

    const checked = validateSet(input.weightKg, input.reps);
    if (!checked.ok) return failure<WorkoutSet>(checked.errors);

    const existing = await db.sets.where('workoutExerciseId').equals(workoutExerciseId).toArray();
    const now = deps.now();
    const set: WorkoutSet = {
      id: deps.newId(),
      workoutExerciseId,
      workoutId: workoutExercise.workoutId,
      exerciseId: workoutExercise.exerciseId,
      order: nextOrder(existing.map((s) => s.order), 1),
      weightTenthKg: checked.value.weightTenthKg,
      reps: checked.value.reps,
      createdAt: now,
    };
    await db.sets.add(set);
    await touchWorkout(db, set.workoutId, now);
    return success(set);
  });
}

/** セットの重量と回数を更新する（REQ-1.10, 1.11）。検証に失敗したら何も書き込まない。 */
export async function updateSet(
  db: WorkoutDatabase,
  setId: ID,
  input: SetInput,
  deps: ServiceDeps = defaultDeps,
): Promise<ValidationResult<WorkoutSet>> {
  return db.transaction('rw', db.workouts, db.sets, async () => {
    const current = await db.sets.get(setId);
    if (!current) return notFound<WorkoutSet>('セット');

    const checked = validateSet(input.weightKg, input.reps);
    if (!checked.ok) return failure<WorkoutSet>(checked.errors);

    const updated: WorkoutSet = {
      ...current,
      weightTenthKg: checked.value.weightTenthKg,
      reps: checked.value.reps,
    };
    await db.sets.put(updated);
    await touchWorkout(db, current.workoutId, deps.now());
    return success(updated);
  });
}

/** セットを削除する（REQ-1.12）。 */
export async function deleteSet(
  db: WorkoutDatabase,
  setId: ID,
  deps: ServiceDeps = defaultDeps,
): Promise<'deleted' | 'not_found'> {
  return db.transaction('rw', db.workouts, db.sets, async () => {
    const current = await db.sets.get(setId);
    if (!current) return 'not_found';
    await db.sets.delete(setId);
    await touchWorkout(db, current.workoutId, deps.now());
    return 'deleted';
  });
}
