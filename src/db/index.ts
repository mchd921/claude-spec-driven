import { createDatabase } from './database';

export { createDatabase, DB_NAME, WorkoutDatabase } from './database';
export { newId, nowIso } from './ids';
export { requestPersistentStorage } from './persist';

/** アプリ全体で共有する DB。 */
export const db = createDatabase();
