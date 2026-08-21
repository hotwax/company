import { describe, expect, it, vi } from "vitest";

// `translate` reaches into the app's i18n instance, which is not booted in a unit test. The label
// map is what is under test, so stub the lookup to return its key unchanged.
vi.mock("@common", () => ({ translate: (key: string) => key }));

const { facilityGroupTypeLabel, facilityGroupTypeLabelIds } = await import("@/utils/facilityGroupTypeLabels");
const en = (await import("@/locales/en.json")).default as Record<string, string>;

/**
 * The OMS exposes no facility group type resource, so these ids had no descriptions and every
 * surface rendered the raw id — "BROKERING_GROUP" on group cards, in the detail header, and in the
 * type filter. The map supplies the labels; these cases keep it honest.
 */
describe("facilityGroupTypeLabel", () => {
  it("labels the group types the OMS actually uses", () => {
    expect(facilityGroupTypeLabel("BROKERING_GROUP")).toBe("Brokering");
    expect(facilityGroupTypeLabel("ALLOW_NEGATIVE_RES")).toBe("Allow Negative Reservation");
    expect(facilityGroupTypeLabel("SHOPIFY_GROUP_FAC")).toBe("Shopify");
  });

  it("returns empty for an unmapped id so callers fall back to the id", () => {
    // Templates render `description || facilityGroupTypeId`. Returning the id here would be
    // indistinguishable, but returning a placeholder would hide a genuinely new type.
    expect(facilityGroupTypeLabel("SOME_NEW_TYPE")).toBe("");
    expect(facilityGroupTypeLabel("")).toBe("");
  });

  it("has an en.json entry for every mapped label", () => {
    // A label absent from the locale file renders as the raw English key via vue-i18n's fallback,
    // which happens to look right — so a missing entry is invisible until another locale is added.
    const missing = facilityGroupTypeLabelIds
      .map((id) => facilityGroupTypeLabel(id))
      .filter((label) => !(label in en));

    expect(missing).toEqual([]);
  });
});
