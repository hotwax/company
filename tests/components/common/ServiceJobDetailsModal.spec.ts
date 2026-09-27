// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IonFabButton, IonInput, IonModal, IonToggle, alertController } from '@ionic/vue';
const api = vi.hoisted(() => ({ detail: vi.fn(), runs: vi.fn(), audits: vi.fn(), usernames: vi.fn(), update: vi.fn(), run: vi.fn() }));
vi.mock('@common', () => ({ translate: (s: string) => s, commonUtil: { showToast: vi.fn() } }));
vi.mock('@/utils', () => ({ formatDateTime: (s: any) => s ? String(s) : '' }));
vi.mock('@/composables/useServiceJobs', () => ({ useServiceJob: () => ({
  fetchJobDetail: api.detail, fetchJobRuns: api.runs, fetchJobAuditHistory: api.audits, fetchUsernames: api.usernames,
  updateJob: api.update, runNow: api.run,
}) }));
import { commonUtil } from '@common';
import Modal from '@/components/common/ServiceJobDetailsModal.vue';
import { CacheReconciliationError } from '@/utils/cacheReconciliationError';
const mountModal = (props: Record<string, unknown> = {}) => mount(Modal, { props: { isOpen: true, jobName: 'JOB1', ...props }, global: { stubs: {
  IonModal: { props: ['isOpen', 'canDismiss', 'backdropDismiss'], template: '<div><slot /></div>' },
} } });

