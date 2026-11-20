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

  // 種目の一覧は小さいので全件読む。セットは、選んだ種目の分だけ exerciseId のインデックスから読む（NFR-5）。
  const exercises = useLiveQuery(() => db.exercises.toArray(), [db]);
  const series = useLiveQuery(async () => {
    if (!exerciseId) return null;
    const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray();
    const workoutIds = [...new Set(sets.map((set) => set.workoutId))];
    const workouts = (await db.workouts.bulkGet(workoutIds)).filter((w) => w !== undefined);
    return { sets, workouts };
  }, [db, exerciseId]);

  const options = useMemo(
    () =>
      (exercises ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
        .map((e) => ({ value: e.id, label: e.archived ? `${e.name}（アーカイブ済み）` : e.name })),
    [exercises],
  );

  const points = useMemo(() => {
    if (!series || !exerciseId) return null;
    const all = seriesByWorkout(exerciseId, series.sets, series.workouts);
    return filterByPeriod(all, period, defaultDeps.today());
  }, [series, exerciseId, period]);

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
