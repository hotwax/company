export interface ProductFacilityActivation {
  shopId: string;
  productId: string;
  facilityId: string;
  shopifyProductId: string;
  shopifyInventoryItemId?: string;
  shopifyLocationId?: string;
  productName?: string;
  facilityName?: string;
  activatedAt?: string | number;
  activationStatus: "confirmed" | "pending" | "unmapped";
}

export function activationKey(row: ProductFacilityActivation): string {
  return JSON.stringify([row.shopId, row.productId, row.facilityId, row.shopifyProductId, row.shopifyInventoryItemId, row.shopifyLocationId]);
}

// The OMS view matches a confirmation on the Shopify inventory item, so anything it reports as
// confirmed is item-specific; a legacy null-item row reads as pending until it is reconfirmed.
export function activationLabel(status: ProductFacilityActivation["activationStatus"]): string {
  if (status === "confirmed") return "Confirmed";
  return status === "pending" ? "Pending confirmation" : "Missing mapping";
}
