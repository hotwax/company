/** Normalize both the run-history view and raw Moqui ServiceJobRun records. */
export function serviceJobRunStatus(run: Record<string, any>): string {
  if (run.hasError === 'Y' || run.hasError === true || run.errors) return 'Failed';
  const explicit = run.runStatus || run.statusId || run.status;
  if (explicit) return String(explicit);
  if (run.endTime || run.completedAt) {
    if (!run.startTime && !run.startedAt) return 'Terminated';
    return run.hasError === 'N' || run.hasError === false ? 'Completed' : '';
  }
  if (run.startTime || run.startedAt) return 'In progress';
  return '';
}
