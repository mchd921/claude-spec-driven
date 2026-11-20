import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useDatabase } from '../../app/DatabaseContext';
import { useReportSaveError } from '../../app/useReportSaveError';
import type { HistoryItem } from '../../domain/history';
import { round1 } from '../../domain/metrics';
import { draftFromWorkout } from '../../services/templateService';
import { deleteWorkout } from '../../services/workoutService';
import './HistoryList.css';

/** 履歴一覧の各項目（日付・種目名・総セット数・総ボリューム）。削除と「メニューにする」も行える。 */
export function HistoryList({ items }: { items: readonly HistoryItem[] }) {
  const db = useDatabase();
  const navigate = useNavigate();
  const reportSaveError = useReportSaveError();
  const [deleting, setDeleting] = useState<HistoryItem | null>(null);

  const confirmDelete = async () => {
    if (!deleting) return;
    const id = deleting.workout.id;
    setDeleting(null);
    try {
      await deleteWorkout(db, id);
    } catch (error) {
      reportSaveError(error);
    }
  };

  /** 下書きを作り、メニュー作成画面へ渡す（REQ-4.11）。保存は作成画面で行う。 */
  const makeTemplate = async (workoutId: string) => {
    try {
      const draft = await draftFromWorkout(db, workoutId);
      if (draft.ok) void navigate('/templates/new', { state: { draft: draft.value } });
    } catch (error) {
      reportSaveError(error);
    }
  };

  return (
    <>
      <ul className="history-list">
        {items.map(({ workout, exerciseNames, setCount, totalVolume }) => {
          const title = exerciseNames.length > 0 ? exerciseNames.join('、') : '種目なし';
          return (
            <li key={workout.id} className="history-item">
              <ClickableCard label={`${workout.date}のワークアウトを開く`} href={`/workouts/${workout.id}`} padding={3}>
                <div className="history-item-head">
                  <Text type="label">{workout.date}</Text>
                  {workout.status === 'in_progress' && <Badge variant="info" label="進行中" />}
                </div>
                <Text>{title}</Text>
                <Text type="supporting">
                  {setCount} セット ・ {round1(totalVolume).toLocaleString('ja-JP')} kg
                </Text>
              </ClickableCard>
              <div className="history-item-actions">
                <Button
                  label="メニューにする"
                  aria-label={`${workout.date}のワークアウトをメニューにする`}
                  variant="ghost"
                  size="sm"
                  onClick={() => void makeTemplate(workout.id)}
                />
                <Button
                  label="削除"
                  aria-label={`${workout.date}のワークアウトを削除`}
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleting({ workout, exerciseNames, setCount, totalVolume })}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <AlertDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="ワークアウトを削除しますか？"
        description={`${deleting?.workout.date ?? ''}のワークアウトと、記録した ${deleting?.setCount ?? 0} セットを削除します。元に戻せません。`}
        actionLabel="削除する"
        cancelLabel="キャンセル"
        onAction={() => void confirmDelete()}
      />
    </>
  );
}
