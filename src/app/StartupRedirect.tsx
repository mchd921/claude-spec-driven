import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useDatabase } from './DatabaseContext';

/**
 * アプリの起動時に、進行中のワークアウトがあればその記録画面へ移動する（REQ-1.23）。
 * 起動時の 1 回だけ行い、その後の画面移動には干渉しない。
 */
export function StartupRedirect() {
  const db = useDatabase();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    if (pathname.startsWith('/workouts/')) return;
    void db.workouts
      .where('status')
      .equals('in_progress')
      .first()
      .then((running) => {
        if (running) void navigate(`/workouts/${running.id}`, { replace: true });
      });
  }, [db, navigate, pathname]);

  return null;
}
