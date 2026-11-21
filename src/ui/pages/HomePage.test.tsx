import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { createNameKey } from '../../domain/validation';
import { createTemplate } from '../../services/templateService';
import { startWorkout } from '../../services/workoutService';
import { setupTestDb, testDeps } from '../../test/testDb';

const ctx = setupTestDb();

const exId = async (name: string) =>
  (await ctx.db.exercises.where('nameKey').equals(createNameKey(name)).first())!.id;

function launch(path = '/') {
  window.location.hash = `#${path}`;
  return render(<App db={ctx.db} />);
}

const workoutHeading = () => screen.findByRole('heading', { level: 1, name: 'ワークアウト記録' });

describe('ホーム画面', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('REQ-1.1: 「ワークアウト開始」で進行中のワークアウトを作り、記録画面へ移動する', async () => {
    launch();
    await userEvent.click(await screen.findByRole('button', { name: 'ワークアウト開始' }));
    await workoutHeading();
    const all = await ctx.db.workouts.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: 'in_progress' });
    expect(window.location.hash).toBe(`#/workouts/${all[0]!.id}`);
  });

  it('REQ-1.23: 進行中のワークアウトがある状態で起動すると、記録画面が表示される', async () => {
    const { workoutId } = await startWorkout(ctx.db, testDeps());
    launch('/');
    await workoutHeading();
    expect(window.location.hash).toBe(`#/workouts/${workoutId}`);
  });

  it('REQ-1.23: 起動時に別の画面を開いていても、進行中なら記録画面が表示される', async () => {
    await startWorkout(ctx.db, testDeps());
    launch('/history');
    await workoutHeading();
  });

  it('REQ-1.23: 進行中がなければ、起動してもホームのまま', async () => {
    launch('/');
    expect(await screen.findByRole('button', { name: 'ワークアウト開始' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ワークアウト記録' })).not.toBeInTheDocument();
  });

  it('REQ-1.24: 起動後にホームへ戻ると、自動では移動せず「再開」を表示する。再開しても新しく作らない', async () => {
    launch('/history');
    await startWorkout(ctx.db, testDeps()); // 起動後に開始した状態
    window.location.hash = '#/';
    const resume = await screen.findByRole('button', { name: '進行中のワークアウトを再開' });
    expect(screen.queryByRole('button', { name: 'ワークアウト開始' })).not.toBeInTheDocument();
    await userEvent.click(resume);
    await workoutHeading();
    expect(await ctx.db.workouts.count()).toBe(1);
  });

  it('REQ-4.8: メニューを選ぶと、そのメニューの種目でワークアウトが始まる', async () => {
    const bench = await exId('ベンチプレス');
    await createTemplate(ctx.db, { name: '胸の日', items: [{ exerciseId: bench, targetSets: 3 }] }, testDeps());
    launch('/');
    await userEvent.click(await screen.findByRole('button', { name: 'メニュー「胸の日」で開始' }));
    await workoutHeading();
    const entries = await ctx.db.workoutExercises.toArray();
    expect(entries).toMatchObject([{ exerciseId: bench, targetSets: 3 }]);
  });

  it('REQ-4.9: アーカイブ済みの種目を除外して開始したとき、除外した種目名が通知される', async () => {
    const bench = await exId('ベンチプレス');
    const squat = await exId('スクワット');
    await createTemplate(
      ctx.db,
      { name: '全身', items: [{ exerciseId: bench, targetSets: null }, { exerciseId: squat, targetSets: null }] },
      testDeps(),
    );
    await ctx.db.exercises.update(bench, { archived: true });
    launch('/');
    await userEvent.click(await screen.findByRole('button', { name: 'メニュー「全身」で開始' }));
    expect((await screen.findAllByText(/追加しなかった種目: ベンチプレス/)).length).toBeGreaterThan(0);
    expect(await ctx.db.workoutExercises.count()).toBe(1);
  });

  it('REQ-4.8: メニューがないときは、作成を案内する', async () => {
    launch('/');
    expect(await screen.findByText(/メニューはまだありません/)).toBeInTheDocument();
  });
});
