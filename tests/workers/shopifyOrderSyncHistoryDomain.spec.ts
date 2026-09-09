import { describe, it, expect, vi } from 'vitest';
const h = vi.hoisted(() => ({ domain: null as any, get: vi.fn(), upsert: vi.fn(async () => 1) }));
vi.mock('@/workers/syncRegistry', () => ({ registerSyncDomain: (domain: any) => { h.domain = domain; } }));
vi.mock('@/workers/domains/workerFetch', () => ({ workerGet: h.get }));
vi.mock('@/utils/cacheEntities', () => ({ shopifyOrderSyncHistoryCache: {upsertMany:h.upsert} }));
import '@/workers/domains/shopifyOrderSyncHistoryDomain';
it('fetches every page for exact selected orders before publishing a complete snapshot', async () => {
  h.get.mockReset(); h.upsert.mockClear();
  h.get.mockImplementation(async (_: any, url: string, args: any) => ({history:{shopId:'s',orderId:args.orderId,pending:[],synced:[],errors:[],messages:Array.from({length:args.pageIndex===0?100:1},(_,i)=>({systemMessageId:`${args.orderId}-${args.pageIndex}-${i}`})),hasMore:args.pageIndex===0}}));
  await h.domain.sync({}, {shopId:'s',orderIds:['old','other']});
  expect(h.get.mock.calls.map(c=>c[2])).toEqual([{shopId:'s',orderId:'old',pageIndex:0},{shopId:'s',orderId:'old',pageIndex:1},{shopId:'s',orderId:'other',pageIndex:0},{shopId:'s',orderId:'other',pageIndex:1}]);
  expect(h.upsert.mock.calls[0][0][0].messages).toHaveLength(101);
  expect(h.upsert.mock.calls[1][0][0].orderId).toBe('other');
});
it('fails closed on wrong-shop responses', async () => {
  h.upsert.mockClear();h.get.mockResolvedValue({history:{shopId:'wrong',orderId:'o',hasMore:false,pending:[],messages:[],synced:[],errors:[]}});
  await expect(h.domain.sync({}, {shopId:'s',orderIds:['o']})).rejects.toThrow();
  expect(h.upsert.mock.calls[0][0][0].state).toBe('error');
});
