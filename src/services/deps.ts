import { localDateString } from '../domain/dates';
import type { ISODate } from '../domain/types';
import { newId, nowIso } from '../db/ids';

/** サービスが使う ID 生成と時刻。テストでは差し替える。 */
export interface ServiceDeps {
  newId: () => string;
  /** 現在の日時（ISO 8601） */
  now: () => string;
  /** 端末のローカル日付（YYYY-MM-DD） */
  today: () => ISODate;
}

export const defaultDeps: ServiceDeps = {
  newId,
  now: nowIso,
  today: () => localDateString(new Date()),
};
