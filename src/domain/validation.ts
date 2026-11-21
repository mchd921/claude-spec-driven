import { BODY_PARTS, type BodyPart, type ID, type ISODate, type TemplateItem } from './types';

export const MEMO_MAX_LENGTH = 500;
export const NAME_MAX_LENGTH = 50;
export const WEIGHT_MAX_KG = 999.9;
export const REPS_MAX = 999;
export const TARGET_SETS_MAX = 20;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

const ok = <T>(value: T): ValidationResult<T> => ({ ok: true, value });
const fail = <T>(errors: Record<string, string>): ValidationResult<T> => ({ ok: false, errors });

/** kg を 0.1kg 単位の整数に変換する。 */
export function kgToTenthKg(kg: number): number {
  return Math.round(kg * 10);
}

/** 0.1kg 単位の整数を kg に変換する。 */
export function tenthKgToKg(tenthKg: number): number {
  return tenthKg / 10;
}

/** 文字数（サロゲートペアを 1 文字として数える）。 */
function charLength(text: string): number {
  return Array.from(text).length;
}

// ---- セット（REQ-1.9, 1.11）-------------------------------------------------

export interface ValidSet {
  weightTenthKg: number;
  reps: number;
}

export function validateSet(
  weightKg: number | null | undefined,
  reps: number | null | undefined,
): ValidationResult<ValidSet> {
  const errors: Record<string, string> = {};
  let weightTenthKg = 0;

  if (weightKg == null || !Number.isFinite(weightKg)) {
    errors.weight = '重量を入力してください。';
  } else if (weightKg < 0 || weightKg > WEIGHT_MAX_KG) {
    errors.weight = `重量は 0〜${WEIGHT_MAX_KG}kg の範囲で入力してください。`;
  } else {
    weightTenthKg = kgToTenthKg(weightKg);
    if (Math.abs(weightKg * 10 - weightTenthKg) > 1e-6) {
      errors.weight = '重量は 0.1kg 単位で入力してください。';
    }
  }

  if (reps == null || !Number.isFinite(reps)) {
    errors.reps = '回数を入力してください。';
  } else if (!Number.isInteger(reps) || reps < 1 || reps > REPS_MAX) {
    errors.reps = `回数は 1〜${REPS_MAX} の整数で入力してください。`;
  }

  if (Object.keys(errors).length > 0 || reps == null) return fail(errors);
  return ok({ weightTenthKg, reps });
}

/** メモを 500 文字（サロゲートペアは 1 文字）以内に切り詰める（REQ-1.15）。 */
export function truncateMemo(memo: string): string {
  const chars = Array.from(memo);
  return chars.length <= MEMO_MAX_LENGTH ? memo : chars.slice(0, MEMO_MAX_LENGTH).join('');
}

// ---- 種目名（REQ-2.3, 2.4, 2.6）---------------------------------------------

/** 重複判定用のキー: 前後の空白を除き、NFKC 正規化して小文字にする。 */
export function createNameKey(name: string): string {
  return name.trim().normalize('NFKC').toLowerCase().trim();
}

export interface ValidExerciseName {
  name: string;
  nameKey: string;
}

export function validateExerciseName(
  name: string,
  existing: ReadonlyArray<{ id: ID; nameKey: string }>,
  selfId?: ID,
): ValidationResult<ValidExerciseName> {
  const trimmed = name.trim();
  const length = charLength(trimmed);
  if (length < 1 || length > NAME_MAX_LENGTH) {
    return fail({ name: `種目名は 1〜${NAME_MAX_LENGTH} 文字で入力してください。` });
  }
  const nameKey = createNameKey(trimmed);
  if (existing.some((e) => e.id !== selfId && e.nameKey === nameKey)) {
    return fail({ name: '同じ名前の種目が既にあります（重複しています）。' });
  }
  return ok({ name: trimmed, nameKey });
}

// ---- 部位（REQ-2.2, 2.5）-----------------------------------------------------

export function validateBodyPart(value: unknown): ValidationResult<BodyPart> {
  if ((BODY_PARTS as readonly unknown[]).includes(value)) return ok(value as BodyPart);
  return fail({ bodyPart: '部位を選択してください。' });
}

// ---- メニュー（REQ-4.2, 4.3, 4.4）-------------------------------------------

export interface ValidTemplate {
  name: string;
  items: TemplateItem[];
}

export function validateTemplate(
  name: string,
  items: readonly TemplateItem[],
): ValidationResult<ValidTemplate> {
  const errors: Record<string, string> = {};
  const trimmed = name.trim();
  const length = charLength(trimmed);

  if (length < 1 || length > NAME_MAX_LENGTH) {
    errors.name = `メニュー名は 1〜${NAME_MAX_LENGTH} 文字で入力してください。`;
  }
  if (items.length === 0) {
    errors.items = '種目を 1 つ以上追加してください。';
  }
  items.forEach((item, index) => {
    const t = item.targetSets;
    if (t !== null && (!Number.isInteger(t) || t < 1 || t > TARGET_SETS_MAX)) {
      errors[`items.${index}.targetSets`] = `目標セット数は 1〜${TARGET_SETS_MAX} の整数で入力してください。`;
    }
  });

  if (Object.keys(errors).length > 0) return fail(errors);
  return ok({ name: trimmed, items: items.map((i) => ({ ...i })) });
}

// ---- ワークアウトの日付（REQ-1.16, 1.17）------------------------------------

export function isRealDate(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** date は today 以前の実在する日付（'YYYY-MM-DD'）であること。 */
export function validateWorkoutDate(date: ISODate, today: ISODate): ValidationResult<ISODate> {
  if (!isRealDate(date)) return fail({ date: '日付を正しく入力してください。' });
  if (date > today) return fail({ date: '未来の日付は指定できません。' });
  return ok(date);
}
