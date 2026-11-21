import type { ISODate } from './types';

/** 端末のローカルタイムゾーンでの日付（YYYY-MM-DD）。UTC に変換しない（設計書 4.6 節）。 */
export function localDateString(date: Date): ISODate {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
