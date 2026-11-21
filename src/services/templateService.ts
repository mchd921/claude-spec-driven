import type { WorkoutDatabase } from '../db/database';
import type { ID, Template, TemplateItem, WorkoutExercise } from '../domain/types';
import { TARGET_SETS_MAX, validateTemplate, type ValidationResult } from '../domain/validation';
import { defaultDeps, type ServiceDeps } from './deps';
import { failure, notFound, success } from './result';
import { buildNewWorkout, type StartResult } from './workoutService';

const TEMPLATE_LABEL = 'メニュー';
const UNKNOWN_EXERCISE = '（不明な種目）';

export interface TemplateInput {
  name: string;
  items: readonly TemplateItem[];
}

export interface TemplateDraft {
  /** 名前は利用者が付ける。下書きでは空にする。 */
  name: string;
  items: TemplateItem[];
  /** アーカイブ済みのため、下書きに含めなかった種目名 */
  excludedExerciseNames: string[];
}

export interface StartFromTemplateResult extends StartResult {
  /** アーカイブ済みのため、ワークアウトに追加しなかった種目名（REQ-4.9） */
  skippedExerciseNames: string[];
}

/**
 * メニューの各項目の種目が存在し、選択できる状態かを確認する。
 * アーカイブ済みの種目は、すでにそのメニューに含まれている場合（keepArchived）だけ許可する。
 */
async function checkExercises(
  db: WorkoutDatabase,
  items: readonly TemplateItem[],
  keepArchived: ReadonlySet<ID> = new Set(),
): Promise<Record<string, string>> {
  const found = await db.exercises.bulkGet(items.map((item) => item.exerciseId));
  const errors: Record<string, string> = {};
  found.forEach((exercise, index) => {
    if (!exercise) {
      errors[`items.${index}.exerciseId`] = '種目が見つかりません。';
    } else if (exercise.archived && !keepArchived.has(exercise.id)) {
      errors[`items.${index}.exerciseId`] = 'アーカイブ済みの種目は追加できません。';
    }
  });
  return errors;
}

async function validate(
  db: WorkoutDatabase,
  input: TemplateInput,
  keepArchived?: ReadonlySet<ID>,
): Promise<ValidationResult<{ name: string; items: TemplateItem[] }>> {
  const checked = validateTemplate(input.name, input.items);
  const exerciseErrors = await checkExercises(db, input.items, keepArchived);
  const errors = { ...(checked.ok ? {} : checked.errors), ...exerciseErrors };
  if (Object.keys(errors).length > 0 || !checked.ok) return failure(errors);
  return success(checked.value);
}

/** メニューを登録する（REQ-4.1〜4.4）。検証に失敗したら何も書き込まない。 */
export async function createTemplate(
  db: WorkoutDatabase,
  input: TemplateInput,
  deps: ServiceDeps = defaultDeps,
): Promise<ValidationResult<Template>> {
  return db.transaction('rw', db.templates, db.exercises, async () => {
    const checked = await validate(db, input);
    if (!checked.ok) return failure<Template>(checked.errors);

    const now = deps.now();
    const template: Template = {
      id: deps.newId(),
      name: checked.value.name,
      items: checked.value.items,
      createdAt: now,
      updatedAt: now,
    };
    await db.templates.add(template);
    return success(template);
  });
}

/**
 * メニューの名前・種目・目標セット数・種目の順序を更新する（REQ-4.5, 4.6）。
 * すでにメニューに含まれているアーカイブ済みの種目は、そのまま残せる。
 */
export async function updateTemplate(
  db: WorkoutDatabase,
  id: ID,
  input: TemplateInput,
  deps: ServiceDeps = defaultDeps,
): Promise<ValidationResult<Template>> {
  return db.transaction('rw', db.templates, db.exercises, async () => {
    const current = await db.templates.get(id);
    if (!current) return notFound<Template>(TEMPLATE_LABEL);

    const keep = new Set(current.items.map((item) => item.exerciseId));
    const checked = await validate(db, input, keep);
    if (!checked.ok) return failure<Template>(checked.errors);

    const updated: Template = {
      ...current,
      name: checked.value.name,
      items: checked.value.items,
      updatedAt: deps.now(),
    };
    await db.templates.put(updated);
    return success(updated);
  });
}

