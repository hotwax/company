import { computed, onUnmounted, ref, type Ref } from "vue";
import type { Subscription } from "dexie";
import type { CachedEntity, LiveQueryOptions } from "@/utils/appCacheDb";
import type { CachedRow } from "@/utils/cacheProjection";
import { bootstrapState } from "@/services/appCacheBootstrap";

/**
 * Read a cached table as live, reactive rows — the read seam for every list page.
 *
 * The worker writes the cache; this subscribes to Dexie's `liveQuery`, so a view re-renders on
 * every write without any fetch of its own. No store, no `onMounted` fetch, no loading race.
 *
 * `hydrated` is the piece pages must respect: the cache is durable, so on any visit AFTER the
 * first it emits immediately with real data and no skeleton is seen. On a genuinely cold cache the
 * first emit is empty while the app-load bootstrap is still running — without this flag pages
 * would flash "no records found". Distinguish:
 *   - `!hydrated`            → skeleton (ion-skeleton-text, the app's existing convention)
 *   - `hydrated && !length`  → genuine empty state
 *
 * NOTE on Vue features: `defineAsyncComponent`'s loading/error states solve *component code*
 * loading (already handled by the router's lazy imports), and `Suspense` is built for an
 * `async setup()` that resolves once — a poor fit for a stream that emits repeatedly. A boolean
 * is the right tool here.
 */
/**
 * Re-exported from the cache layer so views narrow a table with one vocabulary. `scope` + `equals` +
 * `dateField` resolve through a compound index when one is declared; `filter` and `limit` handle the
 * rest inside the same live query.
 */
export type CachedListOptions = LiveQueryOptions;

export interface CachedList<T = Record<string, any>> {
  /** The projected/normalized cached rows. */
  rows: Ref<CachedRow[]>;
  /** The untouched server objects — what most existing templates already expect. */
  records: Ref<T[]>;
  /** True once the cache holds trustworthy data (see the note in the implementation). */
  hydrated: Ref<boolean>;
}


/**
 * "The table has data but my filtered view is empty" — report it instead of rendering blank.
 *
 * This class of bug has appeared repeatedly and is invisible: the scope FIELD is right and
 * indexed, but the VALUE comes from the wrong place, so Dexie legitimately matches nothing and the
 * page just looks empty. Real example: shop locations are keyed by `shopId` ("10000") while a
 * caller passed `shopifyShopId` ("6973849727").
 *
 * Only fires when the scope matched nothing AND the table is populated, so a genuinely empty table
 * (or a cold cache) stays silent. The distinct values are printed because seeing them next to the
 * value asked for usually makes the mismatch obvious.
 */
const scopeMissWarned = new Set<string>();

async function warnOnScopeMiss(entity: CachedEntity, options: CachedListOptions): Promise<void> {
  const scope = options.scope;
  if (!scope) return;
  const signature = `${entity.table}:${scope.field}:${String(scope.value)}`;
  if (scopeMissWarned.has(signature)) return;
  try {
    const all = await entity.all();
    if (all.length === 0) return; // cold cache or genuinely empty — not a mismatch
    scopeMissWarned.add(signature);
    const available = [...new Set(all.map((row: any) => row?.[scope.field]))].slice(0, 8);
    console.warn(
      `[cache] ${entity.table}: scope ${scope.field}=${JSON.stringify(scope.value)} matched 0 of ` +
      `${all.length} cached rows. Values present: ${JSON.stringify(available)}` +
      `${available.length === 8 ? " …" : ""}. The caller is probably passing the wrong id.`,
    );
  } catch {
    // diagnostics must never break a read
  }
}

export function useCachedList<T = Record<string, any>>(
  entity: CachedEntity,
  options: CachedListOptions = {},
): CachedList<T> {
  const rows = ref<CachedRow[]>([]) as Ref<CachedRow[]>;
  const records = ref<T[]>([]) as Ref<T[]>;
  const emitted = ref(false);

  /**
   * Ready to be trusted — NOT merely "the query fired once".
   *
   * On a cold cache (the first page after login) Dexie emits an empty array immediately, so a flag
   * set purely on first emit flips to true with zero rows and the page renders its genuine empty
   * state — "no records found" — while the seed sync is still running. That is the flash, and the
   * reason a reload appeared to be needed: the reload simply happened after the sync had landed.
   *
   * Holding `hydrated` false while the bootstrap is running AND we have nothing keeps the skeleton
   * up until real data arrives. Once the seed finishes, an empty table is reported honestly.
   */
  const hydrated = computed(() => emitted.value && (rows.value.length > 0 || !bootstrapState.running));

  // Subscribe immediately (not in onMounted) so a warm cache paints on the very first render.
  const subscription: Subscription = entity.live(options).subscribe({
    next: (next) => {
      rows.value = next;
      records.value = next.map((row) => row.raw as T);
      emitted.value = true;
      if (next.length === 0) void warnOnScopeMiss(entity, options);
    },
    error: (err) => {
      // Don't strand the page on a skeleton — but do say something. A failing live query is always a
      // cache-layer fault (a `dateField` that is not indexed, a `where('[a+b]')` against a database
      // without that index, a closed connection), and swallowing it renders as a clean "no records
      // found" with an empty console, which is indistinguishable from an empty table.
      console.error(`[cache] live query failed for "${entity.table}" — rendering as empty:`, err);
      emitted.value = true;
    },
  });

  onUnmounted(() => subscription.unsubscribe());

  return { rows, records, hydrated };
}


/**
 * A single cached record by id — the generic replacement for store getters like
 * `shopifyStore.getShopById(id)`. Reactive: re-emits if the worker updates that record.
 *
 * Lives here rather than in a domain file because it is harness-level plumbing; domain files wrap
 * it with their own key field and types.
 */
export function useCachedRecord<T = Record<string, any>>(
  entity: CachedEntity,
  keyField: string,
  id: string | undefined,
) {
  const { records, hydrated } = useCachedList<any>(entity);
  return {
    record: computed<T | undefined>(() =>
      id ? (records.value.find((row) => String(row?.[keyField]) === String(id)) as T | undefined) : undefined,
    ),
    hydrated,
  };
}

/** Sort helper shared by the lookup domains, which all render as description-ordered pickers. */
export function byDescription(a: any, b: any): number {
  return String(a?.description ?? "").localeCompare(String(b?.description ?? ""));
}
