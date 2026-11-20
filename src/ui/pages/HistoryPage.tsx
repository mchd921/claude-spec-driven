import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useDatabase } from '../../app/DatabaseContext';
import { buildHistoryItems } from '../../domain/history';
import { HistoryCalendar } from '../components/HistoryCalendar';
import { HistoryList } from '../components/HistoryList';

/** 1 回に読み込む件数（NFR-1 の性能のため、一覧は段階的に表示する）。 */
export const HISTORY_PAGE_SIZE = 30;

export function HistoryPage() {
  const db = useDatabase();
  const [limit, setLimit] = useState(HISTORY_PAGE_SIZE);
  const [view, setView] = useState('list');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const [workouts, workoutExercises, sets, exercises] = await Promise.all([
      db.workouts.toArray(),
      db.workoutExercises.toArray(),
      db.sets.toArray(),
      db.exercises.toArray(),
    ]);
    return { workouts, workoutExercises, sets, exercises };
  }, [db]);

  const items = useMemo(
    () => (data ? buildHistoryItems(data.workouts, data.workoutExercises, data.sets, data.exercises) : null),
    [data],
  );

  return (
    <>
      <Heading level={1}>履歴</Heading>
      {items && items.length === 0 && (
        <EmptyState title="記録がありません" description="ホームからワークアウトを始めると、ここに表示されます。" />
      )}
      {items && items.length > 0 && (
        <SegmentedControl label="表示の切り替え" value={view} onChange={setView}>
          <SegmentedControlItem value="list" label="一覧" />
          <SegmentedControlItem value="calendar" label="カレンダー" />
        </SegmentedControl>
      )}
      {items && items.length > 0 && view === 'calendar' && (
        <>
          <HistoryCalendar
            initialDate={items[0]!.workout.date}
            workoutDates={new Set(items.map((item) => item.workout.date))}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
          />
          {selectedDate && (
            <section aria-label={`${selectedDate}のワークアウト`}>
              <Heading level={2}>{selectedDate}</Heading>
              {items.filter((item) => item.workout.date === selectedDate).length === 0 ? (
                <Text type="supporting">この日のワークアウトはありません。</Text>
              ) : (
                <HistoryList items={items.filter((item) => item.workout.date === selectedDate)} />
              )}
            </section>
          )}
        </>
      )}
      {items && items.length > 0 && view === 'list' && (
        <>
          <HistoryList items={items.slice(0, limit)} />
          {items.length > limit && (
            <div className="history-more">
              <Button
                label={`さらに表示（残り ${items.length - limit} 件）`}
                onClick={() => setLimit(limit + HISTORY_PAGE_SIZE)}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
