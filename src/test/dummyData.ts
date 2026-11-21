import type { BackupData } from '../domain/backupSchema';
import type { Template, Workout, WorkoutExercise, WorkoutSet } from '../domain/types';
import { createInitialExercises } from '../db/seed';

/** 再現できるよう、シード付きの疑似乱数（mulberry32）を使う。 */
function createRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DummyOptions {
  workouts?: number;
  /** セットの総数。ワークアウトに均等に配る。 */
  sets?: number;
  /** 最新のワークアウトの日付 */
  endDate?: string;
  seed?: number;
}

/**
 * 性能確認用のダミーデータ（NFR-5, T4.2）。既定は 500 ワークアウト / 15,000 セット。
 * 約 2 年分、2 日に 1 回のペースで、1 ワークアウトに 5 種目 × 6 セットを記録した想定。
 * `restoreBackup` に渡せる形式。実機では、JSON にして設定画面からインポートする。
 */
export function generateDummyData(options: DummyOptions = {}): BackupData {
  const { workouts: workoutCount = 500, sets: setTotal = 15000, endDate = '2026-11-20', seed = 1 } = options;
  const random = createRandom(seed);
  let counter = 0;
  const newId = () => `dummy-${++counter}`;
  const stamp = (offsetMs: number) => new Date(Date.UTC(2024, 0, 1) + offsetMs).toISOString();

  const exercises = createInitialExercises(newId, stamp(0));
  const workouts: Workout[] = [];
  const workoutExercises: WorkoutExercise[] = [];
  const sets: WorkoutSet[] = [];

  const setsPerWorkout = Math.floor(setTotal / workoutCount);
  const extra = setTotal - setsPerWorkout * workoutCount;
  const end = Date.parse(`${endDate}T00:00:00Z`);

  for (let w = 0; w < workoutCount; w++) {
    const date = new Date(end - (workoutCount - 1 - w) * 1.46 * 86400000).toISOString().slice(0, 10);
    const created = stamp((w + 1) * 3600000);
    const workout: Workout = {
      id: newId(),
      date,
      status: 'completed',
      memo: w % 7 === 0 ? 'ダミーのメモ'.repeat(10) : '',
      createdAt: created,
      completedAt: created,
      updatedAt: created,
    };
    workouts.push(workout);

    const total = setsPerWorkout + (w < extra ? 1 : 0);
    const exerciseCount = Math.min(5, total);
    const picked = new Set<number>();
    while (picked.size < exerciseCount) picked.add(Math.floor(random() * exercises.length));
    const order = [...picked];

    for (let e = 0; e < exerciseCount; e++) {
      const exercise = exercises[order[e]!]!;
      const entry: WorkoutExercise = {
        id: newId(),
        workoutId: workout.id,
        exerciseId: exercise.id,
        order: e,
        targetSets: null,
      };
      workoutExercises.push(entry);
      const count = Math.floor(total / exerciseCount) + (e < total % exerciseCount ? 1 : 0);
      const base = 200 + Math.floor(random() * 1000); // 20〜120kg
      for (let s = 0; s < count; s++) {
        sets.push({
          id: newId(),
          workoutExerciseId: entry.id,
          workoutId: workout.id,
          exerciseId: exercise.id,
          order: s,
          weightTenthKg: base + Math.floor(w / 10) * 5,
          reps: 5 + Math.floor(random() * 8),
          createdAt: created,
        });
      }
    }
  }

  const templates: Template[] = [0, 1, 2].map((i) => ({
    id: newId(),
    name: `ダミーメニュー ${i + 1}`,
    items: exercises.slice(i * 4, i * 4 + 4).map((e) => ({ exerciseId: e.id, targetSets: 3 })),
    createdAt: stamp(0),
    updatedAt: stamp(0),
  }));

  return { exercises, workouts, workoutExercises, sets, templates };
}
