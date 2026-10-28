// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- Separate public HTTP cache; not the tenant app database or its sync worker.
import Dexie, { type Table } from "dexie";

interface CacheRow { key: string; value: any; expiresAt: number; savedAt: number }
// Public HTTP metadata, not tenant entities: it survives logout and never enters the OMS sync worker.
const db = new Dexie("CompanyAppVersionCache");
db.version(1).stores({ responses: "key, expiresAt, savedAt" });
const table: Table<CacheRow, string> = db.table("responses");
export const appVersionCache = {
  async get(key: string, allowExpired = false): Promise<any | undefined> {
    try {
      const row = await table.get(key);
      return row && (allowExpired || row.expiresAt > Date.now()) ? row.value : undefined;
    } catch { return undefined; }
  },
  async matching(prefix: string): Promise<any[]> {
    try { return (await table.where("key").startsWith(prefix).toArray()).map(row => row.value); }
    catch { return []; }
  },
  async put(key: string, value: any, ttl: number) {
    try {
      const now = Date.now();
      await table.put({ key, value, expiresAt: now + ttl, savedAt: now });
      await table.where("savedAt").below(now - 30 * 86400000).delete();
    } catch { /* Cache restrictions must not block live checks. */ }
  }
};
