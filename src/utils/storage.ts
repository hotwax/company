import Dexie, { Table } from 'dexie';

const EXPIRATION_TIME = 2 * 60 * 60 * 1000; // 2 hour in milliseconds

/**
 * Interface for an individual error record.
 */
export interface ErrorRecord {
  id?: number;
  logContentId: string;
  numericId: string;
  title: string;
  handle: string;
  sku: string;
  error: string;
  createdAt: number;   // Timestamp for automatic invalidation
  raw: any;
}

/**
 * Dexie Database definition
 */
export class ShopifySyncDatabase extends Dexie {
  errorLogRecords!: Table<ErrorRecord>;

  constructor() {
    super('ShopifySyncDB');
    this.version(3).stores({
      errorLogRecords: '++id, logContentId, numericId, title, sku, handle, createdAt'
    });
  }
}

export const db = new ShopifySyncDatabase();

/**
 * Save error records with a timestamp.
 */
export const setErrorRecords = async (logContentId: string, records: any[]): Promise<void> => {
  try {
    const timestamp = Date.now();
    const formattedRecords: ErrorRecord[] = records.map(record => {
      const product = record.virtualProduct || {};
      return {
        logContentId,
        numericId: record.numericId || (product.id ? product.id.split('/').pop() : ''),
        title: record.title || product.title || '',
        handle: record.handle || product.handle || '',
        sku: record.sku || (product.variants?.[0]?.sku) || '',
        error: record.error || record._ERROR_MESSAGE_ || record.message || record.errorMessage || '',
        createdAt: timestamp,
        raw: record.raw || record
      };
    });

    await db.errorLogRecords.where({ logContentId }).delete();
    await db.errorLogRecords.bulkAdd(formattedRecords);
    
    // Also trigger a background cleanup for other old logs
    cleanupExpiredRecords();
  } catch (err) {
    console.error("Dexie: Failed to save error records", err);
  }
};

/**
 * Get error records and automatically invalidate if older than 1 hour.
 */
export const getErrorRecords = async (logContentId: string): Promise<any[]> => {
  try {
    const records = await db.errorLogRecords.where({ logContentId }).toArray();
    
    if (records.length > 0) {
      const isExpired = Date.now() - records[0].createdAt > EXPIRATION_TIME;
      if (isExpired) {
        await deleteErrorRecords(logContentId);
        return [];
      }
    }

    return records.map(r => ({
      ...r.raw,
      numericId: r.numericId,
      title: r.title,
      handle: r.handle,
      sku: r.sku,
      error: r.error
    }));
  } catch (err) {
    console.error("Dexie: Failed to get error records", err);
    return [];
  }
};

/**
 * Delete records for a specific log.
 */
export const deleteErrorRecords = async (logContentId: string): Promise<void> => {
  try {
    await db.errorLogRecords.where({ logContentId }).delete();
  } catch (err) {
    console.error("Dexie: Failed to delete records", err);
  }
};

/**
 * Background cleanup for all logs older than 1 hour.
 */
export const cleanupExpiredRecords = async (): Promise<void> => {
  try {
    const expirationLimit = Date.now() - EXPIRATION_TIME;
    await db.errorLogRecords.where('createdAt').below(expirationLimit).delete();
  } catch (err) {
    console.error("Dexie: Cleanup failed", err);
  }
};

/**
 * Clear all records manually
 */
export const clearStorage = async (): Promise<void> => {
  await db.errorLogRecords.clear();
};
