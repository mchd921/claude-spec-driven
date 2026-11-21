import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { createNameKey } from '../../domain/validation';
import { createTemplate } from '../../services/templateService';
import { setupTestDb, testDeps } from '../../test/testDb';

const ctx = setupTestDb();
let base = testDeps();

const exId = async (name: string) =>
  (await ctx.db.exercises.where('nameKey').equals(createNameKey(name)).first())!.id;

async function seedTemplate(name: string, exercises: Array<[string, number | null]>) {
  const items = [];
  for (const [n, targetSets] of exercises) items.push({ exerciseId: await exId(n), targetSets });
  const result = await createTemplate(ctx.db, { name, items }, base);
  if (!result.ok) throw new Error('setup');
  return result.value;
}

function open(hash: string) {
  window.location.hash = hash;
  render(<App db={ctx.db} />);
}

const templateNames = async () => (await ctx.db.templates.toArray()).map((t) => t.name);

/** 「種目を追加」からシートを開き、種目を選ぶ。 */
async function addExerciseToForm(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: '種目を追加' }));
  const dialog = await screen.findByRole('dialog', { name: '種目を選ぶ' });
  await userEvent.click(within(dialog).getByRole('button', { name }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '種目を選ぶ' })).not.toBeInTheDocument());
}

function expectDisabled(button: HTMLElement) {
  expect(button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true').toBe(true);
}

describe('メニュー一覧', () => {
  beforeEach(() => {
    window.location.hash = '';
    base = testDeps();
  });

  it('REQ-4.7: メニューがないときは、その旨と作成への導線を表示する', async () => {
    open('#/templates');
    expect(await screen.findByText('メニューがありません')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'メニューを作成' })).toBeInTheDocument();
  });

  it('REQ-4.7: 削除は確認のあとに実行され、キャンセルすると残る', async () => {
    await seedTemplate('push', [['ベンチプレス', 3]]);
    open('#/templates');
    await userEvent.click(await screen.findByRole('button', { name: 'push を削除' }));
    await userEvent.click(await screen.findByRole('button', { name: 'キャンセル' }));
    expect(await templateNames()).toEqual(['push']);

    await userEvent.click(screen.getByRole('button', { name: 'push を削除' }));
    await userEvent.click(await screen.findByRole('button', { name: '削除する' }));
    expect(await screen.findByText('メニューがありません')).toBeInTheDocument();
    expect(await templateNames()).toEqual([]);
  });
});

