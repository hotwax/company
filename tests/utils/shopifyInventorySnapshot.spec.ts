import { describe, it, expect } from 'vitest';
import { inventoryGid, parseInventorySnapshot } from '@/utils/shopifyInventorySnapshot';
const itemId = 'gid://shopify/InventoryItem/1';
const locationId = 'gid://shopify/Location/2';
const payload = (quantities: unknown) => ({response: {inventoryItem: {id: itemId, inventoryLevel: {location: {id: locationId, name: 'Warehouse'}, quantities}}}});
describe('current Shopify inventory snapshot', () => {
  it('accepts exact numeric IDs and rejects wrong entity types', () => {
    expect(inventoryGid('1', 'InventoryItem')).toBe(itemId);
    expect(inventoryGid(itemId, 'InventoryItem')).toBe(itemId);
    expect(() => inventoryGid(locationId, 'InventoryItem')).toThrow();
    expect(() => inventoryGid('1 OR 2', 'Location')).toThrow();
  });
  it('preserves zero and negative stock without inventing missing quantities', () => {
    const result = parseInventorySnapshot(payload([{name: 'available', quantity: -2}, {name: 'on_hand', quantity: 0}]), itemId, locationId);
    expect(result.quantities).toEqual({available: -2, on_hand: 0});
    expect(result.quantities.incoming).toBeUndefined();
  });
  it('distinguishes an unstocked level from a malformed or inaccessible response', () => {
    expect(parseInventorySnapshot({inventoryItem: {id: itemId, inventoryLevel: null}}, itemId, locationId).active).toBe(false);
    expect(() => parseInventorySnapshot({}, itemId, locationId)).toThrow();
    expect(() => parseInventorySnapshot({inventoryItem: {id: itemId}}, itemId, locationId)).toThrow();
  });
  it('rejects partial GraphQL responses carrying errors', () => {
    const response = payload([]);
    expect(() => parseInventorySnapshot({...response, errors: [{message: 'Access denied'}]}, itemId, locationId)).toThrow();
  });
  it('rejects quantities for another item or location', () => {
    expect(() => parseInventorySnapshot(payload([]), 'gid://shopify/InventoryItem/99', locationId)).toThrow();
    expect(() => parseInventorySnapshot(payload([]), itemId, 'gid://shopify/Location/99')).toThrow();
  });
});
