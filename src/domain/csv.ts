import { compareSetsInWorkout, compareWorkouts } from './chronology';
import {
  BODY_PART_LABELS,
  type Exercise,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from './types';

/** Excel で文字化けしないよう、ファイルの先頭に付ける UTF-8 の BOM。 */
export const CSV_BOM = '\uFEFF';
export const CSV_HEADER = '日付,種目,部位,セット番号,重量,回数';
const LINE_BREAK = '\r\n';

export interface CsvSource {
  exercises: readonly Exercise[];
  workouts: readonly Workout[];
  workoutExercises: readonly WorkoutExercise[];
  sets: readonly WorkoutSet[];
}

/** RFC 4180: カンマ・二重引用符・改行を含む値は二重引用符で囲み、中の二重引用符を重ねる。 */
export function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 表計算ソフトが数式として実行する先頭文字（=, +, -, @, タブ, CR）の前に引用符を付ける。 */
function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/**
 * 全セットを 1 行 1 セットの CSV にする（REQ-5.7）。
 * 並び順: ワークアウトの時系列 → 種目の順序 → セットの順序。セット番号は種目記録ごとに 1 から数える。
 */
export function createSetsCsv(source: CsvSource): string {
  const exerciseById = new Map(source.exercises.map((e) => [e.id, e]));
  const setsByWorkoutExercise = new Map<string, WorkoutSet[]>();
  for (const s of source.sets) {
    const list = setsByWorkoutExercise.get(s.workoutExerciseId);
    if (list) list.push(s);
    else setsByWorkoutExercise.set(s.workoutExerciseId, [s]);
  }
  const workoutExercisesByWorkout = new Map<string, WorkoutExercise[]>();
  for (const we of source.workoutExercises) {
    const list = workoutExercisesByWorkout.get(we.workoutId);
    if (list) list.push(we);
    else workoutExercisesByWorkout.set(we.workoutId, [we]);
  }

  const rows: string[] = [CSV_HEADER];
  for (const workout of [...source.workouts].sort(compareWorkouts)) {
    const entries = [...(workoutExercisesByWorkout.get(workout.id) ?? [])].sort(
      (a, b) => a.order - b.order || a.id.localeCompare(b.id),
    );
    for (const we of entries) {
      const exercise = exerciseById.get(we.exerciseId);
      if (!exercise) continue;
      const sets = [...(setsByWorkoutExercise.get(we.id) ?? [])].sort(compareSetsInWorkout);
      sets.forEach((s, index) => {
        rows.push(
          [
            workout.date,
            escapeCsvField(neutralizeFormula(exercise.name)),
            BODY_PART_LABELS[exercise.bodyPart],
            String(index + 1),
            (s.weightTenthKg / 10).toFixed(1),
            String(s.reps),
          ].join(','),
        );
      });
    }
  }
  return CSV_BOM + rows.join(LINE_BREAK) + LINE_BREAK;
}
