import { HashRouter } from 'react-router';
import type { WorkoutDatabase } from '../db';
import { AppProviders } from './AppProviders';
import { DatabaseProvider } from './DatabaseContext';
import { AppRoutes } from './routes';
import { StartupRedirect } from './StartupRedirect';

/** db を渡すと、その DB を使う（テスト用）。省略すると共通の DB を使う。 */
export function App({ db }: { db?: WorkoutDatabase }) {
  const content = (
    <HashRouter>
      <AppProviders>
        <StartupRedirect />
        <AppRoutes />
      </AppProviders>
    </HashRouter>
  );
  return db ? <DatabaseProvider db={db}>{content}</DatabaseProvider> : content;
}
