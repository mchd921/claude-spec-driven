import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { createNameKey } from '../../domain/validation';
import { addExercise, addSet, finishWorkout, startWorkout } from '../../services/workoutService';
import { setupTestDb, testDeps } from '../../test/testDb';

const ctx = setupTestDb();
let deps = testDeps();

const exId = async (name: string) =>
  (await ctx.db.exercises.where('nameKey').equals(createNameKey(name)).first())!.id;

async function openWorkout(options: { withSet?: boolean; finished?: boolean } = {}) {
  const { workoutId } = await startWorkout(ctx.db, deps);
  const we = await addExercise(ctx.db, workoutId, await exId('ベンチプレス'), deps);
  if (!we.ok) throw new Error('setup');
  if (options.withSet) await addSet(ctx.db, we.value.id, { weightKg: 60, reps: 10 }, deps);
  if (options.finished) await finishWorkout(ctx.db, workoutId, deps);
  window.location.hash = `#/workouts/${workoutId}`;
  render(<App db={ctx.db} />);
  await screen.findByRole('region', { name: 'ベンチプレス' });
  return workoutId;
}

describe('記録画面: メモ・日付・終了', () => {
  beforeEach(() => {
    window.location.hash = '';
    deps = testDeps();
  });

  it('REQ-1.14: メモを入力すると、保存操作なしでワークアウトに保存される', async () => {
    const id = await openWorkout();
    await userEvent.type(screen.getByRole('textbox', { name: /メモ/ }), '調子が良い');
    await waitFor(async () => expect((await ctx.db.workouts.get(id))?.memo).toBe('調子が良い'));
  });

  it('REQ-1.15: メモは 500 文字までしか入力できない', async () => {
    await openWorkout();
    const memo = screen.getByRole('textbox', { name: /メモ/ });
    await userEvent.click(memo);
    await userEvent.paste('あ'.repeat(520));
    await waitFor(() => expect((memo as HTMLTextAreaElement).value.length).toBeLessThanOrEqual(500));
    expect((memo as HTMLTextAreaElement).value.length).toBe(500);
  });

  it('REQ-1.16: 当日以前の日付に変更すると、ワークアウトの日付が更新される', async () => {
    const id = await openWorkout();
    const input = screen.getByRole('combobox', { name: /日付/ });
    await userEvent.clear(input);
    await userEvent.type(input, '2026年11月1日{Enter}');
    await waitFor(async () => expect((await ctx.db.workouts.get(id))?.date).toBe('2026-11-01'));
  });

  it('REQ-1.17: 翌日以降の日付を入力しても、日付は更新されない', async () => {
    const id = await openWorkout();
    const before = (await ctx.db.workouts.get(id))!.date;
    const input = screen.getByRole('combobox', { name: /日付/ });
    await userEvent.clear(input);
    await userEvent.type(input, '2999年1月1日{Enter}');
    await new Promise((r) => setTimeout(r, 100));
    expect((await ctx.db.workouts.get(id))?.date).toBe(before);
  });

  it('REQ-1.20: 「ワークアウト終了」でセットがあれば完了になり、ホームへ戻る', async () => {
    const id = await openWorkout({ withSet: true });
    await userEvent.click(screen.getByRole('button', { name: 'ワークアウト終了' }));
    await waitFor(async () => expect((await ctx.db.workouts.get(id))?.status).toBe('completed'));
    expect(await screen.findByRole('heading', { level: 1, name: 'ホーム' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'ワークアウト開始' })).toBeInTheDocument();
  });

  it('REQ-1.21: セットが 0 件のまま終了すると、破棄の確認が表示され、まだ削除されない', async () => {
    const id = await openWorkout();
    await userEvent.click(screen.getByRole('button', { name: 'ワークアウト終了' }));
    expect(await screen.findByText('ワークアウトを破棄しますか？')).toBeInTheDocument();
    expect((await ctx.db.workouts.get(id))?.status).toBe('in_progress');
  });

  it('REQ-1.21: 破棄の確認で「続ける」を選ぶと、ワークアウトは残る', async () => {
    const id = await openWorkout();
    await userEvent.click(screen.getByRole('button', { name: 'ワークアウト終了' }));
    await userEvent.click(await screen.findByRole('button', { name: '続ける' }));
    expect(await ctx.db.workouts.get(id)).toBeDefined();
    expect(screen.getByRole('button', { name: 'ワークアウト終了' })).toBeInTheDocument();
  });

  it('REQ-1.22: 破棄を確定すると、ワークアウトが削除されホームへ戻る', async () => {
    await openWorkout();
    await userEvent.click(screen.getByRole('button', { name: 'ワークアウト終了' }));
    await userEvent.click(await screen.findByRole('button', { name: '破棄する' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'ホーム' })).toBeInTheDocument();
    expect(await ctx.db.workouts.count()).toBe(0);
    expect(await ctx.db.workoutExercises.count()).toBe(0);
  });

  it('REQ-1.25: 完了済みのワークアウトでは「終了」ボタンが表示されず、編集はできる', async () => {
    const id = await openWorkout({ withSet: true, finished: true });
    expect(screen.queryByRole('button', { name: 'ワークアウト終了' })).not.toBeInTheDocument();
    expect(screen.getByText('完了')).toBeInTheDocument();

    const section = screen.getByRole('region', { name: 'ベンチプレス' });
    await userEvent.click(within(section).getByRole('button', { name: '+ セット' }));
    await waitFor(async () => expect(await ctx.db.sets.where('workoutId').equals(id).count()).toBe(2));
    await userEvent.type(screen.getByRole('textbox', { name: /メモ/ }), 'あとから追記');
    await waitFor(async () => expect((await ctx.db.workouts.get(id))?.memo).toBe('あとから追記'));
    expect((await ctx.db.workouts.get(id))?.status).toBe('completed');
  });
});
