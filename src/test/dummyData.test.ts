import { describe, expect, it } from 'vitest';
import { validateBackup, createBackupFile } from '../domain/backupSchema';
import { generateDummyData } from './dummyData';

describe('性能確認用のダミーデータ', () => {
  it('NFR-5: 既定で 500 ワークアウト / 15,000 セットを作り、バックアップ形式の検証に通る', () => {
    const data = generateDummyData();
    expect(data.workouts).toHaveLength(500);
    expect(data.sets).toHaveLength(15000);
    expect(validateBackup(createBackupFile(data, '2026-11-20T00:00:00.000Z')).ok).toBe(true);
  });

  it('NFR-5: 同じシードなら同じデータになる（再現できる）', () => {
    expect(generateDummyData({ seed: 3 })).toEqual(generateDummyData({ seed: 3 }));
  });
});
