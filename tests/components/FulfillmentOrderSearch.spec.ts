// @vitest-environment jsdom
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, it, expect, vi } from 'vitest';
import { IonSearchbar, IonItem, IonButton } from '@ionic/vue';
import { api } from '@common';
import Picker from '@/components/shopify-fulfillment/FulfillmentOrderSearch.vue';
vi.mock('@common', () => ({api:vi.fn(),translate:(s:string)=>s}));
vi.mock('@/utils', () => ({formatDateTime:(s:string)=>s,hasError:(r:any)=>!!r.data?.errors}));
enableAutoUnmount(afterEach);
it('opens more results to select multiple whole rows and apply exact order ids', async () => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({data:{orders:[{orderId:'1',orderName:'#100',customerPartyName:'Customer A'},{orderId:'2',orderName:'#101',customerPartyName:'Customer A'}],hasMore:false,nextPageIndex:1}} as any);
  const w=mount(Picker,{props:{shopId:'shop',modelValue:[]},global:{stubs:{IonModal:{props:['isOpen'],template:'<div v-if="isOpen" data-modal><slot /></div>'}}}});
  w.findComponent(IonSearchbar).vm.$emit('ionInput',{detail:{value:'Customer A'}});
  await flushPromises();
  const more=w.findAllComponents(IonButton).find(row=>row.text()==='More results')!;
  await more.trigger('click');
  const items=w.find('[data-modal]').findAllComponents(IonItem).filter(row=>row.text().includes('Customer A'));
  expect(items).toHaveLength(2);
  await items[0].trigger('click');await items[1].trigger('click');
  const apply=w.find('[data-modal]').findAllComponents(IonButton).find(b=>b.text().includes('View sync history'))!;
  await apply.trigger('click');
  expect((w.emitted('update:modelValue')![0][0] as any[]).map(r=>r.orderId)).toEqual(['1','2']);
  expect(vi.mocked(api).mock.lastCall?.[0]).toMatchObject({params:{shopId:'shop',query:'Customer A',pageIndex:0}});
});
it('ignores stale results when a newer query completes first', async () => {
  let resolveOld: any;
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementationOnce(()=>new Promise(resolve=>resolveOld=resolve) as any).mockResolvedValueOnce({data:{orders:[{orderId:'new',orderName:'New result'}],hasMore:false,nextPageIndex:1}} as any);
  const w=mount(Picker,{props:{shopId:'shop',modelValue:[]}});
  const search=w.findComponent(IonSearchbar);
  search.vm.$emit('ionInput',{detail:{value:'old'}});
  search.vm.$emit('ionInput',{detail:{value:'new'}});
  await flushPromises();
  resolveOld({data:{orders:[{orderId:'old',orderName:'Old result'}],hasMore:false,nextPageIndex:1}});
  await flushPromises();
  expect(w.text()).toContain('New result');expect(w.text()).not.toContain('Old result');
});

it('keeps only the top 20 choices and opens the first match directly', async () => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({data:{orders:Array.from({length:25},(_,i)=>({orderId:String(i),orderName:`Order ${i}`})),hasMore:false,nextPageIndex:1}} as any);
  const w=mount(Picker,{props:{shopId:'shop',modelValue:[]},global:{stubs:{IonModal:{props:['isOpen'],template:'<div v-if="isOpen" data-modal><slot /></div>'}}}});
  w.findComponent(IonSearchbar).vm.$emit('ionInput',{detail:{value:'Order'}});
  await flushPromises();
  expect(w.text()).toContain('Order 0');expect(w.text()).not.toContain('Order 1');
  await w.findAllComponents(IonButton).find(b=>b.text()==='More results')!.trigger('click');
  expect(w.find('[data-modal]').text()).toContain('Order 19');
  expect(w.find('[data-modal]').text()).not.toContain('Order 20');
  await w.findAllComponents(IonItem).find(row=>row.text().includes('Order 0'))!.trigger('click');
  expect((w.emitted('update:modelValue')![0][0] as any[]).map(r=>r.orderId)).toEqual(['0']);
});
