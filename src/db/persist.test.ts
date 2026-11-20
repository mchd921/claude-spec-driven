import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from './persist';

function stubStorage(storage: unknown) {
  Object.defineProperty(navigator, 'storage', { value: storage, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'storage');
});

describe('requestPersistentStorage', () => {
  it('NFR-7: 永続化を要求し、許可されたら true を返す', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('NFR-7: 許可されなかったら false を返す', async () => {
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(false) });
    expect(await requestPersistentStorage()).toBe(false);
  });

  it('NFR-7: すでに永続化されているときは、再度要求せずに true を返す', async () => {
    const persist = vi.fn();
    stubStorage({ persisted: vi.fn().mockResolvedValue(true), persist });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('NFR-7: ブラウザが対応していないときは false を返す（エラーにしない）', async () => {
    expect(await requestPersistentStorage()).toBe(false);
    stubStorage({});
    expect(await requestPersistentStorage()).toBe(false);
  });

  it('NFR-7: 要求中にエラーが起きても false を返す（アプリの起動を止めない）', async () => {
    stubStorage({ persisted: vi.fn().mockRejectedValue(new Error('boom')), persist: vi.fn() });
    expect(await requestPersistentStorage()).toBe(false);
  });
});
