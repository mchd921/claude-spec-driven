import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { createNameKey } from '../../domain/validation';
import { createTemplate, startWorkoutFromTemplate } from '../../services/templateService';
import { addExercise, addSet, finishWorkout, startWorkout } from '../../services/workoutService';
import { setupTestDb, testDeps } from '../../test/testDb';

const ctx = setupTestDb();

// ID と時刻の連番を、1 つのテスト内で共有する（別々に作ると ID が重複する）
let base = testDeps();
const depsFor = (today: string) => ({ ...base, today: () => today });

const exId = async (name: string) =>
  (await ctx.db.exercises.where('nameKey').equals(createNameKey(name)).first())!.id;

/** 過去の完了ワークアウトを作る（日付を指定）。 */
async function pastWorkout(date: string, name: string, sets: Array<[number, number]>) {
  const deps = depsFor(date);
  const { workoutId } = await startWorkout(ctx.db, deps);
  const we = await addExercise(ctx.db, workoutId, await exId(name), deps);
  if (!we.ok) throw new Error('setup');
  for (const [weightKg, reps] of sets) await addSet(ctx.db, we.value.id, { weightKg, reps }, deps);
  await finishWorkout(ctx.db, workoutId, deps);
}

/** 今日の進行中ワークアウトに種目を 1 つ追加して、画面を開く。 */
async function openWith(name = 'ベンチプレス', sets: Array<[number, number]> = []) {
  const deps = depsFor('2026-11-20');
  const { workoutId } = await startWorkout(ctx.db, deps);
  const we = await addExercise(ctx.db, workoutId, await exId(name), deps);
  if (!we.ok) throw new Error('setup');
  for (const [weightKg, reps] of sets) await addSet(ctx.db, we.value.id, { weightKg, reps }, deps);
  window.location.hash = `#/workouts/${workoutId}`;
  render(<App db={ctx.db} />);
  return { workoutId, entryId: we.value.id, section: await screen.findByRole('region', { name }) };
}

const setsInDb = async () => (await ctx.db.sets.toArray()).sort((a, b) => a.order - b.order);
const weightBox = (s: HTMLElement) => within(s).getByRole('textbox', { name: /重量/ });
const repsBox = (s: HTMLElement) => within(s).getByRole('textbox', { name: /回数/ });

