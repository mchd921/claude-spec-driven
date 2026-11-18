import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';

it('アプリの見出しを表示する', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: '筋トレ管理' })).toBeInTheDocument();
});

it('テスト環境で IndexedDB が使える', () => {
  expect(indexedDB).toBeDefined();
});
