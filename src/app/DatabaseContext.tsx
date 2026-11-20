import { createContext, use, type ReactNode } from 'react';
import { db as defaultDb, type WorkoutDatabase } from '../db';

const DatabaseContext = createContext<WorkoutDatabase>(defaultDb);

/** 画面が使うデータベースを差し替える（テストでは、テストごとの DB を渡す）。 */
export function DatabaseProvider({ db, children }: { db: WorkoutDatabase; children: ReactNode }) {
  return <DatabaseContext value={db}>{children}</DatabaseContext>;
}

export function useDatabase(): WorkoutDatabase {
  return use(DatabaseContext);
}
