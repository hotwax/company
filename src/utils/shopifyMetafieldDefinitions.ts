export type ShopifyMetafieldOwnerType = "PRODUCT" | "PRODUCTVARIANT";

export const SHOPIFY_METAFIELD_OWNER_TYPES: ShopifyMetafieldOwnerType[] = ["PRODUCT", "PRODUCTVARIANT"];

/** The product sync reads a calendar metafield only when its type is one of these; it skips any other. */
const CALENDAR_METAFIELD_TYPES = ["date", "date_time"];

export interface ShopifyMetafieldDefinition {
  ownerType: ShopifyMetafieldOwnerType;
  name: string;
  namespace: string;
  key: string;
  type: string;
  /** The `namespace:key` value a calendar mapping stores. */
  selector: string;
}

export const METAFIELD_DEFINITIONS_QUERY = `query MetafieldDefinitions($ownerType: MetafieldOwnerType!, $after: String) {
  metafieldDefinitions(ownerType: $ownerType, first: 250, after: $after) {
    nodes { name namespace key type { name } }
    pageInfo { hasNextPage endCursor }
  }
}`;

export function parseMetafieldDefinitionsPage(response: any, ownerType: ShopifyMetafieldOwnerType) {
  const envelope = response?.response ?? response;
  if(response?.errors?.length || envelope?.errors?.length) {throw new Error("Shopify could not return metafield definitions.");}
  const page = (envelope?.data ?? envelope)?.metafieldDefinitions;
  if(!Array.isArray(page?.nodes) || typeof page?.pageInfo?.hasNextPage !== "boolean") {
    throw new Error("Shopify did not return a complete page of metafield definitions.");
  }
  const definitions: ShopifyMetafieldDefinition[] = page.nodes
    .filter((node: any) => node?.namespace && node?.key)
    .map((node: any) => ({
      ownerType,
      name: String(node.name || node.key),
      namespace: String(node.namespace),
      key: String(node.key),
      type: String(node.type?.name ?? ""),
      selector: `${node.namespace}:${node.key}`,
    }));

  return { definitions, endCursor: page.pageInfo.hasNextPage ? String(page.pageInfo.endCursor || "") || null : null };
}

export function isCalendarMetafieldType(type: string) {
  return CALENDAR_METAFIELD_TYPES.includes(type);
}

/**
 * Split a stored selector the way the connector does: at the FIRST colon, with a non-empty namespace
 * and key. The connector silently drops any value this rejects, so the editor must refuse it too.
 */
function parseMetafieldSelector(value: unknown): { namespace: string; key: string } | null {
  const selector = String(value ?? "").trim();
  const separator = selector.indexOf(":");
  if(separator <= 0 || separator >= selector.length - 1) {return null;}

  return { namespace: selector.slice(0, separator), key: selector.slice(separator + 1) };
}

export type MetafieldSelectorCheck =
  | { status: "invalid" } |
  { status: "match"; matches: ShopifyMetafieldDefinition[] } |
  { status: "wrong-type"; matches: ShopifyMetafieldDefinition[] } |
  { status: "no-match" };

/** Compare a typed selector with the shop's product and variant definitions, exactly as the sync would. */
export function checkMetafieldSelector(value: unknown, definitions: ShopifyMetafieldDefinition[]): MetafieldSelectorCheck {
  const parsed = parseMetafieldSelector(value);
  if(!parsed) {return { status: "invalid" };}
  const matches = definitions.filter((definition) => definition.namespace === parsed.namespace && definition.key === parsed.key);
  if(!matches.length) {return { status: "no-match" };}

  return matches.some((definition) => isCalendarMetafieldType(definition.type))
    ? { status: "match", matches }
    : { status: "wrong-type", matches };
}
