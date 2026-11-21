import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createNameKey } from '../../domain/validation';
import { exportBackup, serializeBackup } from '../../services/backupService';
import { addExercise, addSet, finishWorkout, startWorkout } from '../../services/workoutService';
import { setupTestDb, testDeps } from '../../test/testDb';

const ctx = setupTestDb();
let deps = testDeps();

const exId = async (name: string) =>
  (await ctx.db.exercises.where('nameKey').equals(createNameKey(name)).first())!.id;

async function record(date: string, name: string) {
  const d = { ...deps, today: () => date };
  const { workoutId } = await startWorkout(ctx.db, d);
  const we = await addExercise(ctx.db, workoutId, await exId(name), d);
  if (!we.ok) throw new Error('setup');
  await addSet(ctx.db, we.value.id, { weightKg: 60, reps: 10 }, d);
  await finishWorkout(ctx.db, workoutId, d);
}

/** ダウンロード（Blob の URL を作ってリンクをクリック）を横取りして、中身とファイル名を記録する。 */
const downloads: Array<{ name: string; blob: Blob }> = [];
beforeEach(() => {
  downloads.length = 0;
  deps = testDeps();
  window.location.hash = '#/settings';
  URL.createObjectURL = vi.fn((blob: Blob) => {
    downloads.push({ name: '', blob });
    return 'blob:test';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads[downloads.length - 1]!.name = this.download;
  });
});
afterEach(() => vi.restoreAllMocks());

async function openSettings() {
  render(<App db={ctx.db} />);
  await screen.findByRole('heading', { level: 1, name: '設定' });
}

const upload = (text: string, name = 'backup.json') =>
  userEvent.upload(screen.getByLabelText('バックアップファイルを選択'), new File([text], name, { type: 'application/json' }));

describe('設定画面（データ管理）', () => {
  it('REQ-5.1, 5.2: JSON エクスポートで、全データとバージョン番号を含むファイルがダウンロードされる', async () => {
    await record('2026-11-10', 'ベンチプレス');
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'JSON エクスポート' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.name).toMatch(/^workout-tracker-\d{8}\.json$/);
    const file = JSON.parse(await downloads[0]!.blob.text());
    expect(file.format).toBe('workout-tracker-backup');
    expect(file.version).toBe(1);
    expect(file.data.workouts).toHaveLength(1);
    expect(file.data.sets).toHaveLength(1);
    expect(file.data.exercises.length).toBeGreaterThan(0);
  });

  it('REQ-5.7: CSV エクスポートで、BOM 付きで見出しとセットの行を含むファイルがダウンロードされる', async () => {
    await record('2026-11-10', 'ベンチプレス');
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'CSV エクスポート' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.name).toMatch(/^workout-tracker-sets-\d{8}\.csv$/);
    const bytes = new Uint8Array(await downloads[0]!.blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder('utf-8').decode(bytes);
    expect(text).toContain('日付,種目,部位,セット番号,重量,回数');
    expect(text).toContain('2026-11-10,ベンチプレス');
  });

  it('REQ-5.5: JSON として読めないファイルでは、確認を出さずにエラーを表示し、データは変わらない', async () => {
    await record('2026-11-10', 'ベンチプレス');
    await openSettings();
    await upload('これは JSON ではありません');
    expect(await screen.findByText(/JSON として読み込めませんでした/)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await ctx.db.workouts.count()).toBe(1);
  });

  it('REQ-5.5: 形式が違うファイルでも、確認を出さずにエラーを表示し、データは変わらない', async () => {
    await record('2026-11-10', 'ベンチプレス');
    await openSettings();
    await upload(JSON.stringify({ format: 'other', version: 1, data: {} }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await ctx.db.workouts.count()).toBe(1);
  });

  it('REQ-5.3, 5.4: 正しいファイルでは置き換えの確認が表示され、承認するとデータが置き換わる', async () => {
    await record('2026-11-10', 'ベンチプレス');
    const backupText = serializeBackup(await exportBackup(ctx.db, deps));
    // バックアップ後に、データを変える（ワークアウトを増やす）
    await record('2026-11-11', 'スクワット');
    expect(await ctx.db.workouts.count()).toBe(2);

    await openSettings();
    await upload(backupText);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('置き換え');
    expect(await ctx.db.workouts.count()).toBe(2); // 承認前は変わらない

    await userEvent.click(screen.getByRole('button', { name: '置き換える' }));
    await waitFor(async () => expect(await ctx.db.workouts.count()).toBe(1));
    expect((await ctx.db.workouts.toArray())[0]!.date).toBe('2026-11-10');
    expect((await screen.findAllByText(/インポートしました/)).length).toBeGreaterThan(0);
  });

  it('REQ-5.3: 確認でキャンセルすると、データは変わらない', async () => {
    await record('2026-11-10', 'ベンチプレス');
    const backupText = serializeBackup(await exportBackup(ctx.db, deps));
    await record('2026-11-11', 'スクワット');
    await openSettings();
    await upload(backupText);
    await userEvent.click(await screen.findByRole('button', { name: 'キャンセル' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(await ctx.db.workouts.count()).toBe(2);
  });

  it('REQ-5.6: 置き換えの途中で例外が起きても、既存データは元のまま残り、保存エラーが通知される', async () => {
    await record('2026-11-10', 'ベンチプレス');
    const backupText = serializeBackup(await exportBackup(ctx.db, deps));
    await record('2026-11-11', 'スクワット');
    vi.spyOn(ctx.db.sets, 'bulkAdd').mockRejectedValue(new Error('disk error'));
    await openSettings();
    await upload(backupText);
    await userEvent.click(await screen.findByRole('button', { name: '置き換える' }));
    expect(await screen.findByText(/保存できませんでした/)).toBeInTheDocument();
    expect(await ctx.db.workouts.count()).toBe(2);
  });

  it('REQ-2.2: 種目マスタへのリンクがある', async () => {
    await openSettings();
    expect(screen.getByRole('link', { name: '種目マスタ' })).toHaveAttribute('href', expect.stringContaining('/exercises'));
  });
});
