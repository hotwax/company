/**
 * ServiceJob — domain model + behaviors (pure, Vue-free).
 *
 * The reusable, feature-agnostic logic for one Moqui `ServiceJob` (a scheduled job).
 * Any feature parameterizes suitability with its own template + message type. Leaf
 * module — imports nothing from the app. The reactive loader lives in
 * `@/composables/useServiceJob`.
 */

/** One ServiceJobParameter row as the REST layer serializes it. */
export interface ServiceJobParameter {
  parameterName: string;
  parameterValue: string;
}

/**
 * A ServiceJob as the OMS REST layer serializes it (moqui.service.job.ServiceJob).
 * Field set from the moqui-framework entity. `paused` is the "Y"/"N" indicator.
 */
export interface ServiceJob {
  jobName: string;
  parentJobName?: string;
  description?: string;
  serviceName?: string;
  cronExpression?: string;
  paused?: string;
  serviceJobParameters?: ServiceJobParameter[];
  jobTypeEnumId?: string;
  createdByJobRunId?: string;
}

/** Criteria a job must satisfy to be the suitable, scoped clone of a template. */
export interface ServiceJobSuitability {
  templateJobName: string;
  remoteId: string;
  messageType: string;
  requireBatch?: boolean;
}

/** The job's parameters as a name → value map. */
export function parameterMap(job: ServiceJob | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const parameter of job?.serviceJobParameters ?? []) {
    if (parameter.parameterName) map[parameter.parameterName] = parameter.parameterValue;
  }
  return map;
}

/** True when the job is paused (its cron will not fire). */
export function isPaused(job: ServiceJob | null | undefined): boolean {
  return job?.paused === "Y";
}

function isClonedFrom(job: ServiceJob, templateJobName: string): boolean {
  if (!job.jobName || job.jobName === templateJobName) return false;
  if (job.parentJobName) return job.parentJobName === templateJobName;
  // Legacy clones predate persisted provenance and use the canonical <template>_<id> name.
  return job.jobName.startsWith(`${templateJobName}_`);
}

/** True when the job is the suitable, scoped clone for the given remote + message type. */
export function isSuitable(job: ServiceJob | null | undefined, criteria: ServiceJobSuitability): boolean {
  if (!job || !criteria.remoteId) return false;
  if (!isClonedFrom(job, criteria.templateJobName)) return false;
  const parameters = parameterMap(job);
  if (parameters.systemMessageRemoteId !== criteria.remoteId) return false;
  if (parameters.systemMessageTypeId !== criteria.messageType) return false;
  if (criteria.requireBatch && parameters.runAsBatch !== "true") return false;
  return true;
}

/** The first suitable job for the criteria, or null. */
export function findSuitable(
  jobs: readonly ServiceJob[],
  criteria: ServiceJobSuitability,
): ServiceJob | null {
  return jobs.find((job) => isSuitable(job, criteria)) ?? null;
}

/** The job's lifecycle position. */
export function lifecycleState(job: ServiceJob | null | undefined): "missing" | "paused" | "active" {
  if (!job) return "missing";
  return isPaused(job) ? "paused" : "active";
}
