import type { ISODate } from './types';

export type Period = '1m' | '3m' | '1y' | 'all';

/** グラフ期間の選択肢（REQ-3.11）。表示順のとおり。 */
export const PERIOD_OPTIONS: ReadonlyArray<{ value: Period; label: string }> = [
  { value: '1m', label: '1か月' },
  { value: '3m', label: '3か月' },
  { value: '1y', label: '1年' },
  { value: 'all', label: '全期間' },
];

const MONTHS_BACK: Record<Exclude<Period, 'all'>, number> = { '1m': 1, '3m': 3, '1y': 12 };

function subtractMonths(date: ISODate, months: number): ISODate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const total = year * 12 + (month - 1) - months;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  // 前の月に同じ日がなければ月末にする（例: 3/31 の 1 か月前は 2/28 または 2/29）
  const daysInMonth = new Date(Date.UTC(newYear, newMonth, 0)).getUTCDate();
  const newDay = Math.min(day, daysInMonth);
  return [
    String(newYear).padStart(4, '0'),
    String(newMonth).padStart(2, '0'),
    String(newDay).padStart(2, '0'),
  ].join('-');
}

/** 期間の開始日（その日を含む）。全期間は下限がないので null。 */
export function periodStart(period: Period, today: ISODate): ISODate | null {
  if (period === 'all') return null;
  return subtractMonths(today, MONTHS_BACK[period]);
}

/** 開始日 <= date <= 当日（REQ-3.11）。 */
export function isInPeriod(date: ISODate, period: Period, today: ISODate): boolean {
  if (date > today) return false;
  const start = periodStart(period, today);
  return start === null || date >= start;
}

export function filterByPeriod<T extends { date: ISODate }>(
  items: readonly T[],
  period: Period,
  today: ISODate,
): T[] {
  return items.filter((item) => isInPeriod(item.date, period, today));
}
