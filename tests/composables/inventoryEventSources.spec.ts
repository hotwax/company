import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { hasError: (resp: any) => Boolean(resp?.data?.errors), showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string, params: Record<string, unknown> = {}) => Object.entries(params)
    .reduce((text, [name, param]) => text.replace(`{${name}}`, String(param)), value),
  useProducts: () => ({ products: { value: new Map() }, resolve: vi.fn(), reset: vi.fn() }),
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
  bootstrapState: { running: false },
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: () => ({ rows: { value: [] }, records: { value: [] }, hydrated: { value: true } }),
  useCachedRecord: () => ({ record: { value: undefined }, hydrated: { value: true } }),
  byDescription: () => 0,
}));

import { clearSessionScopedState } from "@/composables/sessionScope";
import { useInventoryEventSources } from "@/composables/useShopify";

/** A cycle count resolves through one call to `varianceDecisions`, so it is the cheapest probe. */
const countLookup = (eventReferenceId = "PI_1") => ({
  eventTypeId: "CYCLE_COUNT",
  eventReferenceId,
});

const decisionRow = (workEffortName: string) => ({
  data: [{ workEffortId: "WE_1", workEffortName, decidedByUserLoginId: "mfadmin" }],
});

describe("useInventoryEventSources — asking once, retrying only when it helps", () => {
  beforeEach(() => {
    harness.api.mockReset();
    clearSessionScopedState();
  });

  it("resolves a source once and does not ask again on a later pass", async () => {
    harness.api.mockResolvedValue(decisionRow("Weekly count"));
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    await resolve([countLookup()]);
    const calls = harness.api.mock.calls.length;
    await resolve([countLookup()]);

    expect(sources.value.get(sourceKeyOf("CYCLE_COUNT", "PI_1"))?.label).toContain("Weekly count");
    expect(harness.api.mock.calls.length).toBe(calls);
  });

  /**
   * The retry storm: the caller re-fires on every ten-second cache tick, and an unconditional
   * un-mark on failure turned an endpoint this OMS does not expose into one request per tick forever.
   */
  it("stops retrying a lookup that keeps failing, and says so on the row", async () => {
    harness.api.mockRejectedValue(new Error("404"));
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    for(let tick = 0; tick < 8; tick += 1) {
      await resolve([countLookup()]);
    }

    // Three attempts, then the page stops asking — not one per tick for the life of the session.
    expect(harness.api.mock.calls.length).toBe(3);
    expect(harness.api.mock.calls.every(([args]: any[]) => String(args?.url).includes("varianceDecisions"))).toBe(true);
    expect(sources.value.get(sourceKeyOf("CYCLE_COUNT", "PI_1"))?.unresolved)
      .toContain("no longer being retried");
  });

  it("retries a transient failure rather than marking the row permanently unresolvable", async () => {
    harness.api
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValue(decisionRow("Weekly count"));
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    await resolve([countLookup()]);
    await resolve([countLookup()]);

    expect(sources.value.get(sourceKeyOf("CYCLE_COUNT", "PI_1"))?.label).toContain("Weekly count");
  });

  it("does not re-queue keys a concurrent pass is already resolving", async () => {
    let release: (value: unknown) => void = () => {};
    harness.api.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const { resolve } = useInventoryEventSources();

    const first = resolve([countLookup()]);
    // A scroll or a cache tick lands while the first pass is still awaiting.
    await resolve([countLookup()]);
    release(decisionRow("Weekly count"));
    await first;

    // One decision lookup, not two. (The operator-name call is a separate endpoint.)
    const decisionCalls = harness.api.mock.calls
      .filter(([args]: any[]) => String(args?.url).includes("varianceDecisions"));
    expect(decisionCalls.length).toBe(1);
  });

  it("resolves independent lookups concurrently instead of one round trip at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    harness.api.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;

      return decisionRow("Weekly count");
    });
    const { resolve } = useInventoryEventSources();

    await resolve(Array.from({ length: 4 }, (_, index) => countLookup(`PI_${index}`)));

    expect(peak).toBeGreaterThan(1);
  });
});

