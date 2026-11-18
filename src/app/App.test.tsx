import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

function renderAt(path: string) {
  window.location.hash = `#${path}`;
  return render(<App />);
}

const tabs = () => within(screen.getByRole('navigation', { name: 'メインタブ' }));

describe('アプリの枠組み', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it.each([
    ['ホーム', 'ホーム'],
    ['履歴', '履歴'],
    ['グラフ', 'グラフ'],
    ['メニュー', 'メニュー'],
    ['設定', '設定'],
  ])('下部タブの「%s」で画面を移動できる', async (tab, heading) => {
    renderAt(tab === 'ホーム' ? '/settings' : '/');
    await userEvent.click(tabs().getByRole('link', { name: tab }));
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(tabs().getByRole('link', { name: tab })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['/workouts/abc', 'ワークアウト記録'],
    ['/templates/new', 'メニュー作成'],
    ['/templates/abc', 'メニュー編集'],
    ['/exercises', '種目マスタ'],
  ])('%s を直接開ける', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('設定画面から種目マスタへ移動できる', async () => {
    renderAt('/settings');
    await userEvent.click(await screen.findByRole('link', { name: '種目マスタ' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: '種目マスタ' }),
    ).toBeInTheDocument();
    expect(tabs().getByRole('link', { name: '設定' })).toHaveAttribute('aria-current', 'page');
  });

  it('メニュー画面から作成画面へ移動できる', async () => {
    renderAt('/templates');
    await userEvent.click(await screen.findByRole('link', { name: 'メニューを作成' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'メニュー作成' }),
    ).toBeInTheDocument();
  });
});

it('テスト環境で IndexedDB が使える', () => {
  expect(indexedDB).toBeDefined();
});
