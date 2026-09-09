import { describe, expect, it } from 'vitest';
import { serviceJobRunStatus } from '@/utils/serviceJobRun';

describe('serviceJobRunStatus', () => {
  it('requires completed execution and explicit no-error evidence for raw success', () => {
    expect(serviceJobRunStatus({ startTime: 1, endTime: 2, hasError: 'N' })).toBe('Completed');
    expect(serviceJobRunStatus({ startTime: 1, hasError: 'N' })).toBe('In progress');
    expect(serviceJobRunStatus({ startTime: 1, endTime: 2 })).toBe('');
  });
  it('keeps failures and terminated executions distinct from success', () => {
    expect(serviceJobRunStatus({ startTime: 1, endTime: 2, hasError: 'Y' })).toBe('Failed');
    expect(serviceJobRunStatus({ runStatus: 'SUCCESSFUL', errors: 'Posting failed' })).toBe('Failed');
    expect(serviceJobRunStatus({ endTime: 2, hasError: 'N' })).toBe('Terminated');
  });
  it('preserves explicit statuses and does not invent a status for missing data', () => {
    expect(serviceJobRunStatus({ runStatus: 'RUNNING' })).toBe('RUNNING');
    expect(serviceJobRunStatus({})).toBe('');
  });
});
