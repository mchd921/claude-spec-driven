import { newId, nowIso } from '../db/ids';

/** サービスが使う ID 生成と時刻。テストでは差し替える。 */
export interface ServiceDeps {
  newId: () => string;
  now: () => string;
}

export const defaultDeps: ServiceDeps = { newId, now: nowIso };
