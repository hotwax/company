// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("@common", () => ({
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

import ShopifyOrderSyncCard from "@/components/shopify-order-sync/ShopifyOrderSyncCard.vue";

/**
 * The card is mounted on the connection page from the first frame so its box never changes size as
 * the cache fills. That only holds up if the card says nothing it does not know yet: a zero count or
 * a "no batch request has been produced yet" printed over an unread cache is a false statement about
 * the shop, not a placeholder.
 */
const mountCard = (snapshot: Record<string, any>) => mount(ShopifyOrderSyncCard, {
  props: { snapshot },
});

const LOADED = {
  loading: false,
  configurationState: "configured-active",
  processedCount: 7,
  pendingCount: 2,
  lastCompletedLabel: "2026-09-12 11:04:00",
  batchStatus: "Completed",
  importStatus: "Completed",
};

describe("ShopifyOrderSyncCard — while the cache is still loading", () => {
  it("states no count, date or progress it has not read yet", async () => {
    const wrapper = mountCard({ ...LOADED, loading: true });
    await flushPromises();

    const text = wrapper.text();
    expect(text).not.toContain("No batch request has been produced yet");
    expect(text).not.toContain("No HotWax import has been produced yet");
    expect(text).not.toContain("Not started");
    // The labels stay — it is the figures that are unknown.
    expect(text).toContain("Orders processed");
    expect(text).toContain("Pending batch requests");
    expect(wrapper.findAll("ion-skeleton-text").length).toBeGreaterThanOrEqual(5);
  });

  it("does not offer itself as a button until the figures are real", async () => {
    const loading = mountCard({ ...LOADED, loading: true });
    await flushPromises();
    expect(loading.attributes("button")).toBeFalsy();
    await loading.find("ion-card").trigger("click");
    expect(loading.emitted("open")).toBeUndefined();

    const loaded = mountCard({ ...LOADED });
    await flushPromises();
    await loaded.find("ion-card").trigger("click");
    expect(loaded.emitted("open")).toHaveLength(1);
  });

  it("prints the figures once they are known", async () => {
    const wrapper = mountCard({ ...LOADED });
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain("7");
    expect(text).toContain("2");
    expect(wrapper.findAll("ion-skeleton-text")).toHaveLength(0);
  });
});
