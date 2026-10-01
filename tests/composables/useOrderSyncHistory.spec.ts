import { ref } from 'vue';
import { describe, it, expect, vi } from 'vitest';
import { useOrderSyncHistory } from '@/composables/useOrderSyncHistory';
const rows = ref<any[]>([]);
vi.mock('@/composables/useCachedList', () => ({ useCachedList: () => ({ records: rows }) }));
vi.mock('@/utils/cacheEntities', () => ({ shopifyOrderSyncHistoryCache: {} }));
vi.mock('@common', () => ({ api: vi.fn(), logger: {} }));

describe('selected order sync history', () => {
  it('uses exact shop/order records outside the recent window and responds to selection changes', () => {
    const ids = ref(['old']);
    rows.value = [
      { shopId: 'shop', orderId: 'old', state: 'ready', pending: [{shipmentId:'s',statusDate:'2020-01-01T00:00:00Z'}], messages:[{systemMessageId:'m',statusId:'SmsgProduced',messageText:'{"shipmentId":"s"}',initDate:'2020-01-01T00:00:00Z'}],synced:[] },
      { shopId: 'other', orderId: 'old', state: 'ready', messages:[{systemMessageId:'wrong',statusId:'SmsgProduced'}] },
      { shopId: 'shop', orderId: 'new', state: 'ready', messages:[{systemMessageId:'sent',statusId:'SmsgSent'}],synced:[{fulfillmentId:'f'}] },
    ];
    const history = useOrderSyncHistory('shop', ids);
    expect(history.ready.value).toBe(true);
    expect(history.queued.value.map(row => row.systemMessageId)).toEqual(['m']);
    expect(history.queued.value[0].parsed.shipmentId).toBe('s');
    expect(history.pending.value[0].statusDate).toBe(Date.parse('2020-01-01T00:00:00Z'));
    ids.value = ['new'];
    expect(history.queued.value).toEqual([]);
    expect(history.synced.value[0].fulfillmentKey).toBe('shop:f');
    ids.value = ['missing'];
    expect(history.ready.value).toBe(false);
    expect(history.synced.value).toEqual([]);
  });
  it('does not report partial results as complete or keep failed cached rows visible', () => {
    rows.value = [{shopId:'shop',orderId:'a',state:'error',messages:[{statusId:'SmsgProduced'}]}];
    const history = useOrderSyncHistory('shop', ['a','b']);
    expect(history.error.value).toBe(true);
    expect(history.ready.value).toBe(false);
    expect(history.queued.value).toEqual([]);
  });
});
