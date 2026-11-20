import { Route, Routes } from 'react-router';
import { ExercisesPage } from '../ui/pages/ExercisesPage';
import { HistoryPage } from '../ui/pages/HistoryPage';
import { HomePage } from '../ui/pages/HomePage';
import { SettingsPage } from '../ui/pages/SettingsPage';
import { TemplateEditPage } from '../ui/pages/TemplateEditPage';
import { TemplatesPage } from '../ui/pages/TemplatesPage';
import { ProgressPage } from '../ui/pages/ProgressPage';
import { WorkoutPage } from '../ui/pages/WorkoutPage';
import { PlaceholderPage } from '../ui/pages/PlaceholderPage';
import { AppLayout } from './AppLayout';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="workouts/:id" element={<WorkoutPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="templates/new" element={<TemplateEditPage />} />
        <Route path="templates/:id" element={<TemplateEditPage />} />
        <Route path="exercises" element={<ExercisesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<PlaceholderPage title="ページが見つかりません" />} />
      </Route>
    </Routes>
  );
}
