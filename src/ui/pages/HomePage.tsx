import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router';
import { useDatabase } from '../../app/DatabaseContext';
import { useReportSaveError } from '../../app/useReportSaveError';
import { startWorkoutFromTemplate } from '../../services/templateService';
import { startWorkout } from '../../services/workoutService';
import './HomePage.css';

const RESUMED_MESSAGE = '進行中のワークアウトがあるため、続きを開きました';

export function HomePage() {
  const db = useDatabase();
  const navigate = useNavigate();
  const toast = useToast();
  const reportSaveError = useReportSaveError();

  const running = useLiveQuery(
    async () => (await db.workouts.where('status').equals('in_progress').first()) ?? null,
    [db],
  );
  const templates = useLiveQuery(
    async () => (await db.templates.toArray()).sort((x, y) => x.createdAt.localeCompare(y.createdAt)),
    [db],
  );

  const open = (workoutId: string) => void navigate(`/workouts/${workoutId}`);

  const start = async () => {
    try {
      const result = await startWorkout(db);
      if (!result.created) toast({ body: RESUMED_MESSAGE });
      open(result.workoutId);
    } catch (error) {
      reportSaveError(error);
    }
  };

  const startFromTemplate = async (templateId: string) => {
    try {
      const result = await startWorkoutFromTemplate(db, templateId);
      if (!result.ok) {
        toast({ body: Object.values(result.errors)[0] ?? '開始できませんでした', type: 'error' });
        return;
      }
      const { workoutId, created, skippedExerciseNames } = result.value;
      if (!created) toast({ body: RESUMED_MESSAGE });
      if (skippedExerciseNames.length > 0) {
        toast({
          body: `アーカイブ済みのため追加しなかった種目: ${skippedExerciseNames.join('、')}`,
          autoHideDuration: 10000,
        });
      }
      open(workoutId);
    } catch (error) {
      reportSaveError(error);
    }
  };

  return (
    <>
      <Heading level={1}>ホーム</Heading>

      <div className="home-actions">
        {running ? (
          <Button variant="primary" size="lg" label="進行中のワークアウトを再開" onClick={() => open(running.id)} />
        ) : (
          <Button variant="primary" size="lg" label="ワークアウト開始" onClick={() => void start()} />
        )}
      </div>

      <section aria-labelledby="home-templates">
        <Heading level={2} id="home-templates">メニューから開始</Heading>
        {templates && templates.length === 0 && (
          <Text type="supporting">メニューはまだありません。「メニュー」タブから作成できます。</Text>
        )}
        <ul className="home-templates">
          {templates?.map((template) => (
            <li key={template.id}>
              <Button
                label={template.name}
                aria-label={`メニュー「${template.name}」で開始`}
                onClick={() => void startFromTemplate(template.id)}
              />
              <Text type="supporting">{template.items.length} 種目</Text>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
