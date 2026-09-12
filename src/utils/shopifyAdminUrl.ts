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

/**
 * The shop's admin home. "" when the stored domain is not a shop host, so a caller opens nothing
 * rather than sending the operator to whatever was typed into the connection form.
 */
export function shopifyShopAdminUrl(myshopifyDomain: unknown): string {
  const hostname = shopifyAdminHostname(myshopifyDomain);
  if(!hostname) { return ""; }

  return `https://${hostname}/admin`;
}

/**
 * A product in the shop's admin, narrowed to one variant when `variantId` names a different record
 * than the product itself. An unusable variant id only drops that suffix — the product link is
 * still whole — while an unusable host or product id returns "".
 */
export function shopifyProductAdminUrl(myshopifyDomain: unknown, productId: unknown, variantId?: unknown): string {
  const hostname = shopifyAdminHostname(myshopifyDomain);
  const product = String(productId ?? "").trim();
  if(!hostname || !isShopifyObjectId(product)) { return ""; }

  const productUrl = `https://${hostname}/admin/products/${product}`;
  const variant = String(variantId ?? "").trim();
  if(variant === product || !isShopifyObjectId(variant)) { return productUrl; }

  return `${productUrl}/variants/${variant}`;
}

/** One order in the shop's admin, or "" when either half of the link cannot be trusted. */
export function shopifyOrderAdminUrl(myshopifyDomain: unknown, orderId: unknown): string {
  const hostname = shopifyAdminHostname(myshopifyDomain);
  const order = String(orderId ?? "").trim();
  if(!hostname || !isShopifyObjectId(order)) { return ""; }

  return `https://${hostname}/admin/orders/${order}`;
}
