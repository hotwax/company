// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IonFabButton, IonInput, IonModal, IonRadioGroup, IonToggle, alertController } from '@ionic/vue';
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
enableAutoUnmount(afterEach);

const job = (over: Record<string, unknown> = {}) => ({
  jobName: 'JOB1', description: 'Purges settled rows', serviceName: 'svc#Purge', paused: 'N', cronExpression: '0 0 * ? * *',
  executionTimeZone: 'America/Los_Angeles',
  serviceJobParameters: [
    { parameterName: 'shopId', parameterValue: '100002' }, { parameterName: 'inventoryChannelId', parameterValue: 'IC_1' },
    { parameterName: 'daysToKeep', parameterValue: '5' },
  ],
  serviceInParameters: [
    { name: 'daysToKeep', type: 'Integer', default: 5, required: 'true' }, { name: 'purgeUnsynced', type: 'Boolean' }, { name: '_jobRunId' },
  ],
  ...over,
});
const input = (wrapper: any, label: string) => wrapper.findAllComponents(IonInput).find((field: any) => field.props('label') === label);
const dirty = (wrapper: any) => !wrapper.findComponent(IonModal).props('backdropDismiss');
const save = async (wrapper: any) => { await wrapper.findComponent(IonFabButton).trigger('click'); await flushPromises(); };
const RECONCILED = 'The server change was saved, but this view could not be refreshed. Refresh before retrying.';
beforeEach(() => {
  vi.clearAllMocks();
  api.detail.mockResolvedValue(job()); api.runs.mockResolvedValue([]); api.audits.mockResolvedValue([]); api.usernames.mockResolvedValue({});
});

describe('job modal load identity and dismissal', () => {
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
    alert.mockRestore();
  });
  it('preserves the dirty guard for a real user edit after loading', async () => {
    const wrapper = mountModal(); await flushPromises();
    expect(dirty(wrapper)).toBe(false);
    wrapper.findComponent(IonToggle).vm.$emit('ionChange', { detail: { checked: false } }); await flushPromises();
    expect(dirty(wrapper)).toBe(true);
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
  });
  it('rejects a mismatched job response', async () => {
    api.detail.mockResolvedValue({ jobName: 'OTHER', paused: 'N' });
    const wrapper = mountModal(); await flushPromises();
    expect(wrapper.text()).toContain('Sync job details unavailable');
    expect(wrapper.findComponent(IonToggle).exists()).toBe(false);
    expect(await wrapper.findComponent(IonModal).props('canDismiss')()).toBe(true);
  });
});

