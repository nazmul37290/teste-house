import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertSafeKey, type StorageDriver } from './storage-driver';

/** Files under UPLOAD_DIR (a persistent volume at /data/uploads in production). */
export function createLocalStorage(rootDir: string, publicBaseUrl: string): StorageDriver {
  const root = path.resolve(rootDir);
  const resolve = (key: string) => {
    assertSafeKey(key);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep))
      throw new Error(`Storage key escapes the upload dir: ${key}`);
    return full;
  };
  return {
    async put(key, body) {
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      // wx: never overwrite (keys contain a random UUID, so a clash means a bug).
      await writeFile(full, body, { flag: 'wx' });
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
    url(key) {
      assertSafeKey(key);
      return `${publicBaseUrl.replace(/\/+$/, '')}/${key}`;
    },
  };
}
