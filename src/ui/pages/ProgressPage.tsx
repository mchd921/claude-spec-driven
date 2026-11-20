import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useDatabase } from '../../app/DatabaseContext';
import { seriesByWorkout } from '../../domain/metrics';
import { filterByPeriod, PERIOD_OPTIONS, type Period } from '../../domain/period';
import { defaultDeps } from '../../services/deps';
import { ProgressChart } from '../components/ProgressChart';
import './ProgressPage.css';

export function ProgressPage() {
  const db = useDatabase();
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('3m');

  const data = useLiveQuery(async () => {
    const [exercises, workouts, sets] = await Promise.all([
      db.exercises.toArray(),
      db.workouts.toArray(),
      db.sets.toArray(),
    ]);
    return { exercises, workouts, sets };
  }, [db]);

  const options = useMemo(
    () =>
      (data?.exercises ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
        .map((e) => ({ value: e.id, label: e.archived ? `${e.name}（アーカイブ済み）` : e.name })),
    [data],
  );

  const points = useMemo(() => {
    if (!data || !exerciseId) return null;
    const all = seriesByWorkout(exerciseId, data.sets, data.workouts);
    return filterByPeriod(all, period, defaultDeps.today());
  }, [data, exerciseId, period]);

  return (
    <>
      <Heading level={1}>グラフ</Heading>
      <div className="progress-controls">
        <Selector
          label="種目"
          options={options}
          value={exerciseId ?? undefined}
          onChange={(value) => setExerciseId(value as string)}
          presentation="adaptive"
          width="100%"
        />
        <SegmentedControl label="期間" value={period} onChange={(value) => setPeriod(value as Period)}>
          {PERIOD_OPTIONS.map((option) => (
            <SegmentedControlItem key={option.value} value={option.value} label={option.label} />
          ))}
        </SegmentedControl>
      </div>
      {!exerciseId && <EmptyState title="種目を選んでください" description="選んだ種目の推移をグラフで表示します。" />}
      {points && points.length === 0 && (
        <EmptyState title="記録がありません" description="この種目の、選んだ期間内の記録がありません。" />
      )}
      {points && points.length > 0 && (
        <>
          <ProgressChart title="最大重量" unit="kg" points={points} value={(p) => p.maxWeight} />
          <ProgressChart title="推定 1RM" unit="kg" points={points} value={(p) => Math.round(p.maxE1RM * 10) / 10} />
          <ProgressChart title="ボリューム" unit="kg" points={points} value={(p) => p.volume} />
        </>
      )}
    </>
  );
}
