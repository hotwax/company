// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IonModal, IonToggle, alertController } from '@ionic/vue';
const api = vi.hoisted(() => ({ detail: vi.fn(), runs: vi.fn(), audits: vi.fn(), update: vi.fn(), run: vi.fn() }));
vi.mock('@common', () => ({ translate: (s: string) => s, commonUtil: { showToast: vi.fn() } }));
vi.mock('@/utils', () => ({ formatDateTime: (s: any) => s ? String(s) : '' }));
vi.mock('@/composables/useServiceJobs', () => ({ useServiceJob: () => ({
  fetchJobDetail: api.detail, fetchJobRuns: api.runs, fetchJobAuditHistory: api.audits, updateJob: api.update, runNow: api.run,
}) }));
import Modal from '@/components/common/ServiceJobDetailsModal.vue';
const mountModal = () => mount(Modal, { props: { isOpen: true, jobName: 'JOB1' }, global: { stubs: {
  IonModal: { props: ['isOpen', 'canDismiss', 'backdropDismiss'], template: '<div><slot /></div>' },
} } });

describe('job modal load identity and dismissal', () => {
  beforeEach(() => { vi.clearAllMocks(); api.runs.mockResolvedValue([]); api.audits.mockResolvedValue([]); });
  it('can close a failed initial read without claiming unsaved edits', async () => {
    api.detail.mockRejectedValue(new Error('expired session'));
    const alert = vi.spyOn(alertController, 'create');
    const wrapper = mountModal(); await flushPromises();
    expect(wrapper.text()).toContain('Sync job details unavailable');
    expect(await wrapper.findComponent(IonModal).props('canDismiss')()).toBe(true);
    await wrapper.find('ion-button[aria-label="Close"]').trigger('click'); await flushPromises();
    expect(alert).not.toHaveBeenCalled();
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(api.update).not.toHaveBeenCalled(); expect(api.run).not.toHaveBeenCalled();
    wrapper.unmount(); alert.mockRestore();
  });
  it('preserves the dirty guard for a real user edit after loading', async () => {
    api.detail.mockResolvedValue({ jobName: 'JOB1', paused: 'Y' });
    const wrapper = mountModal(); await flushPromises();
    expect(wrapper.findComponent(IonModal).props('backdropDismiss')).toBe(true);
    wrapper.findComponent(IonToggle).vm.$emit('ionChange', { detail: { checked: true } });
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(IonModal).props('backdropDismiss')).toBe(false);
    wrapper.unmount();
  });
  it('ignores an earlier job response after switching jobs', async () => {
    let finishFirst!: (v: any) => void;
    api.detail.mockImplementation((name: string) => name === 'JOB1'
      ? new Promise(resolve => { finishFirst = resolve; })
      : Promise.resolve({ jobName: 'JOB2', serviceName: 'SERVICE2', paused: 'Y' }));
    const wrapper = mountModal();
    await wrapper.setProps({ jobName: 'JOB2' }); await flushPromises();
    finishFirst({ jobName: 'JOB1', serviceName: 'STALE_SERVICE', paused: 'N' }); await flushPromises();
    expect(wrapper.text()).toContain('SERVICE2');
    expect(wrapper.text()).not.toContain('STALE_SERVICE');
    expect(wrapper.findComponent(IonToggle).props('checked')).toBe(false);
    wrapper.unmount();
  });
  it('rejects a mismatched job response', async () => {
    api.detail.mockResolvedValue({ jobName: 'OTHER', paused: 'N' });
    const wrapper = mountModal(); await flushPromises();
    expect(wrapper.text()).toContain('Sync job details unavailable');
    expect(wrapper.findComponent(IonToggle).exists()).toBe(false);
    expect(await wrapper.findComponent(IonModal).props('canDismiss')()).toBe(true);
    wrapper.unmount();
  });
});
