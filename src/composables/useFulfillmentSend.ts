import { api } from "@common";
export async function sendPendingFulfillment(_shopId: string, shipmentId: string) {
  if (!shipmentId) { throw new Error('Shipment identifier is missing.'); }
  return (await api({ url: 'sob/shopifyFulfillment', method: 'post', data: { shipmentId } }) as any).data;
}
export async function getFulfillmentSendOutcome(shopId: string, shipmentId: string) {
  return (await api({ url: 'sob/shopify/fulfillmentSendOutcome', method: 'get', params: { shopId, shipmentId } }) as any).data?.outcome;
}
