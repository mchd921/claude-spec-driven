import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useDatabase } from '../../app/DatabaseContext';
import { useReportSaveError } from '../../app/useReportSaveError';
import type { Exercise, WorkoutExercise } from '../../domain/types';
import { computePRs } from '../../domain/pr';
import { findPreviousRecord, getSetDefaults } from '../../domain/setDefaults';
import { compareSetsInWorkout } from '../../domain/chronology';
import { addExercise, addSet, deleteSet, removeExercise, updateSet } from '../../services/workoutService';
import { ExerciseSets } from '../components/ExerciseSets';
import { ExercisePicker } from '../components/ExercisePicker';
import './WorkoutPage.css';

const UNKNOWN_EXERCISE = '（不明な種目）';

export function WorkoutPage() {
  const { id = '' } = useParams();
  const db = useDatabase();
  const reportSaveError = useReportSaveError();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removing, setRemoving] = useState<{ entry: WorkoutExercise; name: string } | null>(null);

  const data = useLiveQuery(async () => {
    const workout = await db.workouts.get(id);
    if (!workout) return { workout: null } as const;
    const entries = await db.workoutExercises.where('workoutId').equals(id).sortBy('order');
    // 前回の記録と自己ベストの判定には、全ワークアウト・全セットが必要
    const [allWorkouts, allSets] = await Promise.all([db.workouts.toArray(), db.sets.toArray()]);
    return { workout, entries, allWorkouts, allSets } as const;
  }, [db, id]);
  const exercises = useLiveQuery(() => db.exercises.toArray(), [db]);

  if (!data || !exercises) return <Heading level={1}>ワークアウト記録</Heading>;
  if (!data.workout) {
    return (
      <>
        <Heading level={1}>ワークアウト記録</Heading>
        <EmptyState title="ワークアウトが見つかりません" description="削除されたか、URL が正しくありません。" />
      </>
    );
  }

  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const nameOf = (exerciseId: string) => byId.get(exerciseId)?.name ?? UNKNOWN_EXERCISE;

  const add = async (exercise: Exercise) => {
    try {
      const result = await addExercise(db, id, exercise.id);
      if (!result.ok) reportSaveError(new Error(Object.values(result.errors).join(' ')));
    } catch (error) {
      reportSaveError(error);
    }
  };

  /** セットの保存。入力エラーは入力欄に返し、予期しない例外は Toast で通知する。 */
  const saveSet = async (
    work: () => Promise<{ ok: true } | { ok: false; errors: Record<string, string> }>,
  ): Promise<Record<string, string> | null> => {
    try {
      const result = await work();
      return result.ok ? null : result.errors;
    } catch (error) {
      reportSaveError(error);
      return {};
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { entry } = removing;
    setRemoving(null);
    try {
      await removeExercise(db, entry.id);
    } catch (error) {
      reportSaveError(error);
    }
  };

  const { workout, entries, allWorkouts, allSets } = data;
  const prs = computePRs(allSets, allWorkouts);
  const setsOf = (entryId: string) =>
    allSets.filter((set) => set.workoutExerciseId === entryId).sort(compareSetsInWorkout);

  return (
    <>
      <Heading level={1}>ワークアウト記録</Heading>
      <div className="workout-meta">
        <Text>{workout.date}</Text>
        <Badge variant={workout.status === 'in_progress' ? 'info' : 'neutral'} label={workout.status === 'in_progress' ? '進行中' : '完了'} />
      </div>

      {entries.length === 0 && (
        <EmptyState title="種目がありません" description="「種目を追加」から、行う種目を選んでください。" />
      )}

      {entries.map((entry) => (
        <section key={entry.id} className="workout-exercise" aria-label={nameOf(entry.exerciseId)}>
          <div className="workout-exercise-header">
            <Heading level={2}>{nameOf(entry.exerciseId)}</Heading>
            <Button
              label="削除"
              aria-label={`${nameOf(entry.exerciseId)}をワークアウトから外す`}
              variant="ghost"
              onClick={() => {
                const name = nameOf(entry.exerciseId);
                if (setsOf(entry.id).length === 0) void removeExercise(db, entry.id).catch(reportSaveError);
                else setRemoving({ entry, name });
              }}
            />
          </div>
          <ExerciseSets
            entry={entry}
            sets={setsOf(entry.id)}
            previous={findPreviousRecord(entry.exerciseId, workout, allSets, allWorkouts)}
            defaults={getSetDefaults(entry.exerciseId, workout, allSets, allWorkouts)}
            prs={prs}
            onAdd={(values) => saveSet(() => addSet(db, entry.id, values))}
            onUpdate={(setId, values) => saveSet(() => updateSet(db, setId, values))}
            onDelete={(setId) => void deleteSet(db, setId).catch(reportSaveError)}
          />
        </section>
      ))}

      <div className="workout-add">
        <Button label="種目を追加" variant="primary" onClick={() => setPickerOpen(true)} />
      </div>

      <ExercisePicker
        isOpen={pickerOpen}
        onOpenChange={setPickerOpen}
        exercises={exercises}
        onSelect={(exercise) => void add(exercise)}
      />

      <AlertDialog
        isOpen={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="種目を外しますか？"
        description={`「${removing?.name ?? ''}」と、記録済みのセットをこのワークアウトから削除します。`}
        actionLabel="外す"
        cancelLabel="キャンセル"
        onAction={() => void remove()}
      />
    </>
  );
}
