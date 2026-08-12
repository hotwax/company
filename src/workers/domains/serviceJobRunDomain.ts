import { serviceJobRunCache } from "@/utils/cacheEntities";
import { type SyncContext, registerSyncDomain } from "../syncRegistry";
import { pageNewestFirst, workerGet } from "./workerFetch";

/**
 * ServiceJobRun — class A (live), fetched PER JOB.
 *
 * ⚠️ There is no jobName-free route: `admin/serviceJobs/{jobName}/runs` is the only list endpoint
 * (finding F2), so a caller must say which jobs it cares about. That is why this domain takes
 * `jobNames` on activation instead of syncing everything — a screen activates it with the two or
 * three jobs its cards display.
 *
 * Finished runs are immutable, so the list cursor is `startTime`. A run already cached without an
 * `endTime` is the exception: ServiceJobRun is updated in place with `endTime`, `hasError`, and
 * `results`, none of which advances that cursor. Those rows are refreshed through the exact
 * source-backed `runs/{jobRunId}` route, bounded by both age and count per explicitly watched job.
 */
const COLLECTION = null; // bare array (verified live 2026-07-27: `[ ]` on a job with no runs)
const DEFAULT_REFRESH_MAX_PER_JOB = 5;
const DEFAULT_REFRESH_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface ServiceJobRunArgs {
  /** The jobs to poll. Nothing is fetched when empty — the same "no scope, no poll" rule as messages. */
  jobNames?: string[];
  /** Runs to keep per job. A card shows the latest one or two; history views ask for more. */
  total?: number;
  batchSize?: number;
  /** Maximum unfinished runs to refresh per watched job on one tick. */
  refreshMaxPerJob?: number;
  /** Stop refreshing an unfinished row after this age so an abandoned run cannot poll forever. */
  refreshMaxAgeMs?: number;
}

async function syncJob(ctx: SyncContext, jobName: string, args: ServiceJobRunArgs): Promise<number> {
  const cursor = await serviceJobRunCache.newestCursor("startTime", {
    field: "jobName",
    value: jobName,
  });

  const runs = await pageNewestFirst({
    ctx,
    url: `admin/serviceJobs/${encodeURIComponent(jobName)}/runs`,
    collectionKey: COLLECTION,
    total: args.total ?? 25,
    batchSize: args.batchSize ?? 25,
    params: { orderByField: "-startTime" },
    // Stop as soon as a page reaches runs already cached for this job.
    keep: cursor === undefined
      ? undefined
      : (page) => page.filter((run: any) => Number(run?.startTime ?? 0) > cursor),
  });

  // `jobName` is only in the URL, not echoed per row, so stamp it in — otherwise the rows cannot be
  // scoped back to their job and the per-job cursor above would see every job at once.
  return serviceJobRunCache.upsertMany(runs.map((run: any) => ({ ...run, jobName })));
}

function exactRunUrl(jobName: string, jobRunId: string): string {
  return `admin/serviceJobs/${encodeURIComponent(jobName)}/runs/${encodeURIComponent(jobRunId)}`;
}

async function fetchRun(ctx: SyncContext, jobName: string, jobRunId: string): Promise<any | undefined> {
  const resp = await workerGet(ctx, exactRunUrl(jobName, jobRunId), {});
  const run = Array.isArray(resp) ? resp[0] : resp;

  return run ? { ...run, jobName } : undefined;
}

/**
 * Re-fetch cached runs that have not reached their terminal write yet.
 *
 * The list feed is deliberately cursor-driven by `startTime`; re-listing cannot detect an update to
 * the same row. The nested one-record route is the verified ServiceJobRun read contract, and keeps
 * this refresh scoped to ids already discovered under the job names the active view requested.
 * Sorting + slicing per job prevents one noisy job from starving another while the age cutoff makes
 * a run that never receives `endTime` self-expiring as a polling target.
 */
async function refreshUnfinished(
  ctx: SyncContext,
  jobNames: string[],
  args: ServiceJobRunArgs,
): Promise<number> {
  const watched = new Set(jobNames);
  const cutoff = Date.now() - (args.refreshMaxAgeMs ?? DEFAULT_REFRESH_MAX_AGE_MS);
  const maxPerJob = Math.max(0, args.refreshMaxPerJob ?? DEFAULT_REFRESH_MAX_PER_JOB);
  if(maxPerJob === 0) {return 0;}

  const candidates = (await serviceJobRunCache.all()).filter((row: any) =>
    watched.has(String(row?.jobName ?? "")) &&
    row?.endTime === undefined &&
    typeof row?.startTime === "number" && row.startTime > cutoff &&
    Boolean(row?.jobRunId));

  const targets: any[] = [];
  for(const jobName of jobNames) {
    targets.push(...candidates
      .filter((row: any) => row.jobName === jobName)
      .sort((left: any, right: any) => Number(right.startTime) - Number(left.startTime))
      .slice(0, maxPerJob));
  }

  const refreshed: any[] = [];
  for(const cached of targets) {
    try {
      const run = await fetchRun(ctx, String(cached.jobName), String(cached.jobRunId));
      if(run) {refreshed.push(run);}
    } catch {
      // One transient run-detail failure must not hide fresh runs for the remaining watched jobs.
      // The bounded candidate stays eligible for the next worker tick.
    }
  }

  return serviceJobRunCache.upsertMany(refreshed);
}

registerSyncDomain({
  name: "serviceJobRun",
  intervalMs: 10_000,
  async sync(ctx, args: ServiceJobRunArgs = {}) {
    const jobNames = [...new Set((args.jobNames ?? []).filter(Boolean))];
    if(!jobNames.length) {return 0;}

    let written = 0;
    for(const jobName of jobNames) {
      written += await syncJob(ctx, jobName, args);
    }

    return written + await refreshUnfinished(ctx, jobNames, args);
  },
  async refetchOne(ctx, pk) {
    const jobRunId = pk?.jobRunId;
    const jobName = pk?.jobName;
    if(!jobRunId || !jobName) {return 0;}
    const run = await fetchRun(ctx, String(jobName), String(jobRunId));

    return run ? serviceJobRunCache.upsertMany([run]) : 0;
  },
});
