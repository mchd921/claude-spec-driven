import { tenthKgToKg } from '../domain/validation';

/** 表示用の重量（例: 60.0kg）。 */
export function formatKg(tenthKg: number): string {
  return `${tenthKgToKg(tenthKg).toFixed(1)}kg`;
}

/** 入力欄の初期値用の重量（例: 60, 62.5）。 */
export function weightInputText(tenthKg: number): string {
  return String(tenthKgToKg(tenthKg));
}

/** 入力欄の文字列を数値にする。空欄は null、数値でない文字列は NaN（どちらも検証でエラーになる）。 */
export function parseNumberInput(text: string): number | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : Number(trimmed);
}
