// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { IonSelect, IonSelectOption } from '@ionic/vue';
vi.mock('@common', () => ({ translate: (text: string) => text }));
vi.mock('@/composables/useShopify', () => ({ fetchCurrentShopifyInventory: vi.fn() }));
vi.mock('@/utils', () => ({ formatDateTime: String }));
import Details from '@/components/shopify/InventoryResetBatchDetails.vue';
import Snapshot from '@/components/shopify/ShopifyInventorySnapshot.vue';
const record = { inventoryChannelId: 'CHANNEL1', products: [
  { productId: 'PRODUCT1', shopifyInventoryItemId: '101' },
  { productId: 'PRODUCT1', shopifyInventoryItemId: '102' },
] };
const channels = [{ inventoryChannelId: 'CHANNEL1', shopifyLocationId: '201' }];

describe('reset batch current inventory inspection', () => {
  it('keeps distinct Shopify items for the same OMS product and queries only the selected identity', async () => {
    const wrapper = mount(Details, { props: { record, index: 0, remoteId: 'REMOTE1', channels } });
    expect(wrapper.findAllComponents(IonSelectOption)).toHaveLength(2);
    expect(wrapper.findComponent(Snapshot).exists()).toBe(false);
    wrapper.findComponent(IonSelect).vm.$emit('ionChange', { detail: { value: '102' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(Snapshot).props()).toEqual({ remoteId: 'REMOTE1', inventoryItemId: '102', locationId: '201' });
    expect(wrapper.text()).toContain('does not prove which items this reset published');
    await wrapper.setProps({ channels: [{ inventoryChannelId: 'CHANNEL1', shopifyLocationId: '202' }] });
    expect(wrapper.findComponent(Snapshot).exists()).toBe(false);
    wrapper.unmount();
  });
  it('does not use an unrelated channel or offer inspection when the record is malformed', () => {
    for (const badRecord of [{ ...record, inventoryChannelId: 'OTHER' }, { ...record, products: null }]) {
      const wrapper = mount(Details, { props: { record: badRecord, index: 0, remoteId: 'REMOTE1', channels } });
      expect(wrapper.findComponent(IonSelect).exists()).toBe(false);
      expect(wrapper.findComponent(Snapshot).exists()).toBe(false);
      expect(wrapper.text()).toContain('could not be identified');
      wrapper.unmount();
    }
  });
});