describe('job modal load identity and dismissal', () => {
  beforeEach(() => { vi.clearAllMocks(); api.runs.mockResolvedValue([]); api.audits.mockResolvedValue([]); api.usernames.mockResolvedValue({}); });
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

describe('job modal title, identity parameters and committed writes', () => {
  const job = () => ({
    jobName: 'JOB1', description: 'Purges settled rows', serviceName: 'svc#Purge', paused: 'N', cronExpression: '0 0 * ? * *',
    serviceJobParameters: [
      { parameterName: 'shopId', parameterValue: '100002' },
      { parameterName: 'inventoryChannelId', parameterValue: 'IC_1' },
      { parameterName: 'daysToKeep', parameterValue: '5' },
    ],
  });
  const input = (wrapper: any, label: string) => wrapper.findAllComponents(IonInput).find((field: any) => field.props('label') === label);
  const RECONCILED = 'The server change was saved, but this view could not be refreshed. Refresh before retrying.';
  beforeEach(() => {
    vi.clearAllMocks();
    api.detail.mockResolvedValue(job()); api.runs.mockResolvedValue([]); api.audits.mockResolvedValue([]); api.usernames.mockResolvedValue({});
  });

  it('names who changed the job by username, not user id', async () => {
    api.audits.mockResolvedValue([{ auditHistorySeqId: '1', changedFieldName: 'paused', changedByUserId: '100002', changedDate: 5 }]);
    api.usernames.mockResolvedValue({ 100002: 'aditya.patel' });
    const wrapper = mountModal(); await flushPromises();
    expect(api.usernames).toHaveBeenCalledWith(['100002']);
    expect(wrapper.text()).toContain('Changed by: aditya.patel');
    expect(wrapper.text()).not.toContain('100002');
    wrapper.unmount();
  });

  it('is titled by the job name and describes the job instead of repeating it', async () => {
    const wrapper = mountModal(); await flushPromises();
    expect(wrapper.find('ion-title').text()).toBe('JOB1');
    expect(wrapper.text()).toContain('Purges settled rows');
    expect(wrapper.text().split('JOB1')).toHaveLength(2);
    wrapper.unmount();
  });

  it('keeps identity parameters read-only unless the screen names one as an input', async () => {
    const wrapper = mountModal(); await flushPromises();
    expect(input(wrapper, 'shopId').props('disabled')).toBe(true);
    expect(input(wrapper, 'inventoryChannelId').props('disabled')).toBe(true);
    expect(input(wrapper, 'daysToKeep').props('disabled')).toBe(false);
    await wrapper.setProps({ editableParameterNames: ['inventoryChannelId'] });
    expect(input(wrapper, 'inventoryChannelId').props('disabled')).toBe(false);
    wrapper.unmount();
  });

  it('closes a save whose write landed but whose cache refresh failed, without sending it again', async () => {
    api.update.mockRejectedValue(new CacheReconciliationError('serviceJob', { jobName: 'JOB1' }));
    const wrapper = mountModal(); await flushPromises();
    wrapper.findComponent(IonToggle).vm.$emit('ionChange', { detail: { checked: false } }); await flushPromises();
    await wrapper.findComponent(IonFabButton).trigger('click'); await flushPromises();
    expect(commonUtil.showToast).toHaveBeenLastCalledWith(RECONCILED);
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(await wrapper.findComponent(IonModal).props('canDismiss')()).toBe(true);
    expect(api.update).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('re-sends only the unsent parameters after a screen-owned schedule write landed', async () => {
    const saveHandler = vi.fn().mockResolvedValue(undefined);
    api.update.mockRejectedValueOnce(new Error('daysToKeep must be at least 1')).mockResolvedValueOnce({});
    const wrapper = mountModal({ saveHandler }); await flushPromises();
    wrapper.findComponent(IonToggle).vm.$emit('ionChange', { detail: { checked: false } });
    input(wrapper, 'daysToKeep').vm.$emit('ionInput', { detail: { value: '7' } }); await flushPromises();

    await wrapper.findComponent(IonFabButton).trigger('click'); await flushPromises();
    expect(wrapper.emitted('close')).toBeUndefined();
    await wrapper.findComponent(IonFabButton).trigger('click'); await flushPromises();

    expect(saveHandler.mock.calls).toEqual([[{ paused: true }]]);
    expect(api.update).toHaveBeenLastCalledWith({ jobName: 'JOB1', serviceJobParameters: [{ parameterName: 'daysToKeep', parameterValue: '7' }] });
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('reloads after a run whose cache refresh failed, because the run was queued', async () => {
    api.run.mockRejectedValue(new CacheReconciliationError('serviceJob', { jobName: 'JOB1' }));
    const wrapper = mountModal(); await flushPromises();
    await wrapper.findAll('ion-button').find((button) => button.text() === 'Run now')!.trigger('click'); await flushPromises();
    expect(commonUtil.showToast).toHaveBeenLastCalledWith(RECONCILED);
    expect(api.detail).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('keeps a pause change unsaved when the schedule write before it landed but its refresh failed', async () => {
    const saveHandler = vi.fn()
      .mockRejectedValueOnce(new CacheReconciliationError('serviceJob', { jobName: 'JOB1' }))
      .mockResolvedValue(undefined);
    const wrapper = mountModal({ saveHandler }); await flushPromises();
    input(wrapper, 'Quartz cron expression').vm.$emit('update:modelValue', '0 0 0 ? * *');
    wrapper.findComponent(IonToggle).vm.$emit('ionChange', { detail: { checked: false } }); await flushPromises();

    await wrapper.findComponent(IonFabButton).trigger('click'); await flushPromises();
    expect(wrapper.emitted('close')).toBeUndefined();
    await wrapper.findComponent(IonFabButton).trigger('click'); await flushPromises();

    expect(saveHandler.mock.calls).toEqual([[{ cronExpression: '0 0 0 ? * *' }], [{ paused: true }]]);
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it("shows the service's signature under the job's own field, and lists only the parameters the job does not set", async () => {
    api.detail.mockResolvedValue({ ...job(), serviceInParameters: [
      { name: 'daysToKeep', type: 'Integer', default: 5, required: 'true' },
      { name: 'purgeUnsynced', type: 'Boolean', default: null, required: null },
      { name: '_jobRunId', type: null, default: null, required: null },
    ] });
    const wrapper = mountModal(); await flushPromises();
    expect(input(wrapper, 'daysToKeep').props('helperText')).toBe('Integer, default {value}, required');
    // Outlined and outside ion-item, whose wrapper clips an outline label; a protected field says why it is disabled.
    expect(input(wrapper, 'daysToKeep').props('fill')).toBe('outline');
    expect(input(wrapper, 'daysToKeep').element.closest('ion-item')).toBeNull();
    expect(input(wrapper, 'shopId').props('helperText')).toBe('read only');
    expect(wrapper.text()).toContain('Not set on this job');
    expect(wrapper.text()).toContain('purgeUnsynced');
    expect(wrapper.text()).not.toContain('_jobRunId');
    // Set on the job, so it is a field with helper text, not also a row in the unset list.
    expect(wrapper.findAll('ion-label').some((label) => label.text().includes('daysToKeep'))).toBe(false);
    wrapper.unmount();
  });

  it("shows each recent run's timing and what it did, with its status once", async () => {
    api.runs.mockResolvedValue([
      { jobRunId: 'R2', startTime: 10_000, endTime: 10_222, hasError: 'N',
        results: JSON.stringify({ recordsRemoved: 20, terminalDetailRecordsRemoved: 19, ageOnlyDetailRecordsRemoved: 0 }) },
      { jobRunId: 'R1', startTime: 1_000, endTime: 4_000, hasError: 'Y', results: '{}', errors: 'Lock wait timeout exceeded' },
    ]);
    const wrapper = mountModal(); await flushPromises();
    const rows = wrapper.findAll('ion-item').map((row) => row.text()).filter((text) => text.includes('{duration}'));
    expect(rows).toHaveLength(2);

    expect(rows[0]).toContain('Took {duration}');
    expect(rows[0]).toContain('Records removed: 20');
    expect(rows[0]).not.toContain('Removed for age only');
    expect(rows[0].split('Completed')).toHaveLength(2);
    expect(rows[1]).toContain('Lock wait timeout exceeded');
    expect(rows[1]).toContain('Failed');
    wrapper.unmount();
  });

  it('shows what each audited change was, in words where the raw value is a code', async () => {
    api.audits.mockResolvedValue([
      { auditHistorySeqId: '2', changedFieldName: 'paused', oldValueText: 'N', newValueText: 'Y', changedDate: 20 },
      { auditHistorySeqId: '1', changedFieldName: 'cronExpression', oldValueText: null, newValueText: '0 0 * ? * *', changedDate: 10 },
    ]);
    const wrapper = mountModal(); await flushPromises();
    const text = wrapper.text();

    expect(text).toContain('Previous value: Active');
    expect(text).toContain('New value: Paused');
    expect(text).toContain('Previous value: Not set');
    expect(text).toMatch(/New value: 0 0 \* \? \* \* \(.+\)/);
    wrapper.unmount();
  });
});
