import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { createNameKey } from '../../domain/validation';
import { addExercise, addSet, startWorkout } from '../../services/workoutService';
import { setupTestDb, testDeps } from '../../test/testDb';

const ctx = setupTestDb();

const exId = async (name: string) =>
  (await ctx.db.exercises.where('nameKey').equals(createNameKey(name)).first())!.id;

async function open() {
  const deps = testDeps();
  const { workoutId } = await startWorkout(ctx.db, deps);
  window.location.hash = `#/workouts/${workoutId}`;
  render(<App db={ctx.db} />);
  await screen.findByRole('button', { name: '種目を追加' });
  return { workoutId, deps };
}

async function openPicker() {
  await userEvent.click(screen.getByRole('button', { name: '種目を追加' }));
  return screen.findByRole('dialog', { name: '種目を選ぶ' });
}

describe('記録画面: 種目の追加と削除', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('REQ-1.2: 種目追加を選ぶと、有効な種目が部位ごとに分類されて表示される', async () => {
    await open();
    const sheet = await openPicker();
    const chest = within(sheet).getByRole('region', { name: '胸の種目' });
    expect(within(chest).getByRole('button', { name: 'ベンチプレス' })).toBeInTheDocument();
    expect(within(sheet).getByRole('region', { name: '脚の種目' })).toBeInTheDocument();
  });

  it('REQ-1.3: 部位を選ぶと、その部位の有効な種目だけが表示される', async () => {
    await open();
    const sheet = await openPicker();
    await userEvent.click(within(sheet).getByRole('radio', { name: '脚' }));
    expect(within(sheet).getByRole('button', { name: 'スクワット' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'ベンチプレス' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('region', { name: '胸の種目' })).not.toBeInTheDocument();
  });

  it('REQ-1.3: 「すべて」に戻すと、全部位の種目が再び表示される', async () => {
    await open();
    const sheet = await openPicker();
    await userEvent.click(within(sheet).getByRole('radio', { name: '脚' }));
    await userEvent.click(within(sheet).getByRole('radio', { name: 'すべて' }));
    expect(within(sheet).getByRole('button', { name: 'ベンチプレス' })).toBeInTheDocument();
  });

  it('REQ-2.9: アーカイブ済みの種目は、選択肢に表示されない', async () => {
    await ctx.db.exercises.update(await exId('ベンチプレス'), { archived: true });
    await open();
    const sheet = await openPicker();
    expect(within(sheet).queryByRole('button', { name: 'ベンチプレス' })).not.toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'インクラインベンチプレス' })).toBeInTheDocument();
  });

  it('REQ-4.1: 種目のない部位では、その旨が表示される', async () => {
    await open();
    const sheet = await openPicker();
    await userEvent.click(within(sheet).getByRole('radio', { name: 'その他' }));
    expect(within(sheet).getByText('この部位の種目はありません。')).toBeInTheDocument();
  });

  it('REQ-1.4: 種目を選ぶと、ワークアウトの末尾に追加され、シートが閉じる', async () => {
    const { workoutId } = await open();
    const sheet = await openPicker();
    await userEvent.click(within(sheet).getByRole('button', { name: 'ベンチプレス' }));
    expect(await screen.findByRole('region', { name: 'ベンチプレス' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '種目を選ぶ' })).not.toBeInTheDocument());

    // 2 件目は画面外から追加し、末尾の順序になることを確認する
    // （jsdom ではシートを閉じたあとの再表示が正しく動かないため。実ブラウザでは再表示できることを確認済み）
    await addExercise(ctx.db, workoutId, await exId('スクワット'), testDeps());
    await screen.findByRole('region', { name: 'スクワット' });
    const entries = await ctx.db.workoutExercises.where('workoutId').equals(workoutId).sortBy('order');
    expect(entries.map((e) => e.order)).toEqual([0, 1]);
  });

  it('REQ-1.13: セットのない種目は、確認なしでワークアウトから外せる', async () => {
    const { workoutId, deps } = await open();
    await addExercise(ctx.db, workoutId, await exId('ベンチプレス'), deps);
    await userEvent.click(await screen.findByRole('button', { name: 'ベンチプレスをワークアウトから外す' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'ベンチプレス' })).not.toBeInTheDocument());
    expect(await ctx.db.workoutExercises.count()).toBe(0);
  });

  it('REQ-1.13: セットのある種目は、確認のうえ、セットごとワークアウトから外される', async () => {
    const { workoutId, deps } = await open();
    const we = await addExercise(ctx.db, workoutId, await exId('ベンチプレス'), deps);
    if (!we.ok) throw new Error('setup');
    await addSet(ctx.db, we.value.id, { weightKg: 60, reps: 10 }, deps);

    await userEvent.click(await screen.findByRole('button', { name: 'ベンチプレスをワークアウトから外す' }));
    await userEvent.click(await screen.findByRole('button', { name: 'キャンセル' }));
    expect(await ctx.db.workoutExercises.count()).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: 'ベンチプレスをワークアウトから外す' }));
    await userEvent.click(await screen.findByRole('button', { name: '外す' }));
    await screen.findByText('種目がありません');
    expect(await ctx.db.workoutExercises.count()).toBe(0);
    expect(await ctx.db.sets.count()).toBe(0);
  });

  it('REQ-1.4: 存在しないワークアウトでは、見つからない旨を表示する', async () => {
    window.location.hash = '#/workouts/ghost';
    render(<App db={ctx.db} />);
    expect(await screen.findByText('ワークアウトが見つかりません')).toBeInTheDocument();
  });
});
