import Dexie, { type EntityTable } from 'dexie';
import type { Exercise, Template, Workout, WorkoutExercise, WorkoutSet } from '../domain/types';
import { newId, nowIso } from './ids';
import { createInitialExercises } from './seed';

export const DB_NAME = 'workout-tracker';

/**
 * IndexedDB のスキーマ（設計書 3.3 節）。
 * - `&nameKey` は一意インデックス。種目名の重複を DB でも防ぐ（REQ-2.4）。
 * - `archived` は boolean のためインデックスにせず、取得後に絞り込む。
 */
export class WorkoutDatabase extends Dexie {
  // `declare` にして、クラスフィールドの初期化が Dexie が作るテーブルを上書きしないようにする。
  declare exercises: EntityTable<Exercise, 'id'>;
  declare workouts: EntityTable<Workout, 'id'>;
  declare workoutExercises: EntityTable<WorkoutExercise, 'id'>;
  declare sets: EntityTable<WorkoutSet, 'id'>;
  declare templates: EntityTable<Template, 'id'>;

  constructor(name: string = DB_NAME) {
    super(name);

    this.version(1).stores({
      exercises: 'id, &nameKey, bodyPart',
      workouts: 'id, date, status, createdAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutExerciseId, workoutId, exerciseId',
      templates: 'id',
    });

    // DB の新規作成時に 1 回だけ実行される（REQ-2.1）。開き直しても再実行されない。
    this.on('populate', (tx) => {
      return tx.table('exercises').bulkAdd(createInitialExercises(newId, nowIso()));
    });
  }
}

export function createDatabase(name?: string): WorkoutDatabase {
  return new WorkoutDatabase(name);
}
