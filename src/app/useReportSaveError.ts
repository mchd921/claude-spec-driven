import { useToast } from '@astryxdesign/core/Toast';
import { useCallback } from 'react';
import { describeSaveError } from './saveError';

/**
 * サービスが投げた例外を、エラー Toast で通知する関数を返す（REQ-1.19）。
 * エラー Toast は閉じるまで残る。連続して失敗しても 1 件にまとめる。
 */
export function useReportSaveError(): (error: unknown) => void {
  const toast = useToast();
  return useCallback(
    (error: unknown) => {
      const { kind, message } = describeSaveError(error);
      toast({ body: message, type: 'error', uniqueID: `save-error-${kind}` });
    },
    [toast],
  );
}
