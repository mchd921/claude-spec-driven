import { render, screen, within } from '@testing-library/react';
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

async function record(date: string, name: string) {
  const deps = depsFor(date);
  const { workoutId } = await startWorkout(ctx.db, deps);
  const we = await addExercise(ctx.db, workoutId, await exId(name), deps);
  if (!we.ok) throw new Error('setup');
  await addSet(ctx.db, we.value.id, { weightKg: 60, reps: 10 }, deps);
  await finishWorkout(ctx.db, workoutId, deps);
}

async function openCalendar() {
  window.location.hash = '#/history';
  render(<App db={ctx.db} />);
  await userEvent.click(await screen.findByRole('radio', { name: 'カレンダー' }));
  return screen.findByRole('grid');
}

describe('履歴カレンダー', () => {
  beforeEach(() => {
    window.location.hash = '';
    base = testDeps();
  });

  it('REQ-3.6: ワークアウトがある日には印が付き、ない日には付かない', async () => {
    await record('2026-10-05', 'スクワット'); // 直近は 11 月のため、10 月は前の月
    await record('2026-11-10', 'ベンチプレス');
    await record('2026-11-10', 'スクワット');
    const grid = await openCalendar();
    expect(within(grid).getByRole('button', { name: '2026-11-10（ワークアウトあり）' })).toBeInTheDocument();
    expect(within(grid).getByRole('button', { name: '2026-11-11' })).toBeInTheDocument();
    expect(within(grid).queryByRole('button', { name: '2026-11-11（ワークアウトあり）' })).not.toBeInTheDocument();
    expect(within(grid).getAllByRole('button', { name: /ワークアウトあり/ })).toHaveLength(1);
  });

  it('REQ-3.6: 月を移動すると、その月の印が表示される', async () => {
    await record('2026-10-05', 'スクワット');
    await record('2026-11-10', 'ベンチプレス');
    await openCalendar();
    await userEvent.click(screen.getByRole('button', { name: '前の月' }));
    expect(await screen.findByRole('button', { name: '2026-10-05（ワークアウトあり）' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2026-11-10（ワークアウトあり）' })).not.toBeInTheDocument();
  });

  it('REQ-3.7: ワークアウトがある日を選ぶと、その日の全ワークアウトが一覧表示される', async () => {
    await record('2026-11-10', 'ベンチプレス');
    await record('2026-11-10', 'スクワット');
    await record('2026-11-12', 'デッドリフト');
    await openCalendar();
    await userEvent.click(screen.getByRole('button', { name: '2026-11-10（ワークアウトあり）' }));
    const section = await screen.findByRole('region', { name: '2026-11-10のワークアウト' });
    const items = within(section).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('スクワット');
    expect(items[1]).toHaveTextContent('ベンチプレス');
    expect(within(section).queryByText('デッドリフト')).not.toBeInTheDocument();
  });

  it('REQ-3.7: ワークアウトがない日を選ぶと、その旨が表示される', async () => {
    await record('2026-11-10', 'ベンチプレス');
    await openCalendar();
    await userEvent.click(screen.getByRole('button', { name: '2026-11-11' }));
    expect(await screen.findByText('この日のワークアウトはありません。')).toBeInTheDocument();
  });

  it('REQ-3.6: 一覧とカレンダーを切り替えられる', async () => {
    await record('2026-11-10', 'ベンチプレス');
    await openCalendar();
    expect(screen.queryByRole('link', { name: /のワークアウトを開く/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '一覧' }));
    expect(await screen.findByRole('link', { name: '2026-11-10のワークアウトを開く' })).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});
