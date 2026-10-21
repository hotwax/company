import { ref, type Ref } from 'vue';
import { fetchShopifyShopLocations } from './useShopify';
import { logger } from '@common';

export function useShopifyLocations(shopId: Ref<string>) {
  const locations = ref<any[]>([]);
  const hydrated = ref<"idle" | "pending" | "success" | "error">("idle");

  const load = async (pageSize = 200) => {
    hydrated.value = "pending";
    try {
      if (shopId.value) {
        locations.value = await fetchShopifyShopLocations(shopId.value, pageSize);
        hydrated.value = "success";
      } else {
        hydrated.value = "error";
        throw new Error("Missing shop ID");
      }
    } catch (error) {
      logger.error('Failed to load Shopify locations', error);
      hydrated.value = "error";
      throw error;
    }
  };

  return {
    locations,
    hydrated,
    load
  };
}
