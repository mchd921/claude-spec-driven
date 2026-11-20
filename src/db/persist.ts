/**
 * ブラウザによる IndexedDB の自動削除を受けにくくするため、永続ストレージを要求する（NFR-7）。
 * 非対応・拒否・エラーのいずれの場合も false を返し、アプリの起動を妨げない。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage?.persist) return false;
    if (await storage.persisted?.()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}
