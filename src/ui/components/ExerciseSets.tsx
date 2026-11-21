import { Badge } from '@astryxdesign/core/Badge';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import type { PreviousRecord, SetDefaults } from '../../domain/setDefaults';
import type { PRFlags } from '../../domain/pr';
import type { WorkoutExercise, WorkoutSet } from '../../domain/types';
import { formatKg } from '../format';
import { SetInputRow, type SetFormValues } from './SetInputRow';
import './ExerciseSets.css';

interface ExerciseSetsProps {
  entry: WorkoutExercise;
  sets: readonly WorkoutSet[];
  previous: PreviousRecord | null;
  defaults: SetDefaults | null;
  prs: ReadonlyMap<string, PRFlags>;
  onAdd: (values: SetFormValues) => Promise<Record<string, string> | null>;
  onUpdate: (setId: string, values: SetFormValues) => Promise<Record<string, string> | null>;
  onDelete: (setId: string) => void;
}

/** 1 種目分の、前回の記録・セット一覧・セット入力欄・目標セット数。 */
export function ExerciseSets({ entry, sets, previous, defaults, prs, onAdd, onUpdate, onDelete }: ExerciseSetsProps) {
  const [editing, setEditing] = useState<WorkoutSet | null>(null);

  return (
    <>
      {previous && (
        <Text type="supporting">
          前回（{previous.date}）: {previous.sets.map((s) => `${formatKg(s.weightTenthKg)}×${s.reps}`).join('、')}
        </Text>
      )}

      <ol className="set-list">
        {sets.map((set, index) => {
          const pr = prs.get(set.id);
          return (
            <li key={set.id} className="set-row">
              <span className="set-number">{index + 1}</span>
              <Text>{formatKg(set.weightTenthKg)} × {set.reps}回</Text>
              {pr?.weight && <Badge variant="success" label="重量PR" />}
              {pr?.e1rm && <Badge variant="success" label="1RM PR" />}
              <span className="set-actions">
                <Button label="編集" aria-label={`セット${index + 1}を編集`} variant="ghost" onClick={() => setEditing(set)} />
                <Button label="削除" aria-label={`セット${index + 1}を削除`} variant="ghost" onClick={() => onDelete(set.id)} />
              </span>
            </li>
          );
        })}
      </ol>

      {entry.targetSets !== null && (
        <Text type="supporting">{sets.length} / {entry.targetSets} セット</Text>
      )}

      <SetInputRow key={entry.id} defaults={defaults} submitLabel="+ セット" onSubmit={onAdd} />

      <BottomSheet
        isOpen={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        label="セットを編集"
        purpose="form"
        height="hug"
      >
        {editing && (
          <SetInputRow
            key={editing.id}
            defaults={{ weightTenthKg: editing.weightTenthKg, reps: editing.reps }}
            submitLabel="保存"
            onSubmit={async (values) => {
              const errors = await onUpdate(editing.id, values);
              if (errors === null) setEditing(null);
              return errors;
            }}
          />
        )}
      </BottomSheet>
    </>
  );
}