describe('job modal content', () => {
  it('is titled by the job name, states its schedule in the job time zone, and guards identity parameters', async () => {
    const wrapper = mountModal(); await flushPromises();
    expect(wrapper.find('ion-title').text()).toBe('JOB1');
    expect(wrapper.text().split('JOB1')).toHaveLength(2);
    expect(wrapper.text()).toContain('Purges settled rows');
    expect(wrapper.text()).toContain('Every hour (America/Los_Angeles)');
    // Identity parameters are read only unless the screen names one as an input.
    expect(input(wrapper, 'shopId').props('disabled')).toBe(true);
    expect(input(wrapper, 'shopId').props('helperText')).toBe('read only');
    expect(input(wrapper, 'inventoryChannelId').props('disabled')).toBe(true);
    await wrapper.setProps({ editableParameterNames: ['inventoryChannelId'] });
    expect(input(wrapper, 'inventoryChannelId').props('disabled')).toBe(false);
    // The service signature is the field's helper text; outlined, outside ion-item, which clips an outline label.
    expect(input(wrapper, 'daysToKeep').props()).toMatchObject({ helperText: 'Integer, default {value}, required', fill: 'outline', disabled: false });
    expect(input(wrapper, 'daysToKeep').element.closest('ion-item')).toBeNull();
    // Only the parameters the job does not set are listed, without Moqui's own underscore ones.
    expect(wrapper.text()).toContain('Not set on this job');
    expect(wrapper.text()).toContain('purgeUnsynced');
    expect(wrapper.text()).not.toContain('_jobRunId');
    expect(wrapper.findAll('ion-label').some((label) => label.text().includes('daysToKeep'))).toBe(false);
  });

  it('shows what each run did with its status once, and each audited change by username in words', async () => {
    api.runs.mockResolvedValue([
      { jobRunId: 'R2', startTime: 10_000, endTime: 10_222, hasError: 'N', results: JSON.stringify({ recordsRemoved: 20, ageOnlyDetailRecordsRemoved: 0 }) },
      { jobRunId: 'R1', startTime: 1_000, endTime: 4_000, hasError: 'Y', results: '{}', errors: 'Lock wait timeout exceeded' },
    ]);
    api.audits.mockResolvedValue([
      { auditHistorySeqId: '2', changedFieldName: 'paused', oldValueText: 'N', newValueText: 'Y', changedByUserId: '100002', changedDate: 20 },
      { auditHistorySeqId: '1', changedFieldName: 'cronExpression', oldValueText: null, newValueText: '0 0 * ? * *', changedDate: 10 },
    ]);
    api.usernames.mockResolvedValue({ 100002: 'aditya.patel' });
    const wrapper = mountModal(); await flushPromises();
    const runs = wrapper.findAll('ion-item').map((row) => row.text()).filter((text) => text.includes('{duration}'));
    expect(runs).toHaveLength(2);
    expect(runs[0]).toContain('Records removed: 20');
    expect(runs[0]).not.toContain('Removed for age only');
    expect(runs[0].split('Completed')).toHaveLength(2);
    expect(runs[1]).toContain('Lock wait timeout exceeded');
    expect(api.usernames.mock.calls[0][0]).toContain('100002');
    expect(wrapper.text()).toContain('Changed by: aditya.patel');
    for(const line of ['Previous value: Active', 'New value: Paused', 'Previous value: Not set']) {expect(wrapper.text()).toContain(line);}
    expect(wrapper.text()).toMatch(/New value: 0 0 \* \? \* \* \(.+\)/);
  });

  it.each([
    { saved: '0 0/30 * * * ?', preset: '0 0/30 * * * ?' },
    { saved: '0 */30 * ? * *', preset: '0 0/30 * * * ?' },
    { saved: '0 0/5 * * * ?', preset: undefined },
  ])('selects the preset a saved schedule is, in either spelling ($saved)', async ({ saved, preset }) => {
    api.detail.mockResolvedValue(job({ cronExpression: saved }));
    const wrapper = mountModal(); await flushPromises();
    // With nothing selected Ionic's wrapper reports its own empty-value symbol, not undefined.
    const value = wrapper.findComponent(IonRadioGroup).props('value');
    expect(typeof value === 'string' ? value : undefined).toBe(preset);
    if(!preset) {return;}
    // Its own preset keeps the saved spelling, so it is no change; another preset writes the stored form.
    wrapper.findComponent(IonRadioGroup).vm.$emit('ionChange', { detail: { value: preset } }); await flushPromises();
    expect(dirty(wrapper)).toBe(false);
    wrapper.findComponent(IonRadioGroup).vm.$emit('ionChange', { detail: { value: '0 0 * * * ?' } }); await flushPromises();
    expect(input(wrapper, 'Quartz cron expression').props('modelValue')).toBe('0 0 * * * ?');
  });
});

describe('job modal committed writes', () => {
  it('closes a save whose write landed but whose cache refresh failed, without sending it again', async () => {
    api.update.mockRejectedValue(new CacheReconciliationError('serviceJob', { jobName: 'JOB1' }));
    const wrapper = mountModal(); await flushPromises();
    wrapper.findComponent(IonToggle).vm.$emit('ionChange', { detail: { checked: false } }); await flushPromises();
    await save(wrapper);
    expect(commonUtil.showToast).toHaveBeenLastCalledWith(RECONCILED);
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(await wrapper.findComponent(IonModal).props('canDismiss')()).toBe(true);
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it('retries only what has not landed, one field of a screen-owned save at a time', async () => {
    const saveHandler = vi.fn().mockRejectedValueOnce(new CacheReconciliationError('serviceJob', { jobName: 'JOB1' })).mockResolvedValue(undefined);
    api.update.mockRejectedValueOnce(new Error('daysToKeep must be at least 1')).mockResolvedValue({});
    const wrapper = mountModal({ saveHandler }); await flushPromises();
    input(wrapper, 'Quartz cron expression').vm.$emit('update:modelValue', '0 0 0 ? * *');
    wrapper.findComponent(IonToggle).vm.$emit('ionChange', { detail: { checked: false } });
    input(wrapper, 'daysToKeep').vm.$emit('ionInput', { detail: { value: '7' } }); await flushPromises();

    // The schedule landed but its refresh failed; then the pause landed and the parameters failed.
    await save(wrapper); await save(wrapper);
    expect(wrapper.emitted('close')).toBeUndefined();
    await save(wrapper);
    expect(saveHandler.mock.calls).toEqual([[{ cronExpression: '0 0 0 ? * *' }], [{ paused: true }]]);
    expect(api.update.mock.calls).toEqual([1, 2].map(() => [{ jobName: 'JOB1', serviceJobParameters: [{ parameterName: 'daysToKeep', parameterValue: '7' }] }]));
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('reloads after a run whose cache refresh failed, because the run was queued', async () => {
    api.run.mockRejectedValue(new CacheReconciliationError('serviceJob', { jobName: 'JOB1' }));
    const wrapper = mountModal(); await flushPromises();
    await wrapper.findAll('ion-button').find((button) => button.text() === 'Run now')!.trigger('click'); await flushPromises();
    expect(commonUtil.showToast).toHaveBeenLastCalledWith(RECONCILED);
    expect(api.detail).toHaveBeenCalledTimes(2);
  });
});
