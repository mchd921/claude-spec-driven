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
import { addExercise, removeExercise } from '../../services/workoutService';
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
    const setCounts = new Map<string, number>();
    for (const set of await db.sets.where('workoutId').equals(id).toArray()) {
      setCounts.set(set.workoutExerciseId, (setCounts.get(set.workoutExerciseId) ?? 0) + 1);
    }
    return { workout, entries, setCounts } as const;
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

  const { workout, entries, setCounts } = data;

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
                if ((setCounts.get(entry.id) ?? 0) === 0) void removeExercise(db, entry.id).catch(reportSaveError);
                else setRemoving({ entry, name });
              }}
            />
          </div>
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