describe('メニュー作成・編集', () => {
  beforeEach(() => {
    window.location.hash = '';
    base = testDeps();
  });

  // 注: jsdom では、種目を選ぶシートを同じ画面で 2 回開くと 2 回目が表示されない（Chromium では問題なし）。
  // そのため UI から追加する種目は 1 件にし、複数種目の順序は REQ-4.5 のテストと templateService のテストで確認する。
  it('REQ-4.1: 名前と種目を指定して作成すると、メニューが登録されて一覧へ戻る', async () => {
    open('#/templates/new');
    await userEvent.type(await screen.findByRole('textbox', { name: 'メニュー名' }), 'push');
    await addExerciseToForm('ベンチプレス');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'メニュー' })).toBeInTheDocument();
    const [saved] = await ctx.db.templates.toArray();
    expect(saved!.name).toBe('push');
    expect(saved!.items.map((i) => i.exerciseId)).toEqual([await exId('ベンチプレス')]);
  });

  it('REQ-4.2: 名前が空のときは保存されず、エラーが表示される', async () => {
    open('#/templates/new');
    await addExerciseToForm('ベンチプレス');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(/メニュー名は 1〜50 文字/)).toBeInTheDocument();
    expect(await ctx.db.templates.count()).toBe(0);
  });

  it('REQ-4.3: 種目が 0 件のときは保存されず、エラーが表示される', async () => {
    open('#/templates/new');
    await userEvent.type(await screen.findByRole('textbox', { name: 'メニュー名' }), 'push');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('種目を 1 つ以上追加してください。')).toBeInTheDocument();
    expect(await ctx.db.templates.count()).toBe(0);
  });

  it('REQ-4.4: 目標セット数を指定すると保存され、範囲外ならエラーになる', async () => {
    open('#/templates/new');
    await userEvent.type(await screen.findByRole('textbox', { name: 'メニュー名' }), 'push');
    await addExerciseToForm('ベンチプレス');
    const target = screen.getByRole('textbox', { name: 'ベンチプレスの目標セット数' });
    await userEvent.type(target, '21');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(/目標セット数は 1〜20/)).toBeInTheDocument();
    expect(await ctx.db.templates.count()).toBe(0);

    await userEvent.clear(target);
    await userEvent.type(target, '4');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByRole('heading', { level: 1, name: 'メニュー' });
    expect((await ctx.db.templates.toArray())[0]!.items[0]!.targetSets).toBe(4);
  });

  it('REQ-4.5: ↑↓ ボタンで種目の順番が入れ替わり、保存すると新しい順序で更新される', async () => {
    const t = await seedTemplate('push', [['ベンチプレス', null], ['スクワット', null], ['懸垂', null]]);
    open(`#/templates/${t.id}`);
    await screen.findByRole('heading', { level: 1, name: 'メニュー編集' });
    const names = () => screen.getAllByRole('listitem').map((li) => within(li).getByTestId('item-name').textContent);
    expect(names()).toEqual(['ベンチプレス', 'スクワット', '懸垂']);

    await userEvent.click(screen.getByRole('button', { name: 'スクワットを上へ' }));
    expect(names()).toEqual(['スクワット', 'ベンチプレス', '懸垂']);
    await userEvent.click(screen.getByRole('button', { name: 'スクワットを下へ' }));
    await userEvent.click(screen.getByRole('button', { name: 'スクワットを下へ' }));
    expect(names()).toEqual(['ベンチプレス', '懸垂', 'スクワット']);

    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByRole('heading', { level: 1, name: 'メニュー' });
    const saved = (await ctx.db.templates.get(t.id))!;
    expect(saved.items.map((i) => i.exerciseId)).toEqual([await exId('ベンチプレス'), await exId('懸垂'), await exId('スクワット')]);
  });

  it('REQ-4.5: 先頭の「上へ」と末尾の「下へ」は押せない', async () => {
    const t = await seedTemplate('push', [['ベンチプレス', null], ['スクワット', null]]);
    open(`#/templates/${t.id}`);
    await screen.findByRole('heading', { level: 1, name: 'メニュー編集' });
    expectDisabled(screen.getByRole('button', { name: 'ベンチプレスを上へ' }));
    expectDisabled(screen.getByRole('button', { name: 'スクワットを下へ' }));
  });

  it('REQ-4.6: 名前・種目・目標セット数を編集して保存できる', async () => {
    const t = await seedTemplate('push', [['ベンチプレス', 3]]);
    open(`#/templates/${t.id}`);
    const name = await screen.findByRole('textbox', { name: 'メニュー名' });
    expect(name).toHaveValue('push');
    expect(screen.getByRole('textbox', { name: 'ベンチプレスの目標セット数' })).toHaveValue('3');
    await userEvent.clear(name);
    await userEvent.type(name, 'chest day');
    await addExerciseToForm('ダンベルフライ');
    await userEvent.click(screen.getByRole('button', { name: 'ベンチプレスを削除' }));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByRole('heading', { level: 1, name: 'メニュー' });
    const saved = (await ctx.db.templates.get(t.id))!;
    expect(saved.name).toBe('chest day');
    expect(saved.items.map((i) => i.exerciseId)).toEqual([await exId('ダンベルフライ')]);
  });

  it('REQ-4.11: 履歴から渡された下書きが、名前は空・種目と目標セット数入りで表示される', async () => {
    const deps = base;
    const bench = await exId('ベンチプレス');
    await ctx.db.workouts.add({
      id: 'w1', date: '2026-11-10', status: 'completed', memo: '', createdAt: deps.now(), completedAt: deps.now(), updatedAt: deps.now(),
    });
    await ctx.db.workoutExercises.add({ id: 'we1', workoutId: 'w1', exerciseId: bench, order: 0, targetSets: null });
    for (let i = 0; i < 2; i++) {
      await ctx.db.sets.add({
        id: `s${i}`, workoutId: 'w1', workoutExerciseId: 'we1', exerciseId: bench, order: i,
        weightTenthKg: 600, reps: 10, createdAt: deps.now(),
      });
    }
    open('#/history');
    await userEvent.click(await screen.findByRole('button', { name: '2026-11-10のワークアウトをメニューにする' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'メニュー作成' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メニュー名' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'ベンチプレスの目標セット数' })).toHaveValue('2');
  });

  it('REQ-4.6: 存在しないメニューの編集画面では、見つからない旨を表示する', async () => {
    open('#/templates/nope');
    expect(await screen.findByText('メニューが見つかりません')).toBeInTheDocument();
  });
});
