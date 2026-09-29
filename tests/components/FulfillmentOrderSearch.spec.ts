// @vitest-environment jsdom
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, it, expect, vi } from 'vitest';
import { IonSearchbar, IonItem, IonButton } from '@ionic/vue';
import { api } from '@common';
import Picker from '@/components/shopify-fulfillment/FulfillmentOrderSearch.vue';
vi.mock('@common', () => ({ api: vi.fn(), translate: (s: string, v: any = {}) => Object.entries(v).reduce((m, [k, val]) => m.replace(`{${k}}`, String(val)), s) }));
vi.mock('@/utils', () => ({ formatDateTime: (s: string) => s, hasError: (r: any) => !!r.data?.errors }));
vi.mock('@/composables/useSeed', () => ({
  useStatuses: () => ({
    ofType: () => [{ statusId: 'ORDER_APPROVED', description: 'Approved' }],
    labelFor: (id: string) => (id === 'ORDER_APPROVED' ? 'Approved' : id),
  }),
}));
enableAutoUnmount(afterEach);

const rows = [
  { orderId: '1', orderName: '#100', shopifyOrderId: '7001', statusId: 'ORDER_APPROVED' },
  { orderId: '2', orderName: '#101', shopifyOrderId: '7002', statusId: 'ORDER_APPROVED' },
];

it('searches the chosen field through the DataDocument and selects whole rows', async () => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({ data: { entityValueList: rows } } as any);
  const w = mount(Picker, { props: { shopId: 'shop', modelValue: [] }, global: { stubs: { IonModal: { props: ['isOpen'], template: '<div v-if="isOpen" data-modal><slot /></div>' } } } });
  w.findComponent(IonSearchbar).vm.$emit('ionInput', { detail: { value: '#10' } });
  await flushPromises();
  // Default field is the order name, searched case-insensitively.
  expect(vi.mocked(api).mock.lastCall?.[0]).toMatchObject({
    url: 'oms/dataDocumentView',
    method: 'POST',
    data: {
      dataDocumentId: 'SHOPIFY_SHOP_ORDER_SEARCH',
      customParametersMap: { shopId: 'shop', orderName_op: 'contains', orderName_ic: 'Y', orderName: '#10', orderByField: '-orderDate' },
    },
  });
  const more = w.findAllComponents(IonButton).find(row => row.text() === 'More results')!;
  await more.trigger('click');
  const items = w.find('[data-modal]').findAllComponents(IonItem).filter(row => row.text().includes('#10'));
  await items[0].trigger('click'); await items[1].trigger('click');
  const apply = w.find('[data-modal]').findAllComponents(IonButton).find(b => b.text().includes('View sync history'))!;
  await apply.trigger('click');
  expect((w.emitted('update:modelValue')![0][0] as any[]).map(r => r.orderId)).toEqual(['1', '2']);
});

it('sends no ignore-case flag when searching an id field', async () => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({ data: { entityValueList: [] } } as any);
  const w = mount(Picker, { props: { shopId: 'shop', modelValue: [] } });
  (w.vm as any).field = 'shopifyOrderId';
  w.findComponent(IonSearchbar).vm.$emit('ionInput', { detail: { value: '7001' } });
  await flushPromises();
  const params: any = vi.mocked(api).mock.lastCall?.[0].data.customParametersMap;
  expect(params.shopifyOrderId_op).toBe('contains');
  expect(params.shopifyOrderId).toBe('7001');
  expect(params.shopifyOrderId_ic).toBeUndefined();
});

it('passes the status and date filters through as Moqui search params', async () => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({ data: { entityValueList: [] } } as any);
  const w = mount(Picker, { props: { shopId: 'shop', modelValue: [] } });
  (w.vm as any).statusId = 'ORDER_APPROVED';
  (w.vm as any).dateFrom = '2026-05-01';
  (w.vm as any).dateThru = '2026-06-01';
  w.findComponent(IonSearchbar).vm.$emit('ionInput', { detail: { value: '#100' } });
  await flushPromises();
  expect(vi.mocked(api).mock.lastCall?.[0]).toMatchObject({
    data: { customParametersMap: { statusId: 'ORDER_APPROVED', orderDate_from: '2026-05-01 00:00:00', orderDate_thru: '2026-06-01 23:59:59' } },
  });
});

it('reports more results only when the page comes back full', async () => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({ data: { entityValueList: Array.from({ length: 21 }, (_, i) => ({ orderId: String(i), orderName: `#${i}` })) } } as any);
  const w = mount(Picker, { props: { shopId: 'shop', modelValue: [] } });
  w.findComponent(IonSearchbar).vm.$emit('ionInput', { detail: { value: '#' } });
  await flushPromises();
  expect(w.text()).toContain('More results');
  expect(vi.mocked(api).mock.lastCall?.[0].data.pageSize).toBe(21);
});

it('ignores stale results when a newer query completes first', async () => {
  let resolveOld: any;
  vi.mocked(api).mockReset();
  vi.mocked(api)
    .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }) as any)
    .mockResolvedValueOnce({ data: { entityValueList: [{ orderId: 'new', orderName: 'New result' }] } } as any);
  const w = mount(Picker, { props: { shopId: 'shop', modelValue: [] } });
  w.findComponent(IonSearchbar).vm.$emit('ionInput', { detail: { value: 'old' } });
  w.findComponent(IonSearchbar).vm.$emit('ionInput', { detail: { value: 'new' } });
  await flushPromises();
  resolveOld({ data: { entityValueList: [{ orderId: 'stale', orderName: 'Stale result' }] } });
  await flushPromises();
  expect(w.text()).toContain('New result');
  expect(w.text()).not.toContain('Stale result');
});
