export const INVENTORY_AT_LOCATION_QUERY = `query InventoryAtLocation($itemId: ID!, $locationId: ID!) {
  inventoryItem(id: $itemId) {
    id
    inventoryLevel(locationId: $locationId) {
      id
      location { id name }
      quantities(names: ["available", "on_hand", "incoming", "committed"]) { name quantity }
    }
  }
}`;

export function inventoryGid(value: string, type: "InventoryItem" | "Location"): string {
  const id = String(value || "");
  if (/^\d+$/.test(id)) return `gid://shopify/${type}/${id}`;
  if (new RegExp(`^gid://shopify/${type}/\\d+$`).test(id)) return id;
  throw new Error("The inventory item or location ID is invalid.");
}

export interface ShopifyInventorySnapshot {
  active: boolean;
  checkedAt: string;
  locationName?: string;
  quantities: Record<string, number | undefined>;
}

export function parseInventorySnapshot(response: any, itemId: string, locationId: string): ShopifyInventorySnapshot {
  const envelope = response?.response ?? response;
  if (response?.errors?.length || envelope?.errors?.length) throw new Error("Shopify could not return current inventory.");
  const data = envelope?.data ?? envelope;
  const item = data?.inventoryItem;
  if (!item || item.id !== itemId) throw new Error("Shopify did not return the requested inventory item.");
  if (!Object.prototype.hasOwnProperty.call(item, "inventoryLevel")) throw new Error("Shopify did not return an inventory level.");
  const level = item.inventoryLevel;
  if (level === null) return {active: false, checkedAt: new Date().toISOString(), quantities: {}};
  if (level?.location?.id !== locationId || !Array.isArray(level?.quantities)) throw new Error("Shopify did not return the requested location quantities.");
  const quantities: Record<string, number | undefined> = {};
  for (const entry of level.quantities) {
    if (typeof entry.quantity === "number" && Number.isFinite(entry.quantity)) quantities[entry.name] = entry.quantity;
  }
  return {active: true, checkedAt: new Date().toISOString(), locationName: level.location.name, quantities};
}