/**
 * The movement families (receipt / transfer receipt / return restock / POS issuance) are the ones the
 * REST catalog could not reach from what the ledger carries. They are answered in bulk through the OMS
 * GraphQL movement root, so what is worth testing is the batching, the fallback when the OMS predates
 * that root, and that a row is never left silently blank.
 */
const receiptLookup = (eventReferenceId: string, eventTypeId = "RECEIPT") => ({
  eventTypeId,
  eventReferenceId,
});

/**
 * The GraphQL envelope: 200 with an `errors` array, which the transport-level check cannot see.
 * The root is `shipmentReceipts` / `itemIssuances` -- both 1:1 on their PK -- and NOT the movement
 * ledger, whose receiptId is a denormalised stamp that can carry two unrelated movements per id.
 */
const movementResponse = (nodes: any[], hasNextPage = false, root = "shipmentReceipts") => ({
  data: { data: { [root]: { edges: nodes.map((node) => ({ node })), pageInfo: { hasNextPage } } }, errors: [] },
});

/** Step two of the lookup: the orders those movement rows point at, named once and cached. */
const orderResponse = (orders: any[]) => ({
  data: { data: { orders: { edges: orders.map((node) => ({ node })) } }, errors: [] },
});

const graphqlCalls = () => harness.api.mock.calls.filter(([args]: any[]) => String(args?.url) === "graphql");
const movementCalls = () => graphqlCalls().filter(([args]: any[]) => !String(args.data.query).includes("orders("));
const orderCalls = () => graphqlCalls().filter(([args]: any[]) => String(args.data.query).includes("orders("));

/**
 * Routes each call to the right shape. The resolver asks for the movements first, then for whichever
 * orders it has not already named, so a flat mockResolvedValue would answer the wrong question.
 */
const respondWith = (movements: any, orders: any[] = []) => harness.api.mockImplementation(async (args: any) => {
  if(String(args?.url) !== "graphql") {return { data: [] };}

  return String(args.data.query).includes("orders(") ? orderResponse(orders) : movements;
});

