import type { WorkoutDatabase } from '../db/database';
import type { BodyPart, Exercise, ID } from '../domain/types';
import {
  validateBodyPart,
  validateExerciseName,
  type ValidationResult,
} from '../domain/validation';
import { defaultDeps, type ServiceDeps } from './deps';
import { failure, notFound, success } from './result';

export interface ExerciseInput {
  name: string;
  bodyPart: BodyPart;
}

export type DeleteOutcome = 'deleted' | 'archived' | 'not_found';

const DUPLICATE_MESSAGE = '同じ名前の種目が既にあります（重複しています）。';

/** 一意インデックス違反（ConstraintError）か。 */
function isConstraintError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConstraintError';
}

/** 名前と部位を検証する。existing は重複判定の対象（編集時は selfId を除く）。 */
function validateInput(
  input: ExerciseInput,
  existing: ReadonlyArray<{ id: ID; nameKey: string }>,
  selfId?: ID,
) {
  const name = validateExerciseName(input.name, existing, selfId);
  const bodyPart = validateBodyPart(input.bodyPart);
  if (name.ok && bodyPart.ok) return { ok: true as const, name: name.value, bodyPart: bodyPart.value };
  return {
    ok: false as const,
    errors: { ...(name.ok ? {} : name.errors), ...(bodyPart.ok ? {} : bodyPart.errors) },
  };
}

/** 種目を登録する（REQ-2.2〜2.4）。検証に失敗したら何も書き込まない。 */
export async function createExercise(
  db: WorkoutDatabase,
  input: ExerciseInput,
  deps: ServiceDeps = defaultDeps,
): Promise<ValidationResult<Exercise>> {
  try {
    return await db.transaction('rw', db.exercises, async () => {
      const existing = await db.exercises.toArray();
      const checked = validateInput(input, existing);
      if (!checked.ok) return failure<Exercise>(checked.errors);

      const now = deps.now();
      const exercise: Exercise = {
        id: deps.newId(),
        name: checked.name.name,
        nameKey: checked.name.nameKey,
        bodyPart: checked.bodyPart,
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      await db.exercises.add(exercise);
      return success(exercise);
    });
  } catch (error) {
    if (isConstraintError(error)) return failure({ name: DUPLICATE_MESSAGE });
    throw error;
  }
}

/** 種目の名前・部位を更新する（REQ-2.5, 2.6）。アーカイブ済みでも編集できる。 */
export async function updateExercise(
  db: WorkoutDatabase,
  id: ID,
  input: ExerciseInput,
  deps: ServiceDeps = defaultDeps,
): Promise<ValidationResult<Exercise>> {
  try {
    return await db.transaction('rw', db.exercises, async () => {
      const current = await db.exercises.get(id);
      if (!current) return notFound<Exercise>('種目');

      const existing = await db.exercises.toArray();
      const checked = validateInput(input, existing, id);
      if (!checked.ok) return failure<Exercise>(checked.errors);

      const updated: Exercise = {
        ...current,
        name: checked.name.name,
        nameKey: checked.name.nameKey,
        bodyPart: checked.bodyPart,
        updatedAt: deps.now(),
      };
      await db.exercises.put(updated);
      return success(updated);
    });
  } catch (error) {
    if (isConstraintError(error)) return failure({ name: DUPLICATE_MESSAGE });
    throw error;
  }
}

/**
 * 種目を削除する（REQ-2.7, 2.8）。
 * ワークアウトまたはメニューで使われていれば、過去の記録を保つため削除せずアーカイブする。
 */
export async function deleteExercise(
  db: WorkoutDatabase,
  id: ID,
  deps: ServiceDeps = defaultDeps,
): Promise<DeleteOutcome> {
  return db.transaction('rw', db.exercises, db.workoutExercises, db.templates, async () => {
    const exercise = await db.exercises.get(id);
    if (!exercise) return 'not_found';

    const usedInWorkout = (await db.workoutExercises.where('exerciseId').equals(id).count()) > 0;
    const usedInTemplate =
      !usedInWorkout &&
      (await db.templates.toArray()).some((t) => t.items.some((item) => item.exerciseId === id));

    if (!usedInWorkout && !usedInTemplate) {
      await db.exercises.delete(id);
      return 'deleted';
    }
    if (!exercise.archived) {
      await db.exercises.put({ ...exercise, archived: true, updatedAt: deps.now() });
    }
    return 'archived';
  });
}

/** アーカイブ済みの種目を有効な種目に戻す（REQ-2.11）。 */
export async function restoreExercise(
  db: WorkoutDatabase,
  id: ID,
  deps: ServiceDeps = defaultDeps,
): Promise<ValidationResult<Exercise>> {
  return db.transaction('rw', db.exercises, async () => {
    const exercise = await db.exercises.get(id);
    if (!exercise) return notFound<Exercise>('種目');
    if (!exercise.archived) return success(exercise);

    const restored: Exercise = { ...exercise, archived: false, updatedAt: deps.now() };
    await db.exercises.put(restored);
    return success(restored);
  });
}
