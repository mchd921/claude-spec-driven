import type { ValidationResult } from '../domain/validation';

export const success = <T>(value: T): ValidationResult<T> => ({ ok: true, value });

export const failure = <T>(errors: Record<string, string>): ValidationResult<T> => ({
  ok: false,
  errors,
});

/** 対象のデータが存在しないときのエラー。 */
export const notFound = <T>(label: string): ValidationResult<T> =>
  failure({ id: `${label}が見つかりません。` });
