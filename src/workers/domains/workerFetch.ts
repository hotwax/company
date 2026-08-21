import workerRemoteApi from "@common/core/workerRemoteApi";
import type { SyncContext } from "../syncRegistry";

/**
 * The worker's read transport. A worker realm can't reach `api()` (its axios instance and the
 * in-memory token live on the main thread), so domains fetch through `workerRemoteApi` with the
 * base URL + bearer the harness keeps current.
 *
 * Note the response shape difference from the main thread: `workerRemoteApi` returns the parsed
 * body directly, so a collection is `resp.<key>` — not `resp.data.<key>` as with axios.
 */
/**
 * Serialize query params the way Moqui expects, expanding arrays into REPEATED keys:
 *   { id: ["A", "B"], id_op: "in" }  →  id=A&id=B&id_op=in
 *
 * ⚠️ This exists because `workerRemoteApi` builds its query with `new URLSearchParams(params)`,
 * which stringifies an array by COMMA-JOINING it — `id=A%2CB`. Moqui then reads that as one literal
 * value and matches nothing: the request 200s with an empty list, so the failure is completely
 * silent. That is what kept the system-message poll returning zero rows even after its scope was
 * fixed (verified live 2026-07-27: comma form → `systemMessagesCount: 0`, repeated form → rows).
 *
 * Axios (used on the main thread) expands arrays by default, which is why the same query works from
 * a store and fails from the worker. Fixed here rather than in `@common` because that package is
 * shared with the other apps — see the note handed back with this change.
 */
function toQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry === undefined || entry === null) continue;
        search.append(key, String(entry));
      }
    } else {
      search.append(key, String(value));
    }
  }
  return search.toString();
}

export async function workerGet(
  ctx: SyncContext,
  url: string,
  params: Record<string, unknown>,
): Promise<any> {
  try {
    // The query is baked into the URL so array params survive; `params` is deliberately omitted so
    // `workerRemoteApi` does not re-serialize them.
    const queryString = toQueryString(params ?? {});
    return (await workerRemoteApi({
      baseURL: ctx.maargUrl,
      url: queryString ? `${url}?${queryString}` : url,
      method: "GET",
      headers: { Authorization: `Bearer ${ctx.token}` },
    })) as any;
  } catch (err: any) {
    // Some endpoints answer 200 with a ZERO-BYTE body when the set is empty (verified:
    // `oms/facilityGroups/types` on an instance with no group types). `workerRemoteApi` calls
    // `.json()` unconditionally, so that surfaces as a JSON SyntaxError rather than an empty
    // result. Treat ONLY that case as "no records"; anything else is a real failure and rethrows.
    if (isEmptyBodyError(err)) return null;
    throw err;
  }
}

/**
 * POST from the worker — for feeds whose query lives in a request BODY rather than the query string.
 *
 * `oms/dataDocumentView` is the only one so far: its filters go in `customParametersMap`, which is
 * also where `orderByField` must go. Passing `orderByField` at the top level is silently ignored and
 * the document comes back oldest-first (verified live: a top-level `-initDate` returned M173627 from
 * June, the same request with it inside `customParametersMap` returned M228405 from July).
 */
