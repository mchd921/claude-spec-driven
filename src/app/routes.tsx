import { Link } from '@astryxdesign/core/Link';
import { Route, Routes } from 'react-router';
import { ExercisesPage } from '../ui/pages/ExercisesPage';
import { PlaceholderPage } from '../ui/pages/PlaceholderPage';
import { AppLayout } from './AppLayout';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<PlaceholderPage title="ホーム" />} />
        <Route path="workouts/:id" element={<PlaceholderPage title="ワークアウト記録" />} />
        <Route path="history" element={<PlaceholderPage title="履歴" />} />
        <Route path="progress" element={<PlaceholderPage title="グラフ" />} />
        <Route
          path="templates"
          element={
            <PlaceholderPage title="メニュー">
              <Link href="/templates/new">メニューを作成</Link>
            </PlaceholderPage>
          }
        />
        <Route path="templates/new" element={<PlaceholderPage title="メニュー作成" />} />
        <Route path="templates/:id" element={<PlaceholderPage title="メニュー編集" />} />
        <Route path="exercises" element={<ExercisesPage />} />
        <Route
          path="settings"
          element={
            <PlaceholderPage title="設定">
              <Link href="/exercises">種目マスタ</Link>
            </PlaceholderPage>
          }
        />
        <Route path="*" element={<PlaceholderPage title="ページが見つかりません" />} />
      </Route>
    </Routes>
  );
}
