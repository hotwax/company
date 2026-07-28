import { describe, expect, it } from "vitest";
import { shouldPopHistoryOnBack } from "@/utils/navigation";

/**
 * The Shopify sub-pages must POP the entry they came from rather than pushing their parent, or the
 * parent's `ion-back-button` finds the sub-page sitting ahead of it in history and the two bounce
 * forever (jam.dev/c/141b94c8 — the detail page's back button navigated INTO /locations with a
 * `forward_back` qualifier, and /shopify was unreachable).
 */
describe("shouldPopHistoryOnBack", () => {
  it("pops when we arrived from another page in this tab", () => {
    expect(shouldPopHistoryOnBack("", "/shopify-connection-details/10010")).toBe(true);
  });

  it("navigates instead of popping on a deep link, where there is nothing to pop", () => {
    expect(shouldPopHistoryOnBack("", null)).toBe(false);
    expect(shouldPopHistoryOnBack("", undefined)).toBe(false);
  });

  /**
   * `?returnTo=` is an explicit instruction from whoever linked here — the onboarding flow sends the
   * user into a sub-page and wants them returned to its own step, not to whatever preceded it.
   */
  it("honours an explicit returnTo over popping", () => {
    expect(shouldPopHistoryOnBack("?returnTo=/product-store-onboarding", "/somewhere-else")).toBe(false);
  });

  it("ignores an empty returnTo and still pops", () => {
    expect(shouldPopHistoryOnBack("?returnTo=", "/shopify-connection-details/10010")).toBe(true);
  });

  it("handles a search string with other params present", () => {
    expect(shouldPopHistoryOnBack("?foo=1&bar=2", "/prev")).toBe(true);
    expect(shouldPopHistoryOnBack("?foo=1&returnTo=/x", "/prev")).toBe(false);
  });

  it("tolerates a missing search string", () => {
    expect(shouldPopHistoryOnBack(undefined as any, "/prev")).toBe(true);
  });
});