export async function workerPost(
  ctx: SyncContext,
  url: string,
  data: Record<string, unknown>,
): Promise<any> {
  try {
    return (await workerRemoteApi({
      baseURL: ctx.maargUrl,
      url,
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.token}` },
      data,
    })) as any;
  } catch (err: any) {
    if (isEmptyBodyError(err)) return null;
    throw err;
  }
}

/**
 * Is this parse failure a genuinely EMPTY body, as opposed to a body that was not JSON at all?
 *
 * The distinction is load-bearing, because "no records" flows straight into a snapshot that prunes
 * everything the fetch did not return. The previous test — `err instanceof SyntaxError ||
 * /JSON|Unexpected end of/i.test(message)` — matched every `JSON.parse` failure there is, since V8
 * puts the word "JSON" in all of them. Verified against real engine errors:
 *
 *   ""                                   -> "Unexpected end of JSON input"                  EMPTY
 *   "<html>…502 Bad Gateway…"            -> "Unexpected token '<' … is not valid JSON"      NOT empty
 *   '{"a":1'                             -> "Expected ',' or '}' … at position 6"           NOT empty
 *   "Service Unavailable"                -> "Unexpected token 'S' … is not valid JSON"      NOT empty
 *
 * So a gateway error page, a truncated response, or a plain-text error all used to be reported as an
 * empty collection — which then pruned the whole table. Only the empty-input family counts now;
 * everything else throws, surfaces as a `sync-error`, leaves the domain unmarked, and is retried.
 */
function isEmptyBodyError(err: any): boolean {
  if (!(err instanceof SyntaxError)) return false;
  return /unexpected end of (json )?input/i.test(String(err?.message ?? ""));
}

/**
 * Pull the record array out of a response. These endpoints use THREE different envelope
 * conventions (all verified live 2026-07-26), so the collection key is per-endpoint config:
 *   - bare array          → `admin/productStores`, `oms/facilities`, `oms/groupFacilities`,
 *                            `admin/userPermissions`, `admin/integrationTypeMappings`, …
 *   - `{ <name>List }`    → `admin/serviceJobs` (`serviceJobList`),
 *                            `oms/systemMessageRemotes` (`systemMessageRemoteList`)
 *   - `{ <name>s }`       → `admin/dataManager/details` (`dataManagerLogs`),
 *                            `admin/systemMessages` (`systemMessages`)
 * Pass `collectionKey: null` (or omit) for the bare-array form.
 */
export function unwrapCollection(resp: any, collectionKey?: string | null): any[] {
  if (Array.isArray(resp)) return resp;
  if (collectionKey && Array.isArray(resp?.[collectionKey])) return resp[collectionKey];
  if (collectionKey) return [];
  // No key given and not an array: fall back to the first array-valued property, if any.
  const firstArray = resp && typeof resp === "object"
    ? Object.values(resp).find((value) => Array.isArray(value))
    : undefined;
  return (firstArray as any[]) ?? [];
}

/**
 * Fetch a COMPLETE set by paging until exhausted — the class-B/C loader.
 *
 * No record cap: reference sets are small and this runs once per app load, so pulling everything
 * is cheaper than reasoning about a truncated cache. Two guards keep a misbehaving endpoint from
 * looping forever, and both report rather than truncate silently:
 *   - a page shorter than `batchSize` (or empty) ends the walk normally;
 *   - a page that contributes **no new keys** means the server ignored `pageIndex` — stop;
 *   - `maxPages` is a last-resort backstop; hitting it warns loudly.
 */
export async function pageAll(options: {
  ctx: SyncContext;
  url: string;
  collectionKey?: string | null;
  params?: Record<string, unknown>;
  batchSize?: number;
  maxPages?: number;
  /** Identity for the no-progress guard. Defaults to JSON of the record. */
  keyOf?: (record: any) => string | undefined;
  label?: string;
}): Promise<any[]> {
  const {
    ctx, url, collectionKey, params = {},
    batchSize = 250, maxPages = 40, keyOf, label = url,
  } = options;

  const collected: any[] = [];
  const seen = new Set<string>();
  const identify = keyOf ?? ((record: any) => JSON.stringify(record));

  for (let pageIndex = 0; ; pageIndex++) {
    if (pageIndex >= maxPages) {
      console.warn(
        `[sync] ${label}: stopped at the ${maxPages}-page backstop after ${collected.length} records — the set may be TRUNCATED.`,
      );
      break;
    }

    const resp = await workerGet(ctx, url, { ...params, pageSize: batchSize, pageIndex });
    const page = unwrapCollection(resp, collectionKey);
    if (!page.length) break;

    let added = 0;
    for (const record of page) {
      const key = identify(record);
      if (key === undefined || seen.has(key)) continue;
      seen.add(key);
      collected.push(record);
      added++;
    }

    // Server ignored pageIndex (same page returned again) — stop instead of looping.
    if (added === 0) {
      console.warn(
        `[sync] ${label}: page ${pageIndex} returned no new records — endpoint appears to ignore pageIndex; stopping with ${collected.length}.`,
      );
      break;
    }
    if (page.length < batchSize) break; // last page
  }

  return collected;
}

/**
 * Page a newest-first list endpoint until `total` records are collected, a short page arrives,
 * or `stopAt` says the page has crossed into records we already hold.
 */
export async function pageNewestFirst(options: {
  ctx: SyncContext;
  url: string;
  collectionKey?: string | null;
  params: Record<string, unknown>;
  total: number;
  batchSize: number;
  /** Narrow a page to the records worth keeping; returning fewer than given stops paging. */
  keep?: (page: any[]) => any[];
}): Promise<any[]> {
  const { ctx, url, collectionKey, params, total, batchSize, keep } = options;
  const collected: any[] = [];
  for (let pageIndex = 0; collected.length < total; pageIndex++) {
    const resp = await workerGet(ctx, url, { ...params, pageSize: batchSize, pageIndex });
    const page: any[] = unwrapCollection(resp, collectionKey);
    if (!page.length) break;
    if (keep) {
      const fresh = keep(page);
      collected.push(...fresh);
      if (fresh.length < page.length) break; // crossed into already-cached records
    } else {
      collected.push(...page);
    }
    if (page.length < batchSize) break; // last page
  }
  return collected.slice(0, total);
}
