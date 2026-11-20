import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { localDateString } from '../../domain/dates';
import { createNameKey } from '../../domain/validation';
import { addExercise, addSet, finishWorkout, startWorkout } from '../../services/workoutService';
import { setupTestDb, testDeps } from '../../test/testDb';

const ctx = setupTestDb();
let base = testDeps();
const depsFor = (today: string) => ({ ...base, today: () => today });

const exId = async (name: string) =>
  (await ctx.db.exercises.where('nameKey').equals(createNameKey(name)).first())!.id;

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateString(d);
}

async function record(date: string, name: string, weightKg = 60) {
  const deps = depsFor(date);
  const { workoutId } = await startWorkout(ctx.db, deps);
  const we = await addExercise(ctx.db, workoutId, await exId(name), deps);
  if (!we.ok) throw new Error('setup');
  await addSet(ctx.db, we.value.id, { weightKg, reps: 10 }, deps);
  await finishWorkout(ctx.db, workoutId, deps);
}

async function openProgress() {
  window.location.hash = '#/progress';
  render(<App db={ctx.db} />);
  await screen.findByRole('heading', { level: 1, name: 'グラフ' });
}

async function pickExercise(name: string) {
  await userEvent.click(await screen.findByRole('combobox', { name: '種目' }));
  await userEvent.click(await screen.findByRole('option', { name }));
}

describe('グラフ画面', () => {
  beforeEach(() => {
    window.location.hash = '';
    base = testDeps();
  });

  it('REQ-3.8〜3.10: 種目を選ぶと、最大重量・推定 1RM・ボリュームの 3 つのグラフが表示される', async () => {
    await record(daysAgo(5), 'ベンチプレス', 60);
    await record(daysAgo(2), 'ベンチプレス', 65);
    await openProgress();
    await pickExercise('ベンチプレス');
    expect(await screen.findByRole('img', { name: /最大重量/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /推定 1RM/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /ボリューム/ })).toBeInTheDocument();
    expect(screen.queryByText('記録がありません')).not.toBeInTheDocument();
  });

  it('REQ-3.12: 期間内に記録がないと「記録がありません」と表示され、グラフは表示されない', async () => {
    await record(daysAgo(200), 'スクワット');
    await openProgress();
    await pickExercise('スクワット');
    await userEvent.click(await screen.findByRole('radio', { name: '1か月' }));
    expect(await screen.findByText('記録がありません')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /最大重量/ })).not.toBeInTheDocument();
  });

  it('REQ-3.11: 期間を切り替えると、期間内のデータだけがグラフに使われる', async () => {
    await record(daysAgo(200), 'スクワット');
    await record(daysAgo(3), 'スクワット');
    await openProgress();
    await pickExercise('スクワット');
    await userEvent.click(await screen.findByRole('radio', { name: '全期間' }));
    expect(await screen.findByRole('img', { name: /最大重量.*2 件/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '3か月' }));
    expect(await screen.findByRole('img', { name: /最大重量.*1 件/ })).toBeInTheDocument();
  });

  it('REQ-3.8: 記録のない種目を選んだときも「記録がありません」と表示される', async () => {
    await record(daysAgo(2), 'ベンチプレス');
    await openProgress();
    await pickExercise('スクワット');
    expect(await screen.findByText('記録がありません')).toBeInTheDocument();
  });

  it('REQ-3.8: 種目の選択肢にはアーカイブ済みの種目も含まれる（過去の記録を見られる）', async () => {
    await record(daysAgo(2), 'ベンチプレス');
    const id = await exId('ベンチプレス');
    await ctx.db.exercises.update(id, { archived: true });
    await openProgress();
    await userEvent.click(await screen.findByRole('combobox', { name: '種目' }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'ベンチプレス（アーカイブ済み）' })).toBeInTheDocument();
  });
});
