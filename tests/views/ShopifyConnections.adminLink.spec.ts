// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const harness = vi.hoisted(() => ({
  shops: [] as any[],
}));

vi.mock("@common", () => ({
  translate: (key: string) => key,
}));

vi.mock("@/router", () => ({
  default: { push: vi.fn() },
}));

vi.mock("@/composables/useShopify", () => ({
  useShopifyShops: () => ({ records: ref(harness.shops), hydrated: ref(true) }),
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
}));

vi.mock("@/components/shopify/ShopifyConnectionFilters.vue", () => ({
  default: { template: "<div />" },
}));

vi.mock("@/components/shopify/CreateShopifyConnectionModal.vue", () => ({
  default: { template: "<div />" },
}));

const stubs = {
  IonPage: { template: "<div><slot /></div>" },
  IonHeader: { template: "<div><slot /></div>" },
  IonToolbar: { template: "<div><slot /></div>" },
  IonTitle: { template: "<h1><slot /></h1>" },
  IonButtons: { template: "<div><slot /></div>" },
  IonButton: { template: "<button><slot /></button>" },
  IonMenuButton: { template: "<button><slot /></button>" },
  IonContent: { template: "<div><slot /></div>" },
  IonSearchbar: { template: "<input />" },
  IonList: { template: "<div class='ion-list'><slot /></div>" },
  IonItem: { template: "<div class='ion-item'><slot /></div>" },
  IonToggle: { template: "<div><slot /></div>" },
  IonLabel: { template: "<div class='ion-label'><slot /></div>" },
  IonChip: { template: "<div class='ion-chip'><slot /></div>" },
  IonIcon: { template: "<span class='ion-icon' />" },
  IonSkeletonText: { template: "<span />" },
  IonFab: { template: "<div><slot /></div>" },
  IonFabButton: { template: "<button><slot /></button>" },
};

async function mountConnections(shops: any[]) {
  harness.shops = shops;
  const ShopifyConnections = (await import("@/views/ShopifyConnections.vue")).default;
  return mount(ShopifyConnections, { global: { stubs } });
}

function domainChip(wrapper: any, domain: string) {
  return wrapper.findAll(".ion-chip").find((chip: any) => chip.text().includes(domain));
}

describe("ShopifyConnections - Shopify admin chip", () => {
  let open: any;

  beforeEach(() => {
    vi.clearAllMocks();
    open = vi.spyOn(window, "open").mockReturnValue(null);
  });

  afterEach(() => {
    open.mockRestore();
  });

  it("opens the admin of a shop whose stored domain is a real shop host", async () => {
    const wrapper = await mountConnections([
      { shopId: "1000", name: "Rails Paris", productStoreId: "STORE", myshopifyDomain: "rails-paris.myshopify.com" },
    ]);

    const chip = domainChip(wrapper, "rails-paris.myshopify.com");
    expect(chip?.exists()).toBe(true);
    await chip?.trigger("click");

    expect(open).toHaveBeenCalledWith("https://rails-paris.myshopify.com/admin", "_blank", "noopener, noreferrer");
  });

  // myshopifyDomain is operator input the connection form only checks for non-emptiness, so the
  // chip must not become a one-click trip to whatever host was typed into it.
  it("opens no window for a stored domain that is not a shop host, and offers no open affordance", async () => {
    const wrapper = await mountConnections([
      { shopId: "1001", name: "Not a shop", productStoreId: "STORE", myshopifyDomain: "evil.com" },
      { shopId: "1002", name: "Lookalike", productStoreId: "STORE", myshopifyDomain: "rails-paris.myshopify.com.evil.com" },
    ]);

    for (const domain of ["evil.com", "rails-paris.myshopify.com.evil.com"]) {
      const chip = domainChip(wrapper, domain);
      expect(chip?.exists()).toBe(true);
      // The domain is still reported; only the link out of it is withheld.
      expect(chip?.findAll(".ion-icon").length).toBe(0);

      await chip?.trigger("click");
    }

    expect(open).not.toHaveBeenCalled();
  });
});
