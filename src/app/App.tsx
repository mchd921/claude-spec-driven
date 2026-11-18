import { HashRouter } from 'react-router';
import { AppProviders } from './AppProviders';
import { AppRoutes } from './routes';

export function App() {
  return (
    <HashRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </HashRouter>
  );
}
