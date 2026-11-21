import { describe, expect, it } from 'vitest';
import { localDateString } from './dates';

describe('localDateString', () => {
  it('REQ-1.1: 端末のローカル日付を YYYY-MM-DD で返す', () => {
    expect(localDateString(new Date(2026, 10, 17, 12, 30))).toBe('2026-11-17');
  });

  it('REQ-1.1: 深夜 0 時台・23 時台でも、UTC に変換せずローカルの日付を返す', () => {
    expect(localDateString(new Date(2026, 10, 17, 0, 0, 0))).toBe('2026-11-17');
    expect(localDateString(new Date(2026, 10, 17, 23, 59, 59))).toBe('2026-11-17');
  });

  it('REQ-1.1: 月・日が 1 桁のときゼロ埋めする', () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('REQ-1.1: 年末・うるう日を正しく扱う', () => {
    expect(localDateString(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    expect(localDateString(new Date(2024, 1, 29))).toBe('2024-02-29');
  });
});
