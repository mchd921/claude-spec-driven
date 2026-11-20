import './app/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { requestPersistentStorage } from './db/persist';

const root = document.getElementById('root');
if (!root) throw new Error('#root が見つかりません');

void requestPersistentStorage();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
