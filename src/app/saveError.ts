/**
 * 保存の失敗（IndexedDB への書き込みの例外）を、利用者向けの文言にする（REQ-1.19）。
 * 入力の不備は各サービスが `{ ok: false, errors }` で返すので、ここで扱うのは予期しない例外だけ。
 */

export type SaveErrorKind = 'quota' | 'unknown';

export const SAVE_FAILED_MESSAGE = '保存できませんでした。もう一度お試しください。';
export const QUOTA_MESSAGE =
  '保存できませんでした。端末の保存容量が足りません。設定からバックアップを取り、不要なデータを整理してください。';

const QUOTA_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);
/** 辿るエラーの最大数。循環や、極端に深い入れ子で止まらなくなるのを防ぐ。 */
const MAX_VISITED = 20;

/** Dexie は元のエラーを inner に、標準の Error は cause に、一括操作は failures に持つ。 */
function children(error: object): unknown[] {
  const { inner, cause, failures } = error as { inner?: unknown; cause?: unknown; failures?: unknown };
  return [inner, cause, ...(Array.isArray(failures) ? failures : [])];
}

function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return (typeof name === 'string' && QUOTA_NAMES.has(name)) || (error instanceof DOMException && code === 22);
}

export function classifySaveError(error: unknown): SaveErrorKind {
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];
  while (queue.length > 0 && seen.size < MAX_VISITED) {
    const current = queue.shift();
    if (typeof current !== 'object' || current === null || seen.has(current)) continue;
    seen.add(current);
    if (isQuotaError(current)) return 'quota';
    queue.push(...children(current));
  }
  return 'unknown';
}

export function describeSaveError(error: unknown): { kind: SaveErrorKind; message: string } {
  const kind = classifySaveError(error);
  return { kind, message: kind === 'quota' ? QUOTA_MESSAGE : SAVE_FAILED_MESSAGE };
}
