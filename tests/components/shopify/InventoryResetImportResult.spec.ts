// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { describe, it, expect, vi } from 'vitest';
const harness = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@common', () => ({ translate: (text: string) => text }));
vi.mock('@/composables/useShopify', () => ({ repairInventoryResetImportConfig: vi.fn() }));
vi.mock('@/utils', () => ({ formatDateTime: (value: any) => String(value) }));
vi.mock('@/composables/useDataManager', () => ({ useDataManager: () => ({ errorLogs: ref([]), fetchLogDetails: harness.fetch }) }));
import Result from '@/components/shopify/InventoryResetImportResult.vue';

describe('InventoryResetImportResult', () => {
 it('shows batch outcome from the exact reset import without claiming quantities', async () => {
   harness.fetch.mockResolvedValue({ logId: 'LOG1', configId: 'RESET_INV_CHANNEL', statusId: 'DmlsFinished', totalRecordCount: 26, failedRecordCount: 2 });
   const wrapper = mount(Result, { props: { logId: 'LOG1' } });
   await wrapper.find('ion-button').trigger('click'); await flushPromises();
   expect(harness.fetch).toHaveBeenCalledWith('LOG1');
   expect(wrapper.text()).toContain('Finished');
   expect(wrapper.text()).toContain('Failed batch records2');
   wrapper.unmount();
 });
 it('rejects another import rather than displaying unrelated success', async () => {
   harness.fetch.mockResolvedValue({ logId: 'LOG2', configId: 'RESET_INV_CHANNEL', statusId: 'DmlsFinished' });
   const wrapper = mount(Result, { props: { logId: 'LOG1' } });
   await wrapper.find('ion-button').trigger('click'); await flushPromises();
   expect(wrapper.text()).toContain('could not be verified');
   expect(wrapper.text()).not.toContain('Import status');
   wrapper.unmount();
 });
});
