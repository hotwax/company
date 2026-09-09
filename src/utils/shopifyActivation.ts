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

export function activationLabel(status: ProductFacilityActivation["activationStatus"], itemSpecific: boolean): string {
  if (status === "confirmed") return itemSpecific ? "Confirmed" : "Legacy confirmation";
  return status === "pending" ? "Pending confirmation" : "Missing mapping";
}
