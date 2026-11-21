import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DatabaseProvider } from '../../app/DatabaseContext';
import { createNameKey } from '../../domain/validation';
import { setupTestDb, testDeps } from '../../test/testDb';
import { addExercise, startWorkout } from '../../services/workoutService';
import { ExercisesPage } from './ExercisesPage';

const ctx = setupTestDb();

const setup = () =>
  render(
    <DatabaseProvider db={ctx.db}>
      <ExercisesPage />
    </DatabaseProvider>,
  );

const find = (name: string) => ctx.db.exercises.where('nameKey').equals(createNameKey(name)).first();

async function addViaForm(name: string) {
  const input = await screen.findByRole('textbox', { name: '種目名' });
  await userEvent.clear(input);
  if (name) await userEvent.type(input, name);
  await userEvent.click(screen.getByRole('button', { name: '追加' }));
}

describe('種目マスタ画面', () => {
  it('REQ-2.1: 部位ごとに初期種目が一覧表示される', async () => {
    setup();
    const chest = await screen.findByRole('region', { name: '胸' });
    expect(within(chest).getByText('ベンチプレス')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '脚' })).toBeInTheDocument();
  });

  it('REQ-2.2: 種目名を入力して追加すると、一覧に表示される', async () => {
    setup();
    await addViaForm('ケーブルフライ');
    expect(await screen.findByText('ケーブルフライ')).toBeInTheDocument();
    expect(await find('ケーブルフライ')).toMatchObject({ bodyPart: 'chest' });
  });

  it('REQ-2.3: 種目名が空のとき、入力欄の近くにエラーが表示され、登録されない', async () => {
    setup();
    const before = await ctx.db.exercises.count();
    await addViaForm('');
    const input = await screen.findByRole('textbox', { name: '種目名' });
    expect(input).toHaveAccessibleDescription(/種目名/);
    expect(await ctx.db.exercises.count()).toBe(before);
  });

  it('REQ-2.4: 重複した名前のとき、重複している旨が表示され、登録されない', async () => {
    setup();
    const before = await ctx.db.exercises.count();
    await addViaForm('  ベンチプレス ');
    expect(await screen.findAllByText(/重複/)).not.toHaveLength(0);
    expect(await ctx.db.exercises.count()).toBe(before);
  });

  it('REQ-2.5: 種目名を編集して保存できる', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'ベンチプレスを編集' }));
    const inputs = screen.getAllByRole('textbox', { name: '種目名' });
    const input = inputs[inputs.length - 1]!;
    await userEvent.clear(input);
    await userEvent.type(input, 'フラットベンチ');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('フラットベンチ')).toBeInTheDocument();
    expect(await find('ベンチプレス')).toBeUndefined();
  });

  it('REQ-2.6: 編集で重複した名前にすると、エラーが表示され更新されない', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'ベンチプレスを編集' }));
    const inputs = screen.getAllByRole('textbox', { name: '種目名' });
    const input = inputs[inputs.length - 1]!;
    await userEvent.clear(input);
    await userEvent.type(input, 'インクラインベンチプレス');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findAllByText(/重複/)).not.toHaveLength(0);
    expect(await find('ベンチプレス')).toBeDefined();
  });

  it('REQ-2.7: 使われていない種目を削除すると「削除しました」と通知される', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'ベンチプレスを削除' }));
    await userEvent.click(await screen.findByRole('button', { name: '削除する' }));
    expect((await screen.findAllByText(/削除しました/)).length).toBeGreaterThan(0);
    expect(await find('ベンチプレス')).toBeUndefined();
  });

  it('REQ-2.8: 使われている種目を削除すると「アーカイブしました」と通知され、アーカイブ済みに移る', async () => {
    setup();
    const deps = testDeps();
    const { workoutId } = await startWorkout(ctx.db, deps);
    await addExercise(ctx.db, workoutId, (await find('ベンチプレス'))!.id, deps);

    await userEvent.click(await screen.findByRole('button', { name: 'ベンチプレスを削除' }));
    await userEvent.click(await screen.findByRole('button', { name: '削除する' }));
    expect((await screen.findAllByText(/アーカイブしました/)).length).toBeGreaterThan(0);
    const archived = await screen.findByRole('region', { name: 'アーカイブ済みの種目' });
    expect(within(archived).getByText(/ベンチプレス/)).toBeInTheDocument();
    expect(await find('ベンチプレス')).toMatchObject({ archived: true });
  });

  it('REQ-2.11: アーカイブ済みの種目を復元すると、有効な一覧に戻る', async () => {
    setup();
    const bench = (await find('ベンチプレス'))!;
    await ctx.db.exercises.update(bench.id, { archived: true });
    await userEvent.click(await screen.findByRole('button', { name: 'ベンチプレスを復元' }));
    const chest = await screen.findByRole('region', { name: '胸' });
    expect(await within(chest).findByText('ベンチプレス')).toBeInTheDocument();
    expect(await find('ベンチプレス')).toMatchObject({ archived: false });
  });

  it('REQ-2.8: 削除の確認でキャンセルすると、何も変わらない', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'ベンチプレスを削除' }));
    await userEvent.click(await screen.findByRole('button', { name: 'キャンセル' }));
    expect(await find('ベンチプレス')).toBeDefined();
  });
});
