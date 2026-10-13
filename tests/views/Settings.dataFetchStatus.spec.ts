// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";

const status = vi.hoisted(() => ({ refreshDomain: vi.fn() }));

vi.mock("@common", () => ({
  translate: (key: string) => key,
  commonUtil: { isMoqui: () => true, getMaargURL: () => "" },
  cookieHelper: () => ({ get: () => "test-oms" }),
}));
vi.mock("@common/composables/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: ref(true), logout: vi.fn() }),
}));
vi.mock("@/store/user", () => ({
  useUserStore: () => ({
    getUserProfile: { timeZone: "UTC" },
    fetchStatus: {},
    permissions: [],
    hasPermission: () => true,
  }),
}));
vi.mock("@common/db", () => ({
  catalogFrom: vi.fn(),
  useDbStatus: () => ({
    domains: ref([
      { name: "productStore", label: "Product stores", syncClass: "B", count: 13, syncedAt: 1791895300000, status: "success" },
      { name: "systemMessage", label: "System messages", syncClass: "A", count: 587, status: "success" },
      { name: "systemMessageError", label: "System message errors", syncClass: "C", count: 30, status: "success" },
      { name: "organization", label: "Organizations", syncClass: "B", count: 0, status: "pending" },
    ]),
    refreshing: ref(null),
    totalRows: ref(630),
    oldestSyncedAt: ref(1791895300000),
    lastSyncedAt: ref(1791895300000),
    refreshDomain: status.refreshDomain,
    refreshAll: vi.fn(),
  }),
}));
vi.mock("@/db/companyDb", () => ({ companyDb: { client: () => ({}) } }));
vi.mock("@/services/appDbSync", () => ({ resyncDomain: vi.fn(), resyncReferenceData: vi.fn() }));
vi.mock("@/composables/useSeed", () => ({ useMaargConfig: () => ({ config: ref({}), load: vi.fn(async () => {}) }) }));
vi.mock("@/router", () => ({ default: { push: vi.fn() } }));
vi.mock("@/authorization/actions", () => ({ default: {} }));
vi.mock("@/utils", () => ({ getCurrentTime: () => "" }));
vi.mock("@/components/common/TimezoneModal.vue", () => ({ default: {} }));

async function mountSettings() {
  const Settings = (await import("@/views/Settings.vue")).default;
  const wrapper = mount(Settings, {
    global: {
      stubs: { Image: true, DxpAppVersionInfo: true, IonMenuButton: true },
      mocks: { $t: (key: string) => key },
    },
  });
  await flushPromises();
  return wrapper;
}

/**
 * The status-card row for one domain, read from the rendered HTML: Ionic's components patch
 * `textContent` on their elements, so under jsdom the DOM reports their text as empty. Whitespace
 * is collapsed as the screen shows it.
 */
const row = (wrapper: any, label: string) => {
  const item = wrapper.html().split("<ion-item ").slice(1)
    .map((chunk: string) => `<ion-item ${chunk.slice(0, chunk.indexOf("</ion-item>"))}`)
    .find((chunk: string) => chunk.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().startsWith(label));
  if (!item) throw new Error(`no status row for "${label}"`);
  return {
    text: item.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/ ,/g, ",").trim(),
    hasRefresh: item.includes("<ion-button"),
  };
};

describe("Settings data fetch status", () => {
  it("says an on-request domain is fetched when opened, not that it never synced", async () => {
    const wrapper = await mountSettings();

    expect(row(wrapper, "System message errors").text).toContain("30 records, fetched when opened");
    expect(row(wrapper, "System message errors").text).not.toContain("not synced yet");
  });

  it("keeps the labels of scheduled, live and not-yet-synced domains", async () => {
    const wrapper = await mountSettings();

    expect(row(wrapper, "Product stores").text).toContain("13 records, synced");
    expect(row(wrapper, "System messages").text).toContain("587 records, live while in use");
    expect(row(wrapper, "Organizations").text).toContain("0 records, not synced yet");
  });

  it("offers no Refresh for an on-request domain, whose sync does nothing", async () => {
    const wrapper = await mountSettings();

    expect(row(wrapper, "System message errors").hasRefresh).toBe(false);
    expect(row(wrapper, "Product stores").hasRefresh).toBe(true);
  });
});