/** メニューを削除する（REQ-4.7）。 */
export async function deleteTemplate(db: WorkoutDatabase, id: ID): Promise<'deleted' | 'not_found'> {
  return db.transaction('rw', db.templates, async () => {
    if (!(await db.templates.get(id))) return 'not_found';
    await db.templates.delete(id);
    return 'deleted';
  });
}

/**
 * メニューを選んでワークアウトを開始する（REQ-4.8, 4.9, 1.24）。
 * 進行中のワークアウトがあるときは、新しく作らず種目も追加せず、その ID を返す。
 * アーカイブ済みの種目は追加せず、その名前を返す。
 */
export async function startWorkoutFromTemplate(
  db: WorkoutDatabase,
  templateId: ID,
  deps: ServiceDeps = defaultDeps,
): Promise<ValidationResult<StartFromTemplateResult>> {
  return db.transaction('rw', db.workouts, db.workoutExercises, db.templates, db.exercises, async () => {
    const template = await db.templates.get(templateId);
    if (!template) return notFound<StartFromTemplateResult>(TEMPLATE_LABEL);

    const running = await db.workouts.where('status').equals('in_progress').first();
    if (running) {
      return success({ workoutId: running.id, created: false, skippedExerciseNames: [] });
    }

    const workout = buildNewWorkout(deps);
    await db.workouts.add(workout);

    const exercises = await db.exercises.bulkGet(template.items.map((item) => item.exerciseId));
    const skipped: string[] = [];
    const added: WorkoutExercise[] = [];
    template.items.forEach((item, index) => {
      const exercise = exercises[index];
      if (!exercise || exercise.archived) {
        skipped.push(exercise?.name ?? UNKNOWN_EXERCISE);
        return;
      }
      added.push({
        id: deps.newId(),
        workoutId: workout.id,
        exerciseId: exercise.id,
        order: added.length,
        targetSets: item.targetSets,
      });
    });
    await db.workoutExercises.bulkAdd(added);

    return success({ workoutId: workout.id, created: true, skippedExerciseNames: skipped });
  });
}

/**
 * 記録済みのワークアウトから、メニューの下書きを作る（REQ-4.11）。保存はしない。
 * 種目の順序と、各種目のセット数（最大 20）を目標セット数にする。
 */
export async function draftFromWorkout(
  db: WorkoutDatabase,
  workoutId: ID,
): Promise<ValidationResult<TemplateDraft>> {
  return db.transaction('r', db.workouts, db.workoutExercises, db.sets, db.exercises, async () => {
    if (!(await db.workouts.get(workoutId))) return notFound<TemplateDraft>('ワークアウト');

    const entries = (await db.workoutExercises.where('workoutId').equals(workoutId).sortBy('order'));
    const setCounts = new Map<ID, number>();
    for (const set of await db.sets.where('workoutId').equals(workoutId).toArray()) {
      setCounts.set(set.workoutExerciseId, (setCounts.get(set.workoutExerciseId) ?? 0) + 1);
    }
    const exercises = await db.exercises.bulkGet(entries.map((we) => we.exerciseId));

    const items: TemplateItem[] = [];
    const excluded: string[] = [];
    entries.forEach((we, index) => {
      const exercise = exercises[index];
      if (!exercise || exercise.archived) {
        excluded.push(exercise?.name ?? UNKNOWN_EXERCISE);
        return;
      }
      const count = setCounts.get(we.id) ?? 0;
      items.push({
        exerciseId: we.exerciseId,
        targetSets: count === 0 ? null : Math.min(count, TARGET_SETS_MAX),
      });
    });
    return success({ name: '', items, excludedExerciseNames: excluded });
  });
}
