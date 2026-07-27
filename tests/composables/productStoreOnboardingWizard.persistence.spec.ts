import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCT_STORE_ONBOARDING_STEP_IDS } from "@/config/productStoreOnboarding";

/**
 * L1 unit — the onboarding wizard composable's PERSISTENCE contract, the one part of the
 * store-to-composable conversion that is not a mechanical move.
 *
 * `store/productStoreOnboarding.ts` was `persist: true` because users leave mid-wizard and resume
 * the draft after a reload. The composable reproduces that with an explicit localStorage
 * read-at-init + write-on-change, which is exactly the kind of hand-rolled code that silently rots.
 * What these pin:
 *
 *  - hydration MERGES the stored draft over the defaults (the plugin's `$patch` semantics) — a
 *    draft persisted before a field existed must keep that field's default, not drop it;
 *  - the retired Pinia key (`productStoreOnboarding`, keyed on the store id) is read ONCE so an
 *    in-flight draft survives the migration, then removed;
 *  - session clear (logout) resets the state AND leaves no key behind — the write-on-change
 *    watcher must not resurrect what the reset just removed;
 *  - `updateDraftField("storeName", …)` derives `productStoreId` only while it is empty, capped
 *    at the entity's 20-char id limit.
 *
 * The module holds its state at module scope, so each test re-imports the graph fresh. Storage is
 * an in-memory stub: node 26 ships an experimental `localStorage` global that is UNDEFINED unless
 * the runtime gets `--localstorage-file`, and it shadows jsdom's, so neither environment provides a
 * usable one here. The composable itself only needs get/set/removeItem.
 */

const STORAGE_KEY = "company.productStoreOnboarding";
const LEGACY_STORAGE_KEY = "productStoreOnboarding";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, String(value)); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
});

async function importWizardGraph() {
  vi.resetModules();
  const [wizardModule, sessionScope] = await Promise.all([
    import("@/composables/useProductStoreOnboardingWizard"),
    import("@/composables/sessionScope"),
  ]);
  return {
    wizard: wizardModule.useProductStoreOnboardingWizard(),
    clearSessionScopedState: sessionScope.clearSessionScopedState,
  };
}

function storedState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  localStorage.clear();
});

describe("useProductStoreOnboardingWizard persistence", () => {
  it("hydrates from the namespaced key, merging the stored draft over the defaults", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      currentStepId: "shopify",
      createdProductStoreId: "STORE_1",
      completedStepIds: ["name", "general"],
      // A draft persisted before most fields existed: only two fields survive a version bump.
      draft: { storeName: "Acme", selectedWorkflows: ["routing"] },
    }));

    const { wizard } = await importWizardGraph();

    expect(wizard.currentStepId).toBe("shopify");
    expect(wizard.createdProductStoreId).toBe("STORE_1");
    expect(wizard.completedCount).toBe(2);
    expect(wizard.draft.storeName).toBe("Acme");
    expect(wizard.draft.selectedWorkflows).toEqual(["routing"]);
    // Fields absent from the stored draft keep their defaults instead of vanishing.
    expect(wizard.draft.defaultCurrencyUomId).toBe("USD");
    expect(wizard.draft.orderNumberPrefix).toBe("HC");
  });

  it("falls back to a clean wizard when the stored value is unparseable", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");

    const { wizard } = await importWizardGraph();

    expect(wizard.currentStepId).toBe("name");
    expect(wizard.completedCount).toBe(0);
    expect(wizard.draft.storeName).toBe("");
  });

  it("migrates an in-flight draft from the retired Pinia key, then removes that key", async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({
      currentStepId: "general",
      createdProductStoreId: "",
      completedStepIds: ["name"],
      draft: { storeName: "Legacy Store" },
    }));

    const { wizard } = await importWizardGraph();

    expect(wizard.currentStepId).toBe("general");
    expect(wizard.draft.storeName).toBe("Legacy Store");
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();

    // The next change persists under the NEW key only.
    wizard.updateDraftField("orderNumberPrefix", "LG");
    expect(storedState()?.draft.orderNumberPrefix).toBe("LG");
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("writes every change through, and step navigation derives from the step config", async () => {
    const { wizard } = await importWizardGraph();

    wizard.updateDraftField("storeName", "Acme Outdoor Supply Company");
    // Derived once from the store name, capped at the 20-char entity id limit…
    expect(wizard.draft.productStoreId).toBe("ACME_OUTDOOR_SUPPLY_");
    // …and never overwritten by a later rename.
    wizard.updateDraftField("storeName", "Renamed");
    expect(wizard.draft.productStoreId).toBe("ACME_OUTDOOR_SUPPLY_");

    wizard.goNext();
    expect(wizard.completedStepIds).toEqual([PRODUCT_STORE_ONBOARDING_STEP_IDS[0]]);
    expect(wizard.currentStepId).toBe(PRODUCT_STORE_ONBOARDING_STEP_IDS[1]);
    expect(wizard.progressValue).toBeCloseTo(1 / PRODUCT_STORE_ONBOARDING_STEP_IDS.length);

    // Everything above hit localStorage synchronously — a reload would resume exactly here.
    const stored = storedState();
    expect(stored?.currentStepId).toBe(PRODUCT_STORE_ONBOARDING_STEP_IDS[1]);
    expect(stored?.draft.storeName).toBe("Renamed");
  });

  it("session clear resets the wizard and leaves no localStorage key behind", async () => {
    const { wizard, clearSessionScopedState } = await importWizardGraph();

    wizard.updateDraftField("storeName", "User A Store");
    wizard.goNext();
    expect(storedState()?.draft.storeName).toBe("User A Store");

    clearSessionScopedState();

    expect(wizard.currentStepId).toBe("name");
    expect(wizard.completedCount).toBe(0);
    expect(wizard.draft.storeName).toBe("");
    // The reset's own write-through ran synchronously BEFORE the removal, so the key stays gone.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
