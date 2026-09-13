import { api, commonUtil, logger } from "@common";

export function useGeocoding() {
  const geocode = async (payload: Record<string, any>) => {
    try {
      return (await api({ url: 'api/geocode', method: 'POST', data: payload }) as any).data;
    } catch (error) {
      logger.error('Failed to perform geocoding', error);
      throw error;
    }
  };

  return { geocode };
}