describe('記録画面: セットの記録', () => {
  beforeEach(() => {
    window.location.hash = '';
    base = testDeps();
  });

  it('REQ-1.5: 過去の記録がある種目には、直近のワークアウトの全セットが前回として表示される', async () => {
    await pastWorkout('2026-11-01', 'ベンチプレス', [[50, 10]]);
    await pastWorkout('2026-11-10', 'ベンチプレス', [[60, 10], [60, 8]]);
    const { section } = await openWith();
    expect(within(section).getByText(/前回（2026-11-10）: 60.0kg×10、60.0kg×8/)).toBeInTheDocument();
  });

  it('REQ-1.7: 記録済みのセットがなく過去の記録があれば、前回の最初のセットが初期値になる', async () => {
    await pastWorkout('2026-11-10', 'ベンチプレス', [[60, 10], [57.5, 8]]);
    const { section } = await openWith();
    expect(weightBox(section)).toHaveValue('60');
    expect(repsBox(section)).toHaveValue('10');
  });

  it('REQ-1.6: 記録済みのセットがあれば、最後のセットが初期値になる', async () => {
    await pastWorkout('2026-11-10', 'ベンチプレス', [[60, 10]]);
    const { section } = await openWith('ベンチプレス', [[62.5, 8], [65, 6]]);
    expect(weightBox(section)).toHaveValue('65');
    expect(repsBox(section)).toHaveValue('6');
  });

  it('NFR-4: 初期値がある状態で「+ セット」を 1 回押すと、セットが追加される', async () => {
    await pastWorkout('2026-11-10', 'ベンチプレス', [[60, 10]]);
    const { section, entryId } = await openWith();
    await userEvent.click(within(section).getByRole('button', { name: '+ セット' }));
    await waitFor(async () => expect(await ctx.db.sets.where('workoutExerciseId').equals(entryId).count()).toBe(1));
    expect((await setsInDb())[0]).toMatchObject({ weightTenthKg: 600, reps: 10 });
    expect(await within(section).findByText('60.0kg × 10回')).toBeInTheDocument();
  });

  it('REQ-1.8: 重量と回数を入力して追加すると、種目の末尾に追加される', async () => {
    const { section } = await openWith();
    await userEvent.type(weightBox(section), '62.5');
    await userEvent.type(repsBox(section), '8');
    await userEvent.click(within(section).getByRole('button', { name: '+ セット' }));
    await userEvent.click(within(section).getByRole('button', { name: '+ セット' }));
    await waitFor(async () => expect(await ctx.db.sets.count()).toBe(2));
    expect((await setsInDb()).map((s) => [s.weightTenthKg, s.reps])).toEqual([[625, 8], [625, 8]]);
  });

  it('REQ-1.6: ±ボタンは重量を 1kg、回数を 1 ずつ増減する', async () => {
    await pastWorkout('2026-11-10', 'ベンチプレス', [[60, 10]]);
    const { section } = await openWith();
    await userEvent.click(within(section).getByRole('button', { name: '重量を 1kg 増やす' }));
    await userEvent.click(within(section).getByRole('button', { name: '回数を 1 減らす' }));
    await userEvent.click(within(section).getByRole('button', { name: '回数を 1 減らす' }));
    expect(weightBox(section)).toHaveValue('61');
    expect(repsBox(section)).toHaveValue('8');
  });

  it('REQ-1.9: 不正な値では、入力欄の近くにエラーが表示され、セットは追加されない', async () => {
    const { section } = await openWith();
    await userEvent.type(weightBox(section), '-5');
    await userEvent.click(within(section).getByRole('button', { name: '+ セット' }));
    expect(await within(section).findAllByText(/重量/)).not.toHaveLength(0);
    expect(within(section).getAllByText(/回数を入力/).length).toBeGreaterThan(0);
    expect(await ctx.db.sets.count()).toBe(0);
  });

  it('REQ-1.9: 数字でない文字を入力しても、エラーになり追加されない', async () => {
    const { section } = await openWith();
    await userEvent.type(weightBox(section), 'abc');
    await userEvent.type(repsBox(section), '5');
    await userEvent.click(within(section).getByRole('button', { name: '+ セット' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(await ctx.db.sets.count()).toBe(0);
  });

  it('REQ-1.10: セットを編集して保存すると、重量と回数が更新される', async () => {
    const { section } = await openWith('ベンチプレス', [[60, 10]]);
    await userEvent.click(within(section).getByRole('button', { name: 'セット1を編集' }));
    const sheet = await screen.findByRole('dialog', { name: 'セットを編集' });
    const weight = within(sheet).getByRole('textbox', { name: /重量/ });
    await userEvent.clear(weight);
    await userEvent.type(weight, '65');
    await userEvent.click(within(sheet).getByRole('button', { name: '保存' }));
    await waitFor(async () => expect((await setsInDb())[0]).toMatchObject({ weightTenthKg: 650, reps: 10 }));
    expect(await within(section).findByText('65.0kg × 10回')).toBeInTheDocument();
  });

  it('REQ-1.11: 編集で不正な値にすると、エラーが表示され、更新されない', async () => {
    const { section } = await openWith('ベンチプレス', [[60, 10]]);
    await userEvent.click(within(section).getByRole('button', { name: 'セット1を編集' }));
    const sheet = await screen.findByRole('dialog', { name: 'セットを編集' });
    const reps = within(sheet).getByRole('textbox', { name: /回数/ });
    await userEvent.clear(reps);
    await userEvent.type(reps, '0');
    await userEvent.click(within(sheet).getByRole('button', { name: '保存' }));
    expect((await within(sheet).findAllByText(/回数/)).length).toBeGreaterThan(1);
    expect((await setsInDb())[0]).toMatchObject({ weightTenthKg: 600, reps: 10 });
  });

  it('REQ-1.12: セットを削除すると、そのセットだけが消える', async () => {
    const { section } = await openWith('ベンチプレス', [[60, 10], [60, 8]]);
    await userEvent.click(within(section).getByRole('button', { name: 'セット1を削除' }));
    await waitFor(async () => expect(await ctx.db.sets.count()).toBe(1));
    expect((await setsInDb())[0]).toMatchObject({ reps: 8 });
    await waitFor(() => expect(within(section).queryByText('60.0kg × 10回')).not.toBeInTheDocument());
  });

  it('REQ-3.13: 自己ベストを更新したセットに PR の印が付く（最初のセットには付かない）', async () => {
    await pastWorkout('2026-11-10', 'ベンチプレス', [[60, 10]]);
    const { section } = await openWith('ベンチプレス', [[65, 10]]);
    expect(await within(section).findByText('重量PR')).toBeInTheDocument();
    expect(within(section).getByText('1RM PR')).toBeInTheDocument();
  });

  it('REQ-3.13: 過去を上回らないセットには PR の印が付かない', async () => {
    await pastWorkout('2026-11-10', 'ベンチプレス', [[70, 10]]);
    const { section } = await openWith('ベンチプレス', [[60, 5]]);
    await within(section).findByText('60.0kg × 5回');
    expect(within(section).queryByText(/PR/)).not.toBeInTheDocument();
  });

  it('REQ-3.14: セットを追加すると、PR の判定が再計算される', async () => {
    await pastWorkout('2026-11-10', 'ベンチプレス', [[60, 10]]);
    const { section } = await openWith();
    const weight = weightBox(section);
    await userEvent.clear(weight);
    await userEvent.type(weight, '80');
    await userEvent.click(within(section).getByRole('button', { name: '+ セット' }));
    expect(await within(section).findByText('重量PR')).toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'セット1を削除' }));
    await waitFor(() => expect(within(section).queryByText('重量PR')).not.toBeInTheDocument());
  });

  it('REQ-4.10: 目標セット数がある種目には「2 / 3 セット」の形で表示される', async () => {
    const bench = await exId('ベンチプレス');
    await createTemplate(ctx.db, { name: '胸', items: [{ exerciseId: bench, targetSets: 3 }] }, base);
    const template = (await ctx.db.templates.toArray())[0]!;
    const deps = depsFor('2026-11-20');
    const started = await startWorkoutFromTemplate(ctx.db, template.id, deps);
    if (!started.ok) throw new Error('setup');
    const entry = (await ctx.db.workoutExercises.toArray())[0]!;
    await addSet(ctx.db, entry.id, { weightKg: 60, reps: 10 }, deps);
    await addSet(ctx.db, entry.id, { weightKg: 60, reps: 8 }, deps);
    window.location.hash = `#/workouts/${started.value.workoutId}`;
    render(<App db={ctx.db} />);
    expect(await screen.findByText('2 / 3 セット')).toBeInTheDocument();
  });

  it('REQ-4.10: 目標セット数がない種目には表示されない', async () => {
    const { section } = await openWith('ベンチプレス', [[60, 10]]);
    await within(section).findByText('60.0kg × 10回');
    expect(within(section).queryByText(/\/ \d+ セット/)).not.toBeInTheDocument();
  });
});
