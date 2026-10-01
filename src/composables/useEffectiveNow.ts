import {
  type MaybeRefOrGetter,
  type Ref,
  getCurrentScope,
  onScopeDispose,
  ref,
  toValue,
  watch,
} from "vue";
import { toMillis } from "@/utils/cacheProjection";

const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * A clock that invalidates date-effective computed projections at their next actual boundary.
 *
 * It does not poll. Cache-array changes reschedule the one timer, and the timer fires exactly when
 * the nearest `fromDate` becomes active or `thruDate` becomes inactive.
 */
export function useEffectiveNow(rows: MaybeRefOrGetter<Array<Record<string, unknown>>>,): Ref<number> {
  const now = ref(Date.now());
  let timer: ReturnType<typeof setTimeout> | null = null;

  const boundaries = () => toValue(rows).flatMap((cachedRow) => {
    const row = (
      cachedRow.raw && typeof cachedRow.raw === "object"
        ? cachedRow.raw
        : cachedRow
    ) as Record<string, unknown>;

    return [toMillis(row.fromDate), toMillis(row.thruDate)]
      .filter((boundary): boundary is number => boundary !== undefined);
  });

  const schedule = () => {
    if(timer) {clearTimeout(timer);}
    const current = Date.now();
    now.value = current;
    const nextBoundary = boundaries()
      .filter((boundary) => boundary > current)
      .reduce((next, boundary) => Math.min(next, boundary), Number.POSITIVE_INFINITY);

    if(Number.isFinite(nextBoundary)) {
      timer = setTimeout(
        schedule,
        Math.max(1, Math.min(nextBoundary - current, MAX_TIMER_DELAY)),
      );
    } else {
      timer = null;
    }
  };

  const stop = watch(
    () => boundaries().join("|"),
    schedule,
    { immediate: true },
  );

  if(getCurrentScope()) {
    onScopeDispose(() => {
      stop();
      if(timer) {clearTimeout(timer);}
    });
  }

  return now;
}
