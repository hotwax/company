/**
 * Shared guard for links into a shop's Shopify admin.
 *
 * `myshopifyDomain` is stored from operator input with no format validation — the connection form
 * only requires it to be non-empty — so a link built from it unchecked would render a trusted
 * looking "Shopify Admin" control pointing at an arbitrary host.
 *
 * A hostname is usable only when it is a lowercase `*.myshopify.com` name; anything else returns
 * "" so the caller renders no link at all.
 */
export function shopifyAdminHostname(myshopifyDomain: unknown): string {
  const hostname = String(myshopifyDomain ?? "").trim();
  if(hostname !== hostname.toLocaleLowerCase()) { return ""; }
  if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(hostname)) { return ""; }

  return hostname;
}

/** Shopify object ids are positive integers, so anything else cannot name a real record. */
export function isShopifyObjectId(value: unknown): boolean {
  return /^(?!0+$)[0-9]{1,30}$/.test(String(value ?? "").trim());
}
