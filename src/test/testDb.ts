import Dexie from 'dexie';
import { afterEach, beforeEach } from 'vitest';
import { createDatabase, type WorkoutDatabase } from '../db/database';
import type { ServiceDeps } from '../services/deps';

let counter = 0;

/**
 * テストごとに空の DB（初期種目入り）を作り、終了後に削除する。
 * `ctx.db` はテスト実行中に参照する。
 */
export function setupTestDb(): { readonly db: WorkoutDatabase } {
  let current: WorkoutDatabase | null = null;
  let name = '';

  beforeEach(() => {
    name = `svc-test-${Date.now()}-${++counter}`;
    current = createDatabase(name);
  });

  afterEach(async () => {
    current?.close();
    current = null;
    await Dexie.delete(name);
  });

  return {
    get db() {
      if (!current) throw new Error('setupTestDb: テストの外で db を参照しました');
      return current;
    },
  };
}

/** ID と時刻が予測できるテスト用の依存。時刻は呼ぶたびに 1 秒進む。 */
export function testDeps(options: { today?: string } = {}): ServiceDeps & { tick: () => string } {
  let id = 0;
  let sec = 0;
  const stamp = () => new Date(Date.UTC(2026, 10, 17, 10, 0, sec)).toISOString();
  return {
    newId: () => `id-${++id}`,
    now: () => {
      sec += 1;
      return stamp();
    },
    today: () => options.today ?? '2026-11-17',
    tick: stamp,
  };
}
