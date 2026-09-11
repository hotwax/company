import { beforeEach, describe, expect, it, vi } from 'vitest';
const { api, reconcile } = vi.hoisted(() => ({api: vi.fn(), reconcile: vi.fn()}));
vi.mock('@common', () => ({api, commonUtil: {hasError: (r: any) => !!r?.data?.errors, getMaargURL: () => 'http://localhost:8080'}}));
vi.mock('@/services/appDbSync', () => ({refreshAfterMutation: vi.fn()}));
vi.mock('@/utils/cacheEntities', () => ({shopifyTransferPendingCache: {}}));
vi.mock('@/composables/useCachedList', () => ({useCachedList: vi.fn()}));
vi.mock('@/utils/shopifyWebhookReconciliation', () => ({reconcileWebhookTopics: reconcile}));
vi.mock('@/workers/domains/shopifyTransferSyncDomain', () => ({PENDING_SEGMENT_ENDPOINTS: {}, SYNCED_SEGMENT_ENDPOINTS: {}}));
import { registerMissingTransferWebhook } from '@/composables/useShopifyTransferSync';
const topic = 'INVENTORY_TRANSFERS_CANCEL';
const endpoint = 'https://uat.example.com/rest/s1/shopify/webhook/payload';
beforeEach(() => {
  api.mockReset(); reconcile.mockReset();
  reconcile.mockReturnValue({rows: [{topic, systemMessageTypeId: 'InventoryTransfersCancel', subscribed: false}]});
  api.mockImplementation(async (request: any) => {
    if (request.method === 'post') return {data: {webhookSubscriptionId: 'gid://shopify/WebhookSubscription/1'}};
    if (request.url.includes('/shops/')) return {data: {shopRemotes: [{systemMessageRemoteId: 'remote'}]}};
    if (request.url === 'shopify/webhook-subscription') return {data: {webhookList: []}};
    if (request.url.includes('mappingTypes')) return {data: {enumerations: []}};
    return {data: {systemMessages: []}};
  });
});
describe('transfer callback registration', () => {
  it('passes an explicit endpoint and waits for Shopify subscription identity', async () => {
    expect(await registerMissingTransferWebhook('10000', topic, endpoint)).toEqual({status: 'created', subscriptionId: 'gid://shopify/WebhookSubscription/1'});
    expect(api.mock.calls.find(([r]) => r.method === 'post')?.[0].data).toEqual({systemMessageRemoteId: 'remote', topic, endPoint: endpoint});
  });
  it('supports the EventBridge destination accepted by main', async () => {
    const arn = 'arn:aws:events:us-east-1::event-source/aws.partner/shopify.com/123/test';
    expect((await registerMissingTransferWebhook('10000', topic, arn)).status).toBe('created');
    expect(api.mock.calls.find(([r]) => r.method === 'post')?.[0].data.endPoint).toBe(arn);
  });
  it('preserves any existing destination without creating another subscription', async () => {
    reconcile.mockReturnValue({rows: [{topic, systemMessageTypeId: 'type', subscribed: true, subscriptionId: 'existing'}]});
    expect((await registerMissingTransferWebhook('10000', topic, endpoint)).status).toBe('existing');
    expect(api.mock.calls.some(([r]) => r.method === 'post')).toBe(false);
  });
  it('rejects local endpoints before accessing the backend', async () => {
    await expect(registerMissingTransferWebhook('10000', topic, 'https://localhost/callback')).rejects.toThrow('public HTTPS');
    expect(api).not.toHaveBeenCalled();
  });
  it('reports an uncertain write without retrying', async () => {
    const original = api.getMockImplementation()!;
    api.mockImplementation(async (r: any) => { if (r.method === 'post') throw new Error('timeout'); return original(r); });
    expect((await registerMissingTransferWebhook('10000', topic, endpoint)).status).toBe('uncertain');
    expect(api.mock.calls.filter(([r]) => r.method === 'post')).toHaveLength(1);
  });
  it('does not infer absent subscriptions from a malformed listing', async () => {
    const original = api.getMockImplementation()!;
    api.mockImplementation(async (r: any) => r.url === 'shopify/webhook-subscription' ? {data: {}} : original(r));
    await expect(registerMissingTransferWebhook('10000', topic, endpoint)).rejects.toThrow('incomplete');
    expect(api.mock.calls.some(([r]) => r.method === 'post')).toBe(false);
  });
});
