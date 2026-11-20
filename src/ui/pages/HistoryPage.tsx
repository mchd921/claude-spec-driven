import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useDatabase } from '../../app/DatabaseContext';
import { compareWorkouts } from '../../domain/chronology';
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

  // ワークアウト本体は小さいので全件読み、並べ替えとカレンダーの印に使う。
  // セットなどの重い集計は、いま表示する分だけ workoutId のインデックスから読む（NFR-5）。
  const allWorkouts = useLiveQuery(
    async () => (await db.workouts.toArray()).sort((a, b) => compareWorkouts(b, a)),
    [db],
  );
  const visibleIds = useMemo(() => {
    if (!allWorkouts) return [];
    const shown = view === 'calendar' ? allWorkouts.filter((w) => w.date === selectedDate) : allWorkouts.slice(0, limit);
    return shown.map((w) => w.id);
  }, [allWorkouts, view, selectedDate, limit]);
  const visibleKey = visibleIds.join(',');

  const details = useLiveQuery(async () => {
    const [workouts, workoutExercises, sets, exercises] = await Promise.all([
      db.workouts.bulkGet(visibleIds),
      db.workoutExercises.where('workoutId').anyOf(visibleIds).toArray(),
      db.sets.where('workoutId').anyOf(visibleIds).toArray(),
      db.exercises.toArray(),
    ]);
    return { workouts: workouts.filter((w) => w !== undefined), workoutExercises, sets, exercises };
    // visibleIds は visibleKey が変わったときだけ変わる
  }, [db, visibleKey]);

  const visibleItems = useMemo(
    () =>
      details ? buildHistoryItems(details.workouts, details.workoutExercises, details.sets, details.exercises) : [],
    [details],
  );
  const total = allWorkouts?.length ?? 0;

  const hasAny = allWorkouts !== undefined && total > 0;

  return (
    <>
      <Heading level={1}>履歴</Heading>
      {allWorkouts && total === 0 && (
        <EmptyState title="記録がありません" description="ホームからワークアウトを始めると、ここに表示されます。" />
      )}
      {hasAny && (
        <SegmentedControl label="表示の切り替え" value={view} onChange={setView}>
          <SegmentedControlItem value="list" label="一覧" />
          <SegmentedControlItem value="calendar" label="カレンダー" />
        </SegmentedControl>
      )}
      {hasAny && view === 'calendar' && (
        <>
          <HistoryCalendar
            initialDate={allWorkouts[0]!.date}
            workoutDates={new Set(allWorkouts.map((w) => w.date))}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
          />
          {selectedDate && (
            <section aria-label={`${selectedDate}のワークアウト`}>
              <Heading level={2}>{selectedDate}</Heading>
              {allWorkouts.every((w) => w.date !== selectedDate) ? (
                <Text type="supporting">この日のワークアウトはありません。</Text>
              ) : (
                <HistoryList items={visibleItems} />
              )}
            </section>
          )}
        </>
      )}
      {hasAny && view === 'list' && (
        <>
          <HistoryList items={visibleItems} />
          {total > limit && (
            <div className="history-more">
              <Button
                label={`さらに表示（残り ${total - limit} 件）`}
                onClick={() => setLimit(limit + HISTORY_PAGE_SIZE)}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
