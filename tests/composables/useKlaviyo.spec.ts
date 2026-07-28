import { describe, expect, it, vi } from "vitest";

const api = vi.fn();

vi.mock("@common", () => ({
  api: (...args: any[]) => api(...args),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

/**
 * L1 unit — the Klaviyo composable's session-shaped state and its bespoke mutations.
 *
 * Klaviyo has NO cached domain (deliberate — tracked in docs/cache-sync-remaining-work.md), so
 * unlike the Shopify composables everything here is a live fetch into module-level state. What
 * these pin:
 *
 *  - email types are a LOAD-ONCE promise memo (the `useOrderSyncLandmarkDates` pattern), moved
 *    off `store/util.fetchEmailTypes`. One request per session no matter how many screens ask,
 *    a failure retries instead of caching the error forever, and logout drops the memo.
 *  - mutation request shapes — the email-setting writes are bespoke REST routes with the store
 *    id (and email type) in the PATH, so a wrong encoding writes against the wrong resource.
 *
 * The module holds its load-once state at module scope, so each test re-imports it fresh.
 */
const EMAIL_TYPE_ROWS = [
  { enumId: "READY_FOR_PICKUP", enumTypeId: "PRDS_EMAIL", description: "BOPIS Order Ready For Pickup" },
  { enumId: "REJECT_BOPIS_ORDER", enumTypeId: "PRDS_EMAIL", description: "BOPIS Order Rejection" },
];

async function freshModule(rows: any[] = EMAIL_TYPE_ROWS) {
  vi.resetModules();
  api.mockReset();
  api.mockImplementation(async () => ({ data: rows }));
  return import("@/composables/useKlaviyo");
}

describe("useKlaviyo — email types load once", () => {
  it("fetches once no matter how many callers ask, and shares one copy", async () => {
    const { useKlaviyo } = await freshModule();
    const screenA = useKlaviyo();
    const screenB = useKlaviyo();

    // Two screens mounting in the same tick, plus a re-entry — one request total.
    await Promise.all([screenA.ensureEmailTypes(), screenB.ensureEmailTypes()]);
    await screenA.ensureEmailTypes();

    expect(api.mock.calls).toHaveLength(1);
    expect(screenA.emailTypes.value).toEqual(EMAIL_TYPE_ROWS);
    // Module-level state: the second screen sees the same copy without asking.
    expect(screenB.emailTypes.value).toEqual(EMAIL_TYPE_ROWS);
  });

  it("asks for the PRDS_EMAIL catalog exactly as store/util did", async () => {
    const { useKlaviyo } = await freshModule();

    await useKlaviyo().ensureEmailTypes();

    expect(api.mock.calls[0][0]).toEqual({
      url: "admin/enums",
      method: "get",
      params: { enumTypeId: "PRDS_EMAIL", pageSize: 100 },
    });
  });

  it("stays retryable after a failure instead of caching the error forever", async () => {
    vi.resetModules();
    api.mockReset();
    api.mockRejectedValueOnce(new Error("boom"));
    const { useKlaviyo } = await import("@/composables/useKlaviyo");
    const screen = useKlaviyo();

    // The failure is swallowed (labels fall back to the static list) — no throw, no data.
    await screen.ensureEmailTypes();
    expect(screen.emailTypes.value).toEqual([]);

    api.mockImplementation(async () => ({ data: EMAIL_TYPE_ROWS }));
    await screen.ensureEmailTypes();

    expect(screen.emailTypes.value).toEqual(EMAIL_TYPE_ROWS);
    expect(api.mock.calls).toHaveLength(2);
  });

  it("drops the memo on logout so the next session refetches", async () => {
    const { useKlaviyo } = await freshModule();
    // Through the registry, not clearKlaviyoState directly — this pins that the composable
    // actually registered with `onSessionCleared`, which is all logout invokes.
    const { clearSessionScopedState } = await import("@/composables/sessionScope");
    const screen = useKlaviyo();
    await screen.ensureEmailTypes();

    clearSessionScopedState();
    expect(screen.emailTypes.value).toEqual([]);

    await screen.ensureEmailTypes();
    expect(api.mock.calls).toHaveLength(2); // second session, second fetch
  });
});

describe("useKlaviyo — mutation request shapes", () => {
  it("upsertEmailSetting posts to the store-scoped route with the id encoded", async () => {
    const { upsertEmailSetting } = await freshModule();
    api.mockImplementation(async () => ({ data: {} }));

    const payload = {
      productStoreId: "STORE/1", // "/" pins the encodeURIComponent — raw, it would split the path
      emailType: "READY_FOR_PICKUP",
      subject: "Your order is ready for pickup",
      systemMessageRemoteId: "UNIGATE_CONFIG",
      gatewayAuthId: "KLAVIYO_BRAND_A_1753500000000",
    };
    await upsertEmailSetting(payload);

    expect(api.mock.calls[0][0]).toEqual({
      url: "oms/productStoreEmailSettings/STORE%2F1/emailSettings",
      method: "post",
      data: payload,
    });
  });

  it("upsertEmailSetting echoes the payload back when the server returns no body", async () => {
    const { upsertEmailSetting } = await freshModule();
    api.mockImplementation(async () => ({ data: undefined }));

    const payload = {
      productStoreId: "STORE_A",
      emailType: "READY_FOR_PICKUP",
      subject: "Your order is ready for pickup",
      systemMessageRemoteId: "UNIGATE_CONFIG",
      gatewayAuthId: "KLAVIYO_BRAND_A_1753500000000",
    };

    // The details view reads the result to update its toggle state — a void response must not
    // blank it. Same `resp.data || payload` contract the store had.
    await expect(upsertEmailSetting(payload)).resolves.toEqual(payload);
  });

  it("deleteEmailSetting addresses the (store, emailType) row in the path", async () => {
    const { deleteEmailSetting } = await freshModule();
    api.mockImplementation(async () => ({ data: {} }));

    await deleteEmailSetting("STORE_A", "REJECT_BOPIS_ORDER");

    expect(api.mock.calls[0][0]).toEqual({
      url: "oms/productStoreEmailSettings/STORE_A/emailSettings/REJECT_BOPIS_ORDER",
      method: "delete",
    });
  });
});
