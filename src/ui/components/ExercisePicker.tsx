import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { BODY_PART_LABELS, BODY_PARTS, type BodyPart, type Exercise } from '../../domain/types';
import './ExercisePicker.css';

const ALL = 'all';

interface ExercisePickerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** 選べる種目。アーカイブ済みの種目は呼び出し側で除いて渡さなくても、ここで除く（REQ-2.9）。 */
  exercises: readonly Exercise[];
  onSelect: (exercise: Exercise) => void;
}

/** 種目を選ぶシート。部位ごとに分類して表示し、部位で絞り込める（REQ-1.2, 1.3）。 */
export function ExercisePicker({ isOpen, onOpenChange, exercises, onSelect }: ExercisePickerProps) {
  const [filter, setFilter] = useState<string>(ALL);
  const selectable = exercises.filter((exercise) => !exercise.archived);
  const parts: readonly BodyPart[] = filter === ALL ? BODY_PARTS : [filter as BodyPart];

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange} label="種目を選ぶ" height="tall">
      <SegmentedControl label="部位で絞り込む" value={filter} onChange={setFilter} layout="fill">
        <SegmentedControlItem value={ALL} label="すべて" />
        {BODY_PARTS.map((part) => (
          <SegmentedControlItem key={part} value={part} label={BODY_PART_LABELS[part]} />
        ))}
      </SegmentedControl>

      {parts.map((part) => {
        const items = selectable
          .filter((exercise) => exercise.bodyPart === part)
          .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        if (items.length === 0) return null;
        return (
          <section key={part} aria-label={`${BODY_PART_LABELS[part]}の種目`}>
            <Heading level={3}>{BODY_PART_LABELS[part]}</Heading>
            <ul className="exercise-picker-list">
              {items.map((exercise) => (
                <li key={exercise.id}>
                  <Button
                    label={exercise.name}
                    variant="ghost"
                    onClick={() => {
                      onSelect(exercise);
                      onOpenChange(false);
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {selectable.every((exercise) => !parts.includes(exercise.bodyPart)) && (
        <Text type="supporting">この部位の種目はありません。</Text>
      )}
    </BottomSheet>
  );
}
