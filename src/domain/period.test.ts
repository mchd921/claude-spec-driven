import { describe, expect, it } from 'vitest';
import { filterByPeriod, isInPeriod, PERIOD_OPTIONS, periodStart } from './period';

describe('periodStart', () => {
  it('REQ-3.11: 1 か月は当日の 1 か月前の同日', () => {
    expect(periodStart('1m', '2026-11-17')).toBe('2026-10-17');
  });

  it('REQ-3.11: 3 か月は当日の 3 か月前の同日', () => {
    expect(periodStart('3m', '2026-11-17')).toBe('2026-08-17');
  });

  it('REQ-3.11: 1 年は当日の 1 年前の同日', () => {
    expect(periodStart('1y', '2026-11-17')).toBe('2025-11-17');
  });

  it('REQ-3.11: 全期間は下限なし（null）', () => {
    expect(periodStart('all', '2026-11-17')).toBeNull();
  });

  it('REQ-3.11: 年をまたぐ場合も正しく遡る', () => {
    expect(periodStart('1m', '2026-01-15')).toBe('2025-12-15');
    expect(periodStart('3m', '2026-02-10')).toBe('2025-11-10');
  });

  it('REQ-3.11: 前の月に同じ日がないとき月末にする（30 日・31 日）', () => {
    expect(periodStart('1m', '2026-03-31')).toBe('2026-02-28');
    expect(periodStart('1m', '2026-05-31')).toBe('2026-04-30');
    expect(periodStart('3m', '2026-05-31')).toBe('2026-02-28');
    expect(periodStart('1m', '2026-12-31')).toBe('2026-11-30');
  });

  it('REQ-3.11: うるう年の 2 月 29 日を扱える', () => {
    expect(periodStart('1m', '2024-03-31')).toBe('2024-02-29');
    expect(periodStart('1m', '2024-03-29')).toBe('2024-02-29');
    expect(periodStart('1y', '2024-02-29')).toBe('2023-02-28');
    expect(periodStart('1y', '2025-02-28')).toBe('2024-02-28');
    expect(periodStart('1y', '2028-02-29')).toBe('2027-02-28');
  });

  it('REQ-3.11: 月初・年初でも正しい', () => {
    expect(periodStart('1m', '2026-03-01')).toBe('2026-02-01');
    expect(periodStart('1y', '2026-01-01')).toBe('2025-01-01');
  });
});

describe('isInPeriod', () => {
  const today = '2026-11-17';

  it('REQ-3.11: 開始日と当日を含む', () => {
    expect(isInPeriod('2026-10-17', '1m', today)).toBe(true);
    expect(isInPeriod('2026-11-17', '1m', today)).toBe(true);
  });

  it('REQ-3.11: 開始日より前は含まない', () => {
    expect(isInPeriod('2026-10-16', '1m', today)).toBe(false);
    expect(isInPeriod('2026-08-16', '3m', today)).toBe(false);
    expect(isInPeriod('2025-11-16', '1y', today)).toBe(false);
  });

  it('REQ-3.11: 当日より後は含まない', () => {
    expect(isInPeriod('2026-11-18', '1m', today)).toBe(false);
    expect(isInPeriod('2026-11-18', 'all', today)).toBe(false);
  });

  it('REQ-3.11: 全期間は当日以前のすべてを含む', () => {
    expect(isInPeriod('2000-01-01', 'all', today)).toBe(true);
  });
});

describe('filterByPeriod', () => {
  it('REQ-3.11: 期間内のデータだけを、元の順序のまま返す', () => {
    const points = [
      { date: '2025-01-01', v: 1 },
      { date: '2026-09-01', v: 2 },
      { date: '2026-10-20', v: 3 },
      { date: '2026-11-17', v: 4 },
    ];
    expect(filterByPeriod(points, '1m', '2026-11-17').map((p) => p.v)).toEqual([3, 4]);
    expect(filterByPeriod(points, '3m', '2026-11-17').map((p) => p.v)).toEqual([2, 3, 4]);
    expect(filterByPeriod(points, 'all', '2026-11-17').map((p) => p.v)).toEqual([1, 2, 3, 4]);
  });

  it('REQ-3.12: 期間内にデータがないとき空の配列を返す', () => {
    expect(filterByPeriod([{ date: '2025-01-01' }], '1m', '2026-11-17')).toEqual([]);
  });
});

describe('PERIOD_OPTIONS', () => {
  it('REQ-3.11: 「1 か月 / 3 か月 / 1 年 / 全期間」の順で選択肢を持つ', () => {
    expect(PERIOD_OPTIONS.map((o) => o.label)).toEqual(['1か月', '3か月', '1年', '全期間']);
    expect(PERIOD_OPTIONS.map((o) => o.value)).toEqual(['1m', '3m', '1y', 'all']);
  });
});
