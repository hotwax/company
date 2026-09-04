/**
 * Back-navigation rules for the Shopify sub-pages.
 *
 * Pure on purpose: the decision is what breaks, not the navigation call, so it is unit-tested
 * without a router or a mounted view.
 */

/**
 * Should a back control POP the history entry it came from, rather than navigate to a href?
 *
 * ⚠️ THIS EXISTS BECAUSE PUSHING "BACK" BUILT AN INESCAPABLE LOOP.
 *
 * The sub-pages (locations, product types, sales channels, payment methods, shipment methods) are all
 * reached from `/shopify-connection-details/{id}`, and each one's back control used
 * `router.push(backHref)`. `push` ADDS an entry, so going "back" from a sub-page left that sub-page
 * sitting AHEAD of the detail page in history:
 *
 *   /shopify → /details → /locations → (push) /details        history: [..., /locations, /details]
 *
 * The detail page's `<ion-back-button default-href="/shopify">` then does the correct thing for the
 * stack it was given — it pops to the previous entry, which is `/locations`. That page's back pushes
 * `/details` again, and the two pages bounce forever; `/shopify` is never reachable and
 * `default-href` never applies because there is always something to pop.
 *
 * Reproduced in jam.dev/c/141b94c8-9836-4813-bcc7-22f8400167f2 — the recording shows the detail
 * page's back button navigating with a `forward_back` qualifier INTO `/locations`.
 *
 * Popping instead keeps the stack the size it was on the way in, so the detail page's back button
 * still has `/shopify` behind it.
 *
 * @param search      `window.location.search` — an explicit `?returnTo=` means the caller chose the
 *                    destination, so honour it instead of popping to wherever we happened to come from.
 * @param historyBack `router.options.history.state.back` — null/undefined on a deep link or a fresh
 *                    tab, where there is nothing to pop and we must navigate.
 */
export function shouldPopHistoryOnBack(search: string, historyBack: unknown): boolean {
  const returnTo = new URLSearchParams(search || "").get("returnTo");
  if (returnTo) return false;
  return Boolean(historyBack);
}
