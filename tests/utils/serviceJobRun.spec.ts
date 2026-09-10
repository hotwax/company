import { describe, expect, it, vi } from 'vitest';

// translate() is identity here so the assertions read as the labels themselves, and formatDateTime is
// pinned: a real one would make the cutoff assertion depend on the runner's timezone.
vi.mock('@common', () => ({ translate: (key: string) => key }));
vi.mock('@/utils', () => ({ formatDateTime: () => 'Sep 9, 2026, 6:08 PM' }));

import { describeRunParameters, describeRunResult, serviceJobRunStatus } from '@/utils/serviceJobRun';

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

/** The payload shape a publisher run actually records on a live instance. */
const PUBLISHER_PARAMETERS = JSON.stringify({
  inventoryChannelId: 'M100001', maxChangeCount: 100, maxPasses: 5000, authUsername: 'codex.aditya',
  groupByFields: 'inventoryChannelId,shopifyInventoryItemId,eventTypeId', maxPassRetries: 3,
  staleSendingMinutes: 60,
});

describe('describeRunParameters', () => {
  it('separates what the run covered from how it was tuned', () => {
    const { scope, tuning } = describeRunParameters(PUBLISHER_PARAMETERS);

    expect(scope.map((row) => [row.label, row.value])).toEqual([
      ['Run by', 'codex.aditya'],
      ['Inventory channel', 'M100001'],
    ]);
    expect(tuning.map((row) => row.label)).toEqual([
      'Grouped by', 'Changes per batch', 'Retries per pass', 'Pass limit', 'Stale send timeout in minutes',
    ]);
  });

  it('orders rows by the map, not by the order the service serialised its keys in', () => {
    const reordered = JSON.stringify({ shopId: '10000', authUsername: 'codex.aditya' });

    expect(describeRunParameters(reordered).scope.map((row) => row.label)).toEqual(['Run by', 'Shop']);
  });

  it('shows a key no label covers under its own name rather than dropping it', () => {
    const { scope } = describeRunParameters(JSON.stringify({ shopId: '10000', newFieldId: 'X1' }));

    expect(scope.map((row) => [row.label, row.value])).toEqual([['Shop', '10000'], ['newFieldId', 'X1']]);
  });

  it('yields no rows when there is nothing structured to read, so callers fall back to the raw text', () => {
    expect(describeRunParameters('inventoryChannelId: M100001')).toEqual({ scope: [], tuning: [] });
    expect(describeRunParameters('{}')).toEqual({ scope: [], tuning: [] });
    expect(describeRunParameters(undefined)).toEqual({ scope: [], tuning: [] });
  });
});

describe('describeRunResult', () => {
  it('labels the figures a publisher run reports and says why it stopped', () => {
    const results = JSON.stringify({
      failedPassCount: 0, remainingPendingCount: 0, createdMessageCount: 168,
      stoppedReason: 'queue-empty', requeuedSendingCount: 0, passCount: 168,
    });

    expect(describeRunResult(results).map((row) => [row.label, row.value])).toEqual([
      ['Messages created', '168'],
      ['Failed passes', '0'],
      ['Passes run', '168'],
      ['Still pending', '0'],
      ['Re-queued from sending', '0'],
      ['Stopped because', 'the queue was empty'],
    ]);
  });

  it('omits dataManagerLogId, which the import panel under the card already names', () => {
    const results = JSON.stringify({ dataManagerLogId: 'M101123', batchCount: 19, candidateCount: 1874 });

    expect(describeRunResult(results).map((row) => [row.label, row.value])).toEqual([
      ['Batches', '19'],
      ['Candidates', '1874'],
    ]);
  });

  it('reports a collection by size, which is the part that used to flood the card', () => {
    const results = JSON.stringify({ recordsRemoved: [1, 2, 3], nested: { skip: true } });

    expect(describeRunResult(results).map((row) => [row.label, row.value])).toEqual([['Records removed', '3']]);
  });

  it('formats the cutoff as a date and passes an unmapped stop reason through', () => {
    const results = JSON.stringify({ cutoffTimestamp: 1757467680000, stoppedReason: 'something-new' });

    expect(describeRunResult(results).map((row) => [row.label, row.value])).toEqual([
      ['Cutoff', 'Sep 9, 2026, 6:08 PM'],
      ['Stopped because', 'something-new'],
    ]);
  });

  it('yields no rows for prose or an empty payload, so the fallback sentence shows instead', () => {
    expect(describeRunResult('The job reported an error')).toEqual([]);
    expect(describeRunResult('{}')).toEqual([]);
    expect(describeRunResult(null)).toEqual([]);
  });
});