describe("useInventoryEventSources — the document behind a movement", () => {
  beforeEach(() => {
    harness.api.mockReset();
    clearSessionScopedState();
  });

  it("names the order behind a whole page of receipts in ONE request", async () => {
    respondWith(movementResponse([
      { receiptId: "R1", orderId: "10779" },
      { receiptId: "R2", orderId: "10780" },
      { receiptId: "R3", orderId: null },
    ]), [
      { orderId: "10779", orderName: "WeeklyASN_5", orderTypeId: "PURCHASE_ORDER", statusId: "ORDER_APPROVED" },
      { orderId: "10780", orderName: "TO-42", orderTypeId: "TRANSFER_ORDER", statusId: "ORDER_APPROVED" },
    ]);
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    await resolve(["R1", "R2", "R3"].map((reference) => receiptLookup(reference)));

    // One call for the whole window, plus one that names every order it pointed at.
    expect(movementCalls().length).toBe(1);
    expect(orderCalls().length).toBe(1);
    expect(movementCalls()[0][0].data.query).toContain("shipmentReceipts(");
    expect(movementCalls()[0][0].data.variables.q).toBe("receiptId:R1,R2,R3");
    // `first` is the id count exactly: these roots are 1:1 on their PK, and the governor charges per row.
    expect(movementCalls()[0][0].data.variables.first).toBe(3);
    expect(orderCalls()[0][0].data.variables.q).toBe("orderId:10779,10780");
    expect(sources.value.get(sourceKeyOf("RECEIPT", "R1"))?.label).toBe("Purchase order WeeklyASN_5");
    expect(sources.value.get(sourceKeyOf("RECEIPT", "R2"))?.label).toBe("Transfer order TO-42");
    // A receipt with no order is a real answer, not a blank row.
    expect(sources.value.get(sourceKeyOf("RECEIPT", "R3"))?.label).toBe("");
    expect(sources.value.get(sourceKeyOf("RECEIPT", "R3"))?.unresolved).toContain("no order");
  });

  /**
   * Movements share documents heavily -- on a real transfer, 91 receipts resolved to ONE order -- and
   * the governor charges per row, so re-naming a known order on every chunk is the difference between
   * a page that scrolls and one that throttles.
   */
  it("names each order once and reuses it for later chunks", async () => {
    respondWith(movementResponse([{ receiptId: "R1", orderId: "TO-1" }]),
      [{ orderId: "TO-1", orderName: "MULTISHOP-85", orderTypeId: "TRANSFER_ORDER" }]);
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    await resolve([receiptLookup("R1")]);
    expect(orderCalls().length).toBe(1);

    // A different receipt pointing at the SAME order asks for the movement, never for the order again.
    respondWith(movementResponse([{ receiptId: "R2", orderId: "TO-1" }]),
      [{ orderId: "TO-1", orderName: "MULTISHOP-85", orderTypeId: "TRANSFER_ORDER" }]);
    await resolve([receiptLookup("R2")]);

    expect(orderCalls().length).toBe(1);
    expect(sources.value.get(sourceKeyOf("RECEIPT", "R2"))?.label).toBe("Transfer order MULTISHOP-85");
  });

  it("names the return behind a restock receipt, which belongs to no order", async () => {
    respondWith(movementResponse([
      { receiptId: "R1", orderId: null, returnId: "M101225" },
      { receiptId: "R2", orderId: null, returnId: null },
    ]));
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    await resolve([receiptLookup("R1", "RETURN_RESTOCK"), receiptLookup("R2", "RETURN_RESTOCK")]);

    expect(sources.value.get(sourceKeyOf("RETURN_RESTOCK", "R1"))?.label).toBe("Return M101225");
    // Neither an order nor a return: "carries no order" is the truth only here.
    expect(sources.value.get(sourceKeyOf("RETURN_RESTOCK", "R2"))?.unresolved).toContain("no order");
  });

  it("asks separately per family, because each filters on its own key", async () => {
    respondWith(movementResponse([]));
    const { resolve } = useInventoryEventSources();

    await resolve([receiptLookup("R1"), receiptLookup("I1", "POS_ISSUANCE")]);

    const queries = movementCalls().map(([args]: any[]) => args.data.variables.q).sort();
    expect(queries).toEqual(["itemIssuanceId:I1", "receiptId:R1"]);
    const roots = movementCalls().map(([args]: any[]) => args.data.query.match(/(shipmentReceipts|itemIssuances)\(/)[1]).sort();
    expect(roots).toEqual(["itemIssuances", "shipmentReceipts"]);
  });

  it("stops asking an OMS whose schema has no movement root, after exactly one request", async () => {
    harness.api.mockResolvedValue({
      data: { data: null, errors: [{ message: "Validation error (FieldUndefined@[shipmentReceipts]) : Field 'shipmentReceipts' in type 'Query' is undefined" }] },
    });
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    await resolve([receiptLookup("R1")]);
    // A later pass, and a different reference, must not re-ask: the remote schema is fixed at startup.
    await resolve([receiptLookup("R2"), receiptLookup("I1", "POS_ISSUANCE")]);

    expect(graphqlCalls().length).toBe(1);
    expect(sources.value.get(sourceKeyOf("RECEIPT", "R1"))?.unresolved).toContain("does not expose");
  });

  /**
   * The failure this actually hit against a live OMS. The component seeds `/graphql` for the ADMIN
   * group only, so an app user gets 403 -- and a 403 retried per row, on every scroll and every cache
   * tick, is a request storm. It is a fact about the deployment, so one request settles the session.
   */
  it.each([
    [403, "not authorized"],
    [401, "not authorized"],
    [404, "does not expose"],
  ])("stops asking after HTTP %i and says why", async (status, expected) => {
    harness.api.mockRejectedValue({ response: { status } });
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    await resolve([receiptLookup("R1")]);
    await resolve([receiptLookup("R2"), receiptLookup("I1", "POS_ISSUANCE")]);

    expect(graphqlCalls().length).toBe(1);
    expect(sources.value.get(sourceKeyOf("RECEIPT", "R1"))?.unresolved).toContain(expected);
  });

  /**
   * Passes overlap in the real page -- the watch re-fires as rows scroll in, long before the first
   * answer lands -- and each pass holds keys the others have not claimed. Without a shared first
   * query, every pass in flight asks a deployment that cannot answer any of them.
   */
  it("asks a denying OMS once even when several passes are in flight at the same time", async () => {
    let release: (value: unknown) => void = () => undefined;
    const gate = new Promise((resolve) => { release = resolve; });
    harness.api.mockImplementation(async () => {
      await gate;
      throw { response: { status: 403 } };
    });
    const { resolve } = useInventoryEventSources();

    const passes = [
      resolve([receiptLookup("R1")]),
      resolve([receiptLookup("R2")]),
      resolve([receiptLookup("R3"), receiptLookup("I1", "POS_ISSUANCE")]),
    ];
    release(undefined);
    await Promise.all(passes);

    expect(graphqlCalls().length).toBe(1);
  });

  it("does not serialize once the OMS has answered: two families still go out together", async () => {
    respondWith(movementResponse([]));
    const { resolve } = useInventoryEventSources();

    // First pass settles the capability question...
    await resolve([receiptLookup("R0")]);
    const afterProbe = movementCalls().length;
    // ...so a later pass pays no gate, and each family still gets its own query.
    await resolve([receiptLookup("R1"), receiptLookup("I1", "POS_ISSUANCE")]);

    expect(movementCalls().length - afterProbe).toBe(2);
  });

  it("still retries a plain network failure, which is not a fact about the deployment", async () => {
    harness.api.mockRejectedValue({ response: { status: 502 } });
    const { resolve } = useInventoryEventSources();

    await resolve([receiptLookup("R1")]);
    await resolve([receiptLookup("R1")]);

    expect(graphqlCalls().length).toBe(2);
  });

  it("says a reference is unknown rather than leaving the row blank", async () => {
    respondWith(movementResponse([{ receiptId: "R1", orderId: "10779" }]),
      [{ orderId: "10779", orderName: "WeeklyASN_5", orderTypeId: "PURCHASE_ORDER" }]);
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    await resolve([receiptLookup("R1"), receiptLookup("R_MISSING")]);

    expect(sources.value.get(sourceKeyOf("RECEIPT", "R_MISSING"))?.unresolved).toContain("no inventory movement");
  });

  it("does not name a row from a page that filled up, and says why", async () => {
    respondWith(movementResponse([{ receiptId: "R1", orderId: "10779" }], true),
      [{ orderId: "10779", orderName: "WeeklyASN_5", orderTypeId: "PURCHASE_ORDER" }]);
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    await resolve([receiptLookup("R1"), receiptLookup("R2")]);

    expect(sources.value.get(sourceKeyOf("RECEIPT", "R1"))?.label).toBe("Purchase order WeeklyASN_5");
    expect(sources.value.get(sourceKeyOf("RECEIPT", "R2"))?.unresolved).toContain("Too many movements");
  });

  it("retries a failed batch instead of marking every row in it permanently unresolvable", async () => {
    harness.api.mockRejectedValueOnce(new Error("network"));
    respondWith(movementResponse([{ receiptId: "R1", orderId: "10779" }]),
      [{ orderId: "10779", orderName: "WeeklyASN_5", orderTypeId: "PURCHASE_ORDER" }]);
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    await resolve([receiptLookup("R1")]);
    expect(sources.value.has(sourceKeyOf("RECEIPT", "R1"))).toBe(false);

    await resolve([receiptLookup("R1")]);
    expect(sources.value.get(sourceKeyOf("RECEIPT", "R1"))?.label).toBe("Purchase order WeeklyASN_5");
  });
});
