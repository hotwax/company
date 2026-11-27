import { api, useSolrSearch } from "@common";
import { computed, ref, watch, type Ref } from "vue";

interface IndexedOrder {
  orderId: string;
  orderName?: string;
  orderDate?: string;
  entryDate: string;
}

interface Arrival extends IndexedOrder {
  shopId: string;
  shopifyOrderId: string;
}

interface ArrivalMetrics {
  asOf: number;
  orders: Arrival[];
  latest?: Arrival;
}

const HOUR = 3_600_000;
const PAGE_SIZE = 100;

// Exchange orders can share the original Shopify ID. Exclude them using the same
// association direction as the connector's ShopifyShopPrimaryOrder view.
async function primaryOrders(docs: IndexedOrder[], shopId: string): Promise<Arrival[]> {
  const filter = "orderId:" + docs.map(doc => JSON.stringify(doc.orderId)).join(",");
  const response = await api({ url: "graphql", method: "post", data: {
    query: `query OrderArrivalMappings($orders: String!, $exchanges: String!, $first: Int!) {
      orders(query: $orders, first: $first) { edges { node { orderId shopifyOrder { shopId shopifyOrderId } } } }
      orderItemAssocs(query: $exchanges, first: $first) { edges { node { orderId } } pageInfo { hasNextPage } }
    }`,
    variables: { orders: filter, exchanges: filter + " orderItemAssocTypeId:EXCHANGE", first: PAGE_SIZE },
  } });
  const data = response.data?.data;
  if (response.data?.errors?.length || !data?.orders?.edges || !data?.orderItemAssocs?.edges) throw new Error("Order mappings unavailable");
  const exchanges = new Set(data.orderItemAssocs.edges.map(({ node }: { node: { orderId: string } }) => node.orderId));
  const candidates = docs.filter(doc => !exchanges.has(doc.orderId));
  if (data.orderItemAssocs.pageInfo.hasNextPage && candidates.length) return primaryOrders(candidates, shopId);
  const ids = new Map<string, string>();
  for (const { node } of data.orders.edges) {
    if (node.shopifyOrder?.shopId === shopId && node.shopifyOrder.shopifyOrderId) ids.set(node.orderId, node.shopifyOrder.shopifyOrderId);
  }
  return candidates.filter(doc => ids.has(doc.orderId)).map(doc => ({ ...doc, shopId, shopifyOrderId: ids.get(doc.orderId)! }));
}

export async function readOrderArrivals(shopId: string, storeId: string, asOf: number, current: () => boolean, previous?: ArrivalMetrics) {
  const since = asOf - HOUR;
  const cached = previous && previous.asOf >= since ? previous : undefined;
  const dates = new Map<string, Arrival>();
  let latest = cached?.latest;
  const { runSolrQuery } = useSolrSearch();
  // Page the fixed hour first. Only a quiet shop with no prior snapshot needs an older lookup.
  async function scan(lower: string, upper: string, latestOnly: boolean) {
    const filter = ["docType:ORDER", "orderTypeId:SALES_ORDER", "productStoreId:" + JSON.stringify(storeId),
      `entryDate:[${lower} TO ${upper}]`];
    for (let start = 0; current(); start += PAGE_SIZE) {
      const response = await runSolrQuery({ json: { query: "*:*", filter, params: {
        fl: "orderId,orderName,orderDate,entryDate", sort: "entryDate desc,orderId asc",
        start, rows: PAGE_SIZE, group: true, "group.field": "orderId", "group.limit": 1,
      } } });
      const groups = response.data?.grouped?.orderId?.groups;
      if (!Array.isArray(groups)) throw new Error("OMS import dates unavailable");
      if (!groups.length || !current()) return;
      const docs: IndexedOrder[] = groups.map(group => group.doclist.docs[0]);
      for (const order of await primaryOrders(docs, shopId)) {
        if (!latest || Date.parse(order.entryDate) > Date.parse(latest.entryDate)) latest = order;
        if (!latestOnly) dates.set(order.shopifyOrderId, order);
      }
      if (groups.length < PAGE_SIZE || (latestOnly && latest)) return;
    }
  }
  await scan(new Date(since).toISOString(), new Date(asOf).toISOString(), false);
  if (!latest && !cached) await scan("*", new Date(since - 1).toISOString(), true);
  return { orders: [...dates.values()], latest, asOf };
}

export function summarizeArrivals(snapshot: ArrivalMetrics, now: number) {
  const orders = snapshot.orders.filter(order => Date.parse(order.entryDate) >= now - HOUR);
  const delays = orders.map(row => Date.parse(row.entryDate) - Date.parse(row.orderDate || ""))
    .filter(Number.isFinite).sort((a, b) => a - b);
  const mid = Math.floor(delays.length / 2);
  const medianMs = delays.length ? (delays[mid] + delays[Math.floor((delays.length - 1) / 2)]) / 2 : undefined;
  return { count: orders.length, latest: snapshot.latest, medianMs };
}

export function useOrderArrivalMetrics(shop: () => string, store: () => string, active: Ref<boolean>, revision: () => unknown) {
  const snapshot = ref<ArrivalMetrics>();
  const failed = ref(false);
  const now = ref(Date.now());
  let refresh = async () => {};
  watch([shop, store, active], ([shopId, storeId, visible], _, onCleanup) => {
    snapshot.value = undefined;
    failed.value = false;
    refresh = async () => {};
    if (!visible || !shopId || !storeId) return;
    let current = true;
    let busy = false;
    let queued = false;
    refresh = async () => {
      if (busy) { queued = true; return; }
      queued = false;
      busy = true;
      now.value = Date.now();
      try {
        const result = await readOrderArrivals(shopId, storeId, now.value, () => current, snapshot.value);
        if (current) { snapshot.value = result; failed.value = false; }
      } catch {
        if (current) failed.value = true;
      } finally {
        busy = false;
        if (current && queued) void refresh();
      }
    };
    void refresh();
    const timer = window.setInterval(() => { now.value = Date.now(); }, 15_000);
    onCleanup(() => { current = false; window.clearInterval(timer); });
  }, { immediate: true, flush: "sync" });
  watch(revision, () => void refresh());
  const metrics = computed(() => snapshot.value && summarizeArrivals(snapshot.value, now.value));
  return { metrics, failed, now, refresh: () => refresh() };
}
