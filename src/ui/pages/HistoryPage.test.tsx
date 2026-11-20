import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { createNameKey } from '../../domain/validation';
import { addExercise, addSet, finishWorkout, startWorkout } from '../../services/workoutService';
import { setupTestDb, testDeps } from '../../test/testDb';

const ctx = setupTestDb();
let base = testDeps();
const depsFor = (today: string) => ({ ...base, today: () => today });

const exId = async (name: string) =>
  (await ctx.db.exercises.where('nameKey').equals(createNameKey(name)).first())!.id;

async function record(date: string, name: string, sets: Array<[number, number]>) {
  const deps = depsFor(date);
  const { workoutId } = await startWorkout(ctx.db, deps);
  const we = await addExercise(ctx.db, workoutId, await exId(name), deps);
  if (!we.ok) throw new Error('setup');
  for (const [weightKg, reps] of sets) await addSet(ctx.db, we.value.id, { weightKg, reps }, deps);
  await finishWorkout(ctx.db, workoutId, deps);
  return workoutId;
}

const openHistory = () => {
  window.location.hash = '#/history';
  render(<App db={ctx.db} />);
};

describe('履歴一覧', () => {
  beforeEach(() => {
    window.location.hash = '';
    base = testDeps();
  });

  it('REQ-3.1: 日付の新しい順に並び、同じ日付なら作成日時の新しい順になる', async () => {
    await record('2026-11-10', 'ベンチプレス', [[60, 10]]); // 朝
    await record('2026-11-12', 'スクワット', [[100, 5]]);
    await record('2026-11-10', 'デッドリフト', [[120, 5]]); // 同じ日の夜
    openHistory();
    await screen.findAllByRole('link', { name: /のワークアウトを開く/ });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('スクワット'),
      expect.stringContaining('デッドリフト'),
      expect.stringContaining('ベンチプレス'),
    ]);
  });

  it('REQ-3.2: 各項目に日付・種目名・総セット数・総ボリュームが表示される', async () => {
    await record('2026-11-10', 'ベンチプレス', [[60, 10], [62.5, 8]]);
    openHistory();
    await screen.findByRole('link', { name: '2026-11-10のワークアウトを開く' });
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('2026-11-10')).toBeInTheDocument();
    expect(within(item).getByText('ベンチプレス')).toBeInTheDocument();
    expect(within(item).getByText('2 セット ・ 1,100 kg')).toBeInTheDocument();
  });

  it('REQ-2.10: アーカイブ済みの種目も、種目名付きで表示される', async () => {
    await record('2026-11-10', 'ベンチプレス', [[60, 10]]);
    await ctx.db.exercises.update(await exId('ベンチプレス'), { archived: true });
    openHistory();
    expect(await screen.findByText('ベンチプレス')).toBeInTheDocument();
  });

  it('REQ-3.3: 項目を選ぶと、そのワークアウトの記録画面が開く', async () => {
    const id = await record('2026-11-10', 'ベンチプレス', [[60, 10]]);
    openHistory();
    await userEvent.click(await screen.findByRole('link', { name: '2026-11-10のワークアウトを開く' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'ワークアウト記録' })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/workouts/${id}`);
    expect(await screen.findByText('60.0kg × 10回')).toBeInTheDocument();
  });

  it('REQ-3.4: 削除を選ぶと確認が表示され、キャンセルすると削除されない', async () => {
    const id = await record('2026-11-10', 'ベンチプレス', [[60, 10]]);
    openHistory();
    await userEvent.click(await screen.findByRole('button', { name: '2026-11-10のワークアウトを削除' }));
    expect(await screen.findByText('ワークアウトを削除しますか？')).toBeInTheDocument();
    expect(await ctx.db.workouts.get(id)).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(await ctx.db.workouts.get(id)).toBeDefined();
  });

  it('REQ-3.5: 削除を確定すると、ワークアウトと全セットが削除され、一覧から消える', async () => {
    await record('2026-11-10', 'ベンチプレス', [[60, 10], [60, 8]]);
    await record('2026-11-11', 'スクワット', [[100, 5]]);
    openHistory();
    await userEvent.click(await screen.findByRole('button', { name: '2026-11-10のワークアウトを削除' }));
    await userEvent.click(await screen.findByRole('button', { name: '削除する' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: '2026-11-10のワークアウトを開く' })).not.toBeInTheDocument());
    expect(await ctx.db.workouts.count()).toBe(1);
    expect(await ctx.db.sets.count()).toBe(1);
  });

  it('REQ-3.1: 31 件以上あるときは 30 件ずつ表示し、「さらに表示」で続きを読み込む', async () => {
    const rows = Array.from({ length: 35 }, (_, i) => ({
      id: `w${String(i).padStart(2, '0')}`,
      date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
      status: 'completed' as const,
      memo: '',
      createdAt: `2026-10-01T00:00:${String(i).padStart(2, '0')}.000Z`,
      completedAt: null,
      updatedAt: 'x',
    }));
    await ctx.db.workouts.bulkAdd(rows);
    openHistory();
    expect(await screen.findAllByRole('link', { name: /のワークアウトを開く/ })).toHaveLength(30);
    await userEvent.click(screen.getByRole('button', { name: 'さらに表示（残り 5 件）' }));
    await waitFor(() => expect(screen.getAllByRole('link', { name: /のワークアウトを開く/ })).toHaveLength(35));
    expect(screen.queryByRole('button', { name: /さらに表示/ })).not.toBeInTheDocument();
  });

  it('REQ-3.1: 記録がないときは、その旨を表示する', async () => {
    openHistory();
    expect(await screen.findByText('記録がありません')).toBeInTheDocument();
  });

  it('REQ-4.11: 「メニューにする」で、メニュー作成画面へ移動する', async () => {
    await record('2026-11-10', 'ベンチプレス', [[60, 10]]);
    openHistory();
    await userEvent.click(await screen.findByRole('button', { name: '2026-11-10のワークアウトをメニューにする' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'メニュー作成' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/templates/new');
  });
});
