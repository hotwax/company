import { describe, expect, it, vi } from "vitest";

/**
 * The configure screen's state machine — and the empty-string trap that broke it.
 *
 * The sync sessions expose `error` as a STRING that is reset to `""` on every load, and the page
 * forwarded it straight into this function. The old guard was
 * `input.error !== undefined && input.error !== null`, which `""` passes — so `kind` was `"error"`
 * permanently, on every shop. Everything the Order Sync configure screen gates on a real kind (the
 * create-job button, the schedule editor, the activation review, the active-job card) was therefore
 * unreachable, and a shop with an active configured job rendered as "Waiting for setup".
 *
 * QA found it by driving the page against the live instance: shops 10000 and 10010 both showed
 * `Batch job … Configured / Schedule Active / mappings Ready` next to `Activation: Waiting for
 * setup`, and a brand-new shop never offered the Configure action at all.
 */

/**
 * `deriveSyncConfigurationState` is pure, but importing its module reaches `@common` → `useAuth` →
 * `cookieHelper`, which has no browser context here. Same seams as the sibling specs.
 */
vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: () => false, showToast: vi.fn(), isMoqui: () => true },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
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

import { deriveSyncConfigurationState } from "@/composables/useShopify";

const JOB = { jobName: "queue_ShopifyOrderSync_10010", paused: "N" };

describe("deriveSyncConfigurationState", () => {
  it("treats the sessions' empty-string error as NO error", () => {
    // The exact call the configure page makes for a configured, active shop.
    const state = deriveSyncConfigurationState({ job: JOB, loading: false, error: "" });

    expect(state.kind).toBe("configured-active");
    expect(state.configured).toBe(true);
    expect(state.paused).toBe(false);
  });

  it("treats a whitespace-only error as NO error", () => {
    expect(deriveSyncConfigurationState({ job: JOB, error: "   " }).kind).toBe("configured-active");
  });

  it("reports `missing` — the actionable state — for a shop with no job and no error", () => {
    // This is the state that renders the Configure (clone the template) action.
    const state = deriveSyncConfigurationState({ job: null, loading: false, error: "" });

    expect(state.kind).toBe("missing");
    expect(state.configured).toBe(false);
  });

  it("reports `configured-paused` for a job created paused", () => {
    expect(deriveSyncConfigurationState({ job: { ...JOB, paused: "Y" }, error: "" }).kind)
      .toBe("configured-paused");
  });

  it("still surfaces a REAL error, and never collapses it into `missing`", () => {
    const state = deriveSyncConfigurationState({ job: null, error: "Request failed with status code 500" });

    expect(state.kind).toBe("error");
    expect(state.error).toBe("Request failed with status code 500");
    expect(state.configured).toBe(false);
  });

  it("still surfaces a non-string error object", () => {
    const error = new Error("boom");
    expect(deriveSyncConfigurationState({ job: JOB, error }).kind).toBe("error");
  });

  it("prefers loading over missing while the session is still loading", () => {
    expect(deriveSyncConfigurationState({ loading: true, error: "" }).kind).toBe("loading");
  });
});
