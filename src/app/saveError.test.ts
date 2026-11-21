import { describe, expect, it } from 'vitest';
import { classifySaveError, describeSaveError, QUOTA_MESSAGE, SAVE_FAILED_MESSAGE } from './saveError';

const named = (name: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(name), { name, ...extra });

describe('classifySaveError', () => {
  it('REQ-1.19: 容量超過（QuotaExceededError）を quota と判定する', () => {
    expect(classifySaveError(named('QuotaExceededError'))).toBe('quota');
    expect(classifySaveError(new DOMException('full', 'QuotaExceededError'))).toBe('quota');
  });

  it('REQ-1.19: Firefox の容量超過（NS_ERROR_DOM_QUOTA_REACHED）を quota と判定する', () => {
    expect(classifySaveError(named('NS_ERROR_DOM_QUOTA_REACHED'))).toBe('quota');
  });

  it('REQ-1.19: Dexie がラップした容量超過（inner）を quota と判定する', () => {
    const wrapped = named('AbortError', { inner: named('QuotaExceededError') });
    expect(classifySaveError(wrapped)).toBe('quota');
  });

  it('REQ-1.19: cause に入っている容量超過を quota と判定する', () => {
    expect(classifySaveError(new Error('failed', { cause: named('QuotaExceededError') }))).toBe('quota');
  });

  it('REQ-1.19: 一括追加の失敗（failures）の中の容量超過を quota と判定する', () => {
    const bulk = named('BulkError', { failures: [named('ConstraintError'), named('QuotaExceededError')] });
    expect(classifySaveError(bulk)).toBe('quota');
  });

  it('REQ-1.19: 容量超過以外のエラーは unknown と判定する', () => {
    expect(classifySaveError(new Error('boom'))).toBe('unknown');
    expect(classifySaveError(named('ConstraintError'))).toBe('unknown');
    expect(classifySaveError(named('AbortError', { inner: named('ConstraintError') }))).toBe('unknown');
  });

  it('REQ-1.19: Error でない値でも例外を出さず unknown と判定する', () => {
    for (const value of ['text', 42, null, undefined, {}, []]) {
      expect(classifySaveError(value)).toBe('unknown');
    }
  });

  it('REQ-1.19: 循環した参照があっても止まらない', () => {
    const a = named('AbortError') as Error & { inner?: unknown };
    a.inner = a;
    expect(classifySaveError(a)).toBe('unknown');
    const b = named('AbortError');
    const c = named('AbortError', { inner: b });
    Object.assign(b, { cause: c });
    expect(classifySaveError(b)).toBe('unknown');
  });

  it('REQ-1.19: 深くネストした容量超過は、探索の上限を超えたら unknown と判定する（無限に辿らない）', () => {
    let deepest: unknown = named('QuotaExceededError');
    for (let i = 0; i < 50; i++) deepest = named('AbortError', { inner: deepest });
    expect(classifySaveError(deepest)).toBe('unknown');
  });
});

describe('describeSaveError', () => {
  it('REQ-1.19: 一般的なエラーでは、保存に失敗した旨を返す', () => {
    const d = describeSaveError(new Error('boom'));
    expect(d.kind).toBe('unknown');
    expect(d.message).toBe(SAVE_FAILED_MESSAGE);
    expect(d.message).toContain('保存できませんでした');
  });

  it('REQ-1.19: 容量超過では、保存に失敗した旨に加えて、バックアップを促す文言を返す', () => {
    const d = describeSaveError(named('QuotaExceededError'));
    expect(d.kind).toBe('quota');
    expect(d.message).toBe(QUOTA_MESSAGE);
    expect(d.message).toContain('保存できませんでした');
    expect(d.message).toContain('バックアップ');
  });

  it('REQ-1.19: 一般的なエラーの文言には、バックアップを促す文言を含めない', () => {
    expect(SAVE_FAILED_MESSAGE).not.toContain('バックアップ');
  });
});
