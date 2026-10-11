// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

/**
 * Every failing domain is listed by the label it declares, not its internal name, read from the
 * list the worker registers, so it works whether or not the worker is up.
 */
vi.mock("@common", () => ({ translate: (value: string) => value }));
vi.mock("@/workers/appSyncDomains", () => ({
  appSyncDomains: [
    { name: "facility", label: "Facilities", syncClass: "B" },
    { name: "shopifyShop", label: "Shopify shops", syncClass: "B" },
  ],
}));
vi.mock("@ionic/vue", () => {
  const passthrough = (name: string) => defineComponent({ name, setup: (_props, { slots }) => () => h("div", slots.default?.()) });
  return {
    IonButton: passthrough("IonButton"),
    IonIcon: passthrough("IonIcon"),
    IonItem: passthrough("IonItem"),
    IonLabel: passthrough("IonLabel"),
    IonList: passthrough("IonList"),
    IonListHeader: passthrough("IonListHeader"),
    IonPopover: passthrough("IonPopover"),
  };
});

import SyncStatusButton from "@/components/common/SyncStatusButton.vue";

describe("SyncStatusButton", () => {
  it("labels each failure with its domain's declared label", async () => {
    const wrapper = mount(SyncStatusButton, {
      props: { failures: { facility: "boom", shopifyShop: "down", __start: "no worker", unknownDomain: "x" } },
    });
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain("Facilities");
    expect(text).toContain("Shopify shops");
    expect(text).toContain("Background sync");
    // A domain the catalog does not know still shows, by name.
    expect(text).toContain("unknownDomain");
    expect(text).not.toMatch(/\bfacility\b/);
  });
});
