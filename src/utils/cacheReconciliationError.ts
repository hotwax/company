export const CACHE_RECONCILIATION_ERROR_MESSAGE =
  "The server change was saved, but this view could not be refreshed. Refresh before retrying.";

/**
 * A server mutation completed, but its mandatory local-cache reconciliation did not.
 *
 * Keeping this stage explicit prevents a retry from duplicating a create or replaying a
 * date-effective association write. The domain and PK are diagnostics only; they never contain
 * credentials or response bodies.
 */
export class CacheReconciliationError extends Error {
  readonly mutationCommitted = true;

  constructor(
    readonly domain: string,
    readonly pk: Record<string, unknown>,
    cause?: unknown,
    readonly failedDomains: readonly string[] = [domain],
  ) {
    super(CACHE_RECONCILIATION_ERROR_MESSAGE, { cause });
    this.name = "CacheReconciliationError";
  }
}

export function isCacheReconciliationError(error: unknown): error is CacheReconciliationError {
  return error instanceof CacheReconciliationError ||
    Boolean(error &&
      typeof error === "object" &&
      (error as any).name === "CacheReconciliationError" &&
      (error as any).mutationCommitted === true,);
}
