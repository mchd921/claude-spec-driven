import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useDatabase } from '../../app/DatabaseContext';
import { buildHistoryItems } from '../../domain/history';
import { HistoryList } from '../components/HistoryList';

/** 1 回に読み込む件数（NFR-1 の性能のため、一覧は段階的に表示する）。 */
export const HISTORY_PAGE_SIZE = 30;

export function HistoryPage() {
  const db = useDatabase();
  const [limit, setLimit] = useState(HISTORY_PAGE_SIZE);

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
