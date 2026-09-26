import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

/**
 * Renders only the rows near the viewport, with spacers standing in for the rest.
 *
 * The inventory event history can hold tens of thousands of rows, and building a DOM node per row
 * is what makes the page slow to open - not the query. This keeps the node count proportional to
 * the viewport instead of to the data.
 *
 * Row height is measured from the first rendered row rather than hardcoded, because the same table
 * renders as one line per row on desktop and as a stacked block on mobile. Until a row exists to
 * measure, `estimatedRowHeight` is used; a wrong estimate only costs a little over-rendering, since
 * `overscan` rows are drawn beyond each edge.
 */
export function useVirtualRows<T>(
  items: Ref<T[]>,
  options: { estimatedRowHeight?: number; overscan?: number; rowSelector?: string } = {},
) {
  const estimatedRowHeight = options.estimatedRowHeight ?? 56;
  const overscan = options.overscan ?? 8;
  const rowSelector = options.rowSelector ?? "[data-virtual-row]";

  const containerRef = ref<HTMLElement | null>(null);
  const scrollTop = ref(0);
  const viewportHeight = ref(0);
  const rowHeight = ref(estimatedRowHeight);

  const total = computed(() => items.value.length);

  const startIndex = computed(() =>
    Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - overscan));

  const renderCount = computed(() =>
    Math.ceil((viewportHeight.value || 600) / rowHeight.value) + overscan * 2);

  const endIndex = computed(() =>
    Math.min(total.value, startIndex.value + renderCount.value));

  /** The slice actually rendered. */
  const visibleItems = computed(() => items.value.slice(startIndex.value, endIndex.value));

  /** Stand-ins that keep the scrollbar the size it would be if every row were rendered. */
  const topSpacer = computed(() => startIndex.value * rowHeight.value);
  const bottomSpacer = computed(() =>
    Math.max(0, (total.value - endIndex.value) * rowHeight.value));

  function onScroll() {
    scrollTop.value = containerRef.value?.scrollTop ?? 0;
  }

  /** One row is enough: they share a grid template, so their heights agree. */
  function measureRowHeight() {
    const row = containerRef.value?.querySelector<HTMLElement>(rowSelector);
    const measured = row?.offsetHeight ?? 0;
    if (measured > 0 && Math.abs(measured - rowHeight.value) > 1) rowHeight.value = measured;
  }

  let resizeObserver: ResizeObserver | null = null;

  onMounted(() => {
    const container = containerRef.value;
    if (!container) return;
    viewportHeight.value = container.clientHeight;
    // Re-measure on resize: a width change can restack rows and change their height.
    resizeObserver = new ResizeObserver(() => {
      viewportHeight.value = container.clientHeight;
      measureRowHeight();
    });
    resizeObserver.observe(container);
    requestAnimationFrame(measureRowHeight);
  });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  // A filter change can leave the scroll position past the end of the shorter list.
  watch(total, (count) => {
    const container = containerRef.value;
    if (!container) return;
    const maxScroll = Math.max(0, count * rowHeight.value - (viewportHeight.value || 0));
    if (container.scrollTop > maxScroll) {
      container.scrollTop = maxScroll;
      scrollTop.value = maxScroll;
    }
    requestAnimationFrame(measureRowHeight);
  });

  function scrollToTop() {
    const container = containerRef.value;
    if (!container) return;
    container.scrollTop = 0;
    scrollTop.value = 0;
  }

  return {
    containerRef,
    visibleItems,
    topSpacer,
    bottomSpacer,
    startIndex,
    endIndex,
    onScroll,
    scrollToTop,
  };
}
