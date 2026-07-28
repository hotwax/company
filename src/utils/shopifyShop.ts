/**
 * ShopifyShop — domain model + behaviors (pure, Vue-free).
 *
 * The reusable logic for one `ShopifyShop` — the tenant/scope of an integration. Its
 * correlation anchor, `SystemMessageRemote`, is part of the SystemMessage model and
 * lives in `@/utils/systemMessage`. Leaf module — imports nothing.
 */

/**
 * A ShopifyShop as the OMS REST layer serializes it (ShopifyShop entity), safe
 * fields only. Secrets (`sharedSecret`) are never modeled or carried to the client.
 */
export interface ShopifyShop {
  shopId: string;
  shopifyShopId?: string;
  productStoreId?: string;
  name?: string;
  myshopifyDomain?: string;
  domain?: string;
  primaryLocationId?: string;
  currency?: string;
  countryCode?: string;
  timezone?: string;
  isEnabled?: string;
}

/** Scope guard: does a shop-scoped record belong to the given shop? */
export function isInShop(
  record: { shopId?: string } | null | undefined,
  shopId: string | null | undefined,
): boolean {
  if (!record || !shopId) return false;
  return record.shopId === shopId;
}
