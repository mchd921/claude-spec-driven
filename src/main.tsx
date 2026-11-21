import './app/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { requestPersistentStorage } from './db/persist';
import { registerSW } from 'virtual:pwa-register';

const root = document.getElementById('root');
if (!root) throw new Error('#root が見つかりません');

void requestPersistentStorage();

// Service Worker を登録し、全アセットをキャッシュする（NFR-6）。開発サーバーでは登録されない。
registerSW({ immediate: true });

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
