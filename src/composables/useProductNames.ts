import { commonUtil, logger, useSolrSearch } from "@common";
import { ref } from "vue";

/**
 * Rich product data from Solr, keyed by HotWax productId, fetched once and never refetched.
 *
 * The ledger this serves carries no product at all -- a ShopifyInventoryAdjustmentDetail row names a
 * remote Shopify target -- so a screen showing those rows can only ever offer an operator an inventory
 * item id unless it resolves the product separately. This is the resolver.
 *
 * Mirrors order-manager's and inventory-count's `useProductMaster`: same Solr query shape, same
 * `docType:PRODUCT` filter, same batching. It deliberately does NOT copy their cache store -- this
 * screen needs names for a few hundred rows for as long as it is open, not a durable product master,
 * and a Map keyed by productId is the whole requirement.
 */

const PRODUCT_FIELDS = "productId productName parentProductName internalName goodIdentifications mainImageUrl";
/** Solr takes the whole id list in one filter clause, so this caps the clause rather than the fetch. */
const BATCH_SIZE = 200;

export interface ResolvedProduct {
  productId: string;
  /**
   * The variant's own name, which for a sized product is just the option value ("S", "L", "XS") --
   * verified against rails-oms, where these rows resolved to bare sizes. Useful as a qualifier, never
   * as the label on its own.
   */
  productName: string;
  /** The name a merchandiser recognises. This is the one to show. */
  parentProductName: string;
  sku: string;
  internalName: string;
  mainImageUrl: string;
}

/** Solr treats these as syntax, so an id containing one has to arrive escaped or the query fails. */
function escapeSolrValue(value: string): string {
  return String(value).replace(/([\\+\-!(){}[\]^"~*?:]|&&|\|\|)/g, "\\$1");
}

/**
 * `goodIdentifications` arrives as "TYPE/value" strings, which is how the other apps read it too. The
 * SKU is the one identification this screen needs: it is what a merchandiser recognises a product by.
 */
function skuFrom(raw: unknown): string {
  if(!Array.isArray(raw)) {return "";}
  for(const identification of raw) {
    const text = String(identification ?? "");
    const slash = text.indexOf("/");
    if(slash !== -1 && text.slice(0, slash).trim() === "SKU") {return text.slice(slash + 1).trim();}
  }

  return "";
}

function buildProductQuery(productIds: string[]) {
  return {
    json: {
      params: { rows: productIds.length, start: 0, "q.op": "AND", fl: PRODUCT_FIELDS },
      query: "*:*",
      filter: ["docType:PRODUCT", `productId:(${productIds.map(escapeSolrValue).join(" OR ")})`],
    },
  };
}

const products = ref(new Map<string, ResolvedProduct>());
/** Ids already requested, so a re-render cannot queue the same product twice. */
const requested = new Set<string>();

/**
 * Resolve any ids not already known or in flight. Safe to call on every render: it filters against
 * `requested` first, so a stable set of rows produces exactly one Solr round trip.
 *
 * Failure is not thrown. A screen that cannot reach Solr should still show its rows with the ids it
 * already has, so this logs and leaves those products unresolved.
 */
async function resolve(productIds: Iterable<string>): Promise<void> {
  const pending = [...new Set([...productIds].map(String).filter(Boolean))]
    .filter((productId) => !requested.has(productId));
  if(!pending.length) {return;}
  pending.forEach((productId) => requested.add(productId));

  for(let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE);
    try {
      const response: any = await useSolrSearch().runSolrQuery(buildProductQuery(batch));
      if(commonUtil.hasError(response)) {
        logger.error("Product Solr query returned an error", response?.data);
        continue;
      }
      const resolved = new Map(products.value);
      for(const doc of response?.data?.response?.docs ?? []) {
        const productId = String(doc?.productId ?? "");
        if(!productId) {continue;}
        resolved.set(productId, {
          productId,
          productName: String(doc.productName || ""),
          parentProductName: String(doc.parentProductName || ""),
          sku: skuFrom(doc.goodIdentifications),
          internalName: String(doc.internalName || ""),
          mainImageUrl: String(doc.mainImageUrl || ""),
        });
      }
      products.value = resolved;
    } catch (error) {
      logger.error("Product Solr query failed", error);
    }
  }
}

export function useProductNames() {
  return { products, resolve };
}
