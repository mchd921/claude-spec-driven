import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useToast } from '@astryxdesign/core/Toast';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useDatabase } from '../../app/DatabaseContext';
import { useReportSaveError } from '../../app/useReportSaveError';
import { BODY_PART_LABELS, BODY_PARTS, type BodyPart, type Exercise } from '../../domain/types';
import {
  createExercise,
  deleteExercise,
  restoreExercise,
  updateExercise,
} from '../../services/exerciseService';
import './ExercisesPage.css';

const BODY_PART_OPTIONS = BODY_PARTS.map((value) => ({ value, label: BODY_PART_LABELS[value] }));

type FieldErrors = Record<string, string>;

interface ExerciseFormProps {
  initialName: string;
  initialBodyPart: BodyPart;
  submitLabel: string;
  onSubmit: (input: { name: string; bodyPart: BodyPart }) => Promise<FieldErrors | null>;
  onCancel?: () => void;
}

/** 種目名と部位の入力フォーム。エラーは各入力欄の近くに表示する（REQ-2.3, 2.4, 2.6）。 */
function ExerciseForm({ initialName, initialBodyPart, submitLabel, onSubmit, onCancel }: ExerciseFormProps) {
  const [name, setName] = useState(initialName);
  const [bodyPart, setBodyPart] = useState<BodyPart>(initialBodyPart);
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const result = await onSubmit({ name, bodyPart });
    if (result === null) {
      setErrors({});
      setName('');
    } else {
      setErrors(result);
    }
  };

  const err = (key: string) => (errors[key] ? { type: 'error' as const, message: errors[key] } : undefined);

  return (
    <form className="exercise-form" onSubmit={submit} noValidate>
      <TextInput
        label="種目名"
        value={name}
        onChange={setName}
        status={err('name')}
        onEnter={() => void submit()}
        width="100%"
      />
      <Selector
        label="部位"
        options={BODY_PART_OPTIONS}
        value={bodyPart}
        onChange={(value) => setBodyPart(value as BodyPart)}
        status={err('bodyPart')}
        presentation="adaptive"
        width="100%"
      />
      <div className="exercise-form-actions">
        <Button type="submit" variant="primary" label={submitLabel} />
        {onCancel && <Button label="キャンセル" variant="ghost" onClick={onCancel} />}
      </div>
    </form>
  );
}

export function ExercisesPage() {
  const db = useDatabase();
  const toast = useToast();
  const reportSaveError = useReportSaveError();
  const exercises = useLiveQuery(() => db.exercises.toArray(), [db]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Exercise | null>(null);

  const guard = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await work();
    } catch (error) {
      reportSaveError(error);
      return undefined;
    }
  };

  const add = async (input: { name: string; bodyPart: BodyPart }) => {
    const result = await guard(() => createExercise(db, input));
    if (!result) return {};
    if (!result.ok) return result.errors;
    toast({ body: `「${result.value.name}」を追加しました` });
    return null;
  };

  const edit = (id: string) => async (input: { name: string; bodyPart: BodyPart }) => {
    const result = await guard(() => updateExercise(db, id, input));
    if (!result) return {};
    if (!result.ok) return result.errors;
    setEditingId(null);
    return null;
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    const outcome = await guard(() => deleteExercise(db, target.id));
    if (outcome === 'deleted') toast({ body: `「${target.name}」を削除しました` });
    if (outcome === 'archived') {
      toast({ body: `「${target.name}」は記録で使われているため、アーカイブしました` });
    }
  };

  const restore = async (exercise: Exercise) => {
    const result = await guard(() => restoreExercise(db, exercise.id));
    if (result?.ok) toast({ body: `「${exercise.name}」を復元しました` });
    if (result && !result.ok) {
      toast({ body: Object.values(result.errors)[0] ?? '復元できませんでした', type: 'error' });
    }
  };

  const active = (exercises ?? []).filter((e) => !e.archived);
  const archived = (exercises ?? []).filter((e) => e.archived);
  const sortByName = (a: Exercise, b: Exercise) => a.name.localeCompare(b.name, 'ja');

  return (
    <>
      <Heading level={1}>種目マスタ</Heading>

      <section aria-labelledby="add-exercise">
        <Heading level={2} id="add-exercise">種目を追加</Heading>
        <ExerciseForm initialName="" initialBodyPart="chest" submitLabel="追加" onSubmit={add} />
      </section>

      {exercises && active.length === 0 && (
        <EmptyState headingLevel={2} title="種目がありません" description="上のフォームから種目を追加してください。" />
      )}

      {BODY_PARTS.map((part) => {
        const items = active.filter((e) => e.bodyPart === part).sort(sortByName);
        if (items.length === 0) return null;
        return (
          <section key={part} aria-label={BODY_PART_LABELS[part]}>
            <Heading level={2}>{BODY_PART_LABELS[part]}</Heading>
            <ul className="exercise-list">
              {items.map((exercise) => (
                <li key={exercise.id} className="exercise-row">
                  {editingId === exercise.id ? (
                    <ExerciseForm
                      initialName={exercise.name}
                      initialBodyPart={exercise.bodyPart}
                      submitLabel="保存"
                      onSubmit={edit(exercise.id)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <>
                      <Text>{exercise.name}</Text>
                      <span className="exercise-row-actions">
                        <Button label="編集" aria-label={`${exercise.name}を編集`} variant="ghost" onClick={() => setEditingId(exercise.id)} />
                        <Button label="削除" aria-label={`${exercise.name}を削除`} variant="ghost" onClick={() => setDeleting(exercise)} />
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {archived.length > 0 && (
        <section aria-label="アーカイブ済みの種目">
          <Heading level={2}>アーカイブ済み</Heading>
          <Text type="supporting">過去の記録には表示されます。復元すると、また選べるようになります。</Text>
          <ul className="exercise-list">
            {archived.sort(sortByName).map((exercise) => (
              <li key={exercise.id} className="exercise-row">
                <Text>{exercise.name}（{BODY_PART_LABELS[exercise.bodyPart]}）</Text>
                <Button label="復元" aria-label={`${exercise.name}を復元`} variant="ghost" onClick={() => void restore(exercise)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <AlertDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="種目を削除しますか？"
        description={`「${deleting?.name ?? ''}」を削除します。記録やメニューで使われている場合は、削除せずアーカイブします。`}
        actionLabel="削除する"
        cancelLabel="キャンセル"
        onAction={() => void confirmDelete()}
      />
    </>
  );
}
