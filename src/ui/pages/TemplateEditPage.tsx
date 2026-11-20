import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useDatabase } from '../../app/DatabaseContext';
import { useReportSaveError } from '../../app/useReportSaveError';
import type { Exercise, TemplateItem } from '../../domain/types';
import { createTemplate, updateTemplate, type TemplateDraft } from '../../services/templateService';
import { ExercisePicker } from '../components/ExercisePicker';
import { parseNumberInput } from '../format';
import './TemplateEditPage.css';

/** フォーム上の 1 行。目標セット数は入力途中の文字列のまま持つ。 */
interface Row {
  key: number;
  exerciseId: string;
  targetText: string;
}

type Errors = Record<string, string>;

function toRows(items: readonly TemplateItem[], nextKey: { current: number }): Row[] {
  return items.map((item) => ({
    key: nextKey.current++,
    exerciseId: item.exerciseId,
    targetText: item.targetSets === null ? '' : String(item.targetSets),
  }));
}

interface FormProps {
  title: string;
  initialName: string;
  initialItems: readonly TemplateItem[];
  excludedNames?: readonly string[];
  exercises: readonly Exercise[];
  onSubmit: (input: { name: string; items: TemplateItem[] }) => Promise<Errors | null>;
}

function TemplateForm({ title, initialName, initialItems, excludedNames = [], exercises, onSubmit }: FormProps) {
  const [counter] = useState(() => ({ current: 0 }));
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState<Row[]>(() => toRows(initialItems, counter));
  const [errors, setErrors] = useState<Errors>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? '（不明な種目）';
  const archivedOf = (id: string) => exercises.find((e) => e.id === id)?.archived ?? false;

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = rows.slice();
    [next[index], next[target]] = [next[target]!, next[index]!];
    setRows(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const items: TemplateItem[] = rows.map((row) => ({
      exerciseId: row.exerciseId,
      // 空欄は「目標なし」。数値でない文字列は NaN のまま渡し、検証でエラーにする。
      targetSets: parseNumberInput(row.targetText),
    }));
    setErrors((await onSubmit({ name, items })) ?? {});
  };

  const status = (key: string) => (errors[key] ? { type: 'error' as const, message: errors[key] } : undefined);

  return (
    <>
      <Heading level={1}>{title}</Heading>
      {excludedNames.length > 0 && (
        <Text type="supporting">アーカイブ済みのため含めなかった種目: {excludedNames.join('、')}</Text>
      )}
      <form className="template-form" onSubmit={(e) => void submit(e)} noValidate>
        <TextInput label="メニュー名" value={name} onChange={setName} status={status('name')} width="100%" />

        <ul className="template-items">
          {rows.map((row, index) => {
            const exerciseName = nameOf(row.exerciseId);
            return (
              <li key={row.key} className="template-item">
                <div className="template-item-head">
                  <Text>
                    <span data-testid="item-name">{exerciseName}</span>
                    {archivedOf(row.exerciseId) && '（アーカイブ済み）'}
                  </Text>
                  <span className="template-item-actions">
                    <Button type="button" label="↑" aria-label={`${exerciseName}を上へ`} variant="ghost" isDisabled={index === 0} onClick={() => move(index, -1)} />
                    <Button type="button" label="↓" aria-label={`${exerciseName}を下へ`} variant="ghost" isDisabled={index === rows.length - 1} onClick={() => move(index, 1)} />
                    <Button
                      type="button"
                      label="削除"
                      aria-label={`${exerciseName}を削除`}
                      variant="ghost"
                      onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                    />
                  </span>
                </div>
                <TextInput
                  label={`${exerciseName}の目標セット数`}
                  value={row.targetText}
                  inputMode="numeric"
                  placeholder="未設定"
                  status={status(`items.${index}.targetSets`) ?? status(`items.${index}.exerciseId`)}
                  onChange={(value) => setRows(rows.map((r) => (r.key === row.key ? { ...r, targetText: value } : r)))}
                  width="100%"
                />
              </li>
            );
          })}
        </ul>
        {errors.items && <Text type="supporting" role="alert">{errors.items}</Text>}

        <div className="template-form-actions">
          <Button type="button" label="種目を追加" onClick={() => setPickerOpen(true)} />
          <Button type="submit" variant="primary" label="保存" />
        </div>
      </form>

      <ExercisePicker
        isOpen={pickerOpen}
        onOpenChange={setPickerOpen}
        exercises={exercises}
        onSelect={(exercise) =>
          setRows((current) => [...current, { key: counter.current++, exerciseId: exercise.id, targetText: '' }])
        }
      />
    </>
  );
}

/** メニューの作成（`/templates/new`）と編集（`/templates/:id`）。 */
export function TemplateEditPage() {
  const db = useDatabase();
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const reportSaveError = useReportSaveError();

  const exercises = useLiveQuery(() => db.exercises.toArray(), [db]);
  const template = useLiveQuery(async () => (id ? ((await db.templates.get(id)) ?? null) : undefined), [db, id]);

  if (!exercises || (id && template === undefined)) return null;

  const save = (existingId: string | undefined) => async (input: { name: string; items: TemplateItem[] }) => {
    try {
      const result = existingId
        ? await updateTemplate(db, existingId, input)
        : await createTemplate(db, input);
      if (!result.ok) return result.errors;
      void navigate('/templates');
      return null;
    } catch (error) {
      reportSaveError(error);
      return {};
    }
  };

  if (id) {
    if (!template) {
      return (
        <>
          <Heading level={1}>メニュー編集</Heading>
          <EmptyState title="メニューが見つかりません" description="削除された可能性があります。" />
        </>
      );
    }
    return (
      <TemplateForm
        key={template.id}
        title="メニュー編集"
        initialName={template.name}
        initialItems={template.items}
        exercises={exercises}
        onSubmit={save(template.id)}
      />
    );
  }

  const draft = (location.state as { draft?: TemplateDraft } | null)?.draft;
  return (
    <TemplateForm
      title="メニュー作成"
      initialName={draft?.name ?? ''}
      initialItems={draft?.items ?? []}
      excludedNames={draft?.excludedExerciseNames}
      exercises={exercises}
      onSubmit={save(undefined)}
    />
  );
}
