import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestDb } from '../test/testDb';
import indexHtml from '../../index.html?raw';
import { App } from './App';

const ctx = setupTestDb();

const JAPANESE = /[぀-ヿ一-鿿]/;
const ROUTES = ['/', '/history', '/progress', '/templates', '/templates/new', '/settings', '/exercises'];

/** 操作できる要素（ボタン・リンクなど）の、見える文字または読み上げ名。 */
function labelsOfControls(): string[] {
  const controls = screen.queryAllByRole('button').concat(
    screen.queryAllByRole('link'),
    screen.queryAllByRole('radio'),
    screen.queryAllByRole('combobox'),
    screen.queryAllByRole('textbox'),
  );
  return controls.map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()).filter((s) => s !== '');
}

describe('UI の言語', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('NFR-11: ページの言語が日本語に設定されている', () => {
    expect(indexHtml).toMatch(/<html lang="ja">/);
  });

  it.each(ROUTES)('NFR-11: %s の見出しと操作できる要素の名前が、すべて日本語を含む', async (route) => {
    window.location.hash = `#${route}`;
    render(<App db={ctx.db} />);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(JAPANESE);
    const labels = labelsOfControls();
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.filter((label) => !JAPANESE.test(label))).toEqual([]);
  });

  it('NFR-11: Astryx が持つ文言（日付入力・種目選択のシートなど）も日本語になっている', async () => {
    const { startWorkout } = await import('../services/workoutService');
    const { workoutId } = await startWorkout(ctx.db);
    window.location.hash = `#/workouts/${workoutId}`;
    render(<App db={ctx.db} />);
    await screen.findByRole('button', { name: '種目を追加' });
    await userEvent.click(screen.getByRole('button', { name: '種目を追加' }));
    await screen.findByRole('dialog', { name: '種目を選ぶ' });
    const labels = labelsOfControls();
    expect(labels.filter((label) => !JAPANESE.test(label))).toEqual([]);
  });
});
