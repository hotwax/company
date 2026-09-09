import { serviceJobRunCache } from "@/utils/cacheEntities";
import { registerSyncDomain, type SyncContext } from "../syncRegistry";
import { pageNewestFirst, workerGet } from "./workerFetch";

/**
 * ServiceJobRun — class A (live), fetched PER JOB.
 *
 * ⚠️ There is no jobName-free route: `admin/serviceJobs/{jobName}/runs` is the only list endpoint
 * (finding F2), so a caller must say which jobs it cares about. That is why this domain takes
 * `jobNames` on activation instead of syncing everything — a screen activates it with the two or
 * three jobs its cards display.
 *
 * Runs are immutable once finished, so the cursor is `startTime` and a quiet tick costs one small
 * page per job and writes nothing.
 */
const COLLECTION = null; // bare array (verified live 2026-07-27: `[ ]` on a job with no runs)

export interface ServiceJobRunArgs {
  /** The jobs to poll. Nothing is fetched when empty — the same "no scope, no poll" rule as messages. */
  jobNames?: string[];
  /** Runs to keep per job. A card shows the latest one or two; history views ask for more. */
  total?: number;
  batchSize?: number;
}

/** Boundary cursors confirmed terminal during this worker lifetime; terminal rows are immutable. */
const terminalBoundaryByJob = new Map<string, number>();

async function syncJob(ctx: SyncContext, jobName: string, args: ServiceJobRunArgs): Promise<number> {
  const cursor = await serviceJobRunCache.newestCursor("startTime", {
    field: "jobName",
    value: jobName,
  });
  // A running row keeps the same startTime when it later gains endTime/hasError. Include that
  // boundary until it becomes terminal; otherwise the strict cursor permanently freezes the cached
  // row in its running state. Once terminal, resume the normal strict `>` cursor and quiet ticks.
  // The worker-local terminal clock avoids scanning an ever-growing run cache every 10 seconds. On
  // a worker restart the current boundary is read once, then becomes quiet again if already done.
  const refreshBoundary = cursor !== undefined && terminalBoundaryByJob.get(jobName) !== cursor;

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
      : (page) => page.filter((run: any) => {
        const startTime = Number(run?.startTime ?? 0);

        return startTime > cursor || (refreshBoundary && startTime === cursor);
      }),
  });
  if(cursor !== undefined && refreshBoundary) {
    const boundary = runs.find((run: any) => Number(run?.startTime ?? 0) === cursor);
    if(boundary?.endTime !== undefined && boundary?.endTime !== null && boundary?.endTime !== "") {
      terminalBoundaryByJob.set(jobName, cursor);
    }
  }

  // `jobName` is only in the URL, not echoed per row, so stamp it in — otherwise the rows cannot be
  // scoped back to their job and the per-job cursor above would see every job at once.
  return serviceJobRunCache.upsertMany(runs.map((run: any) => ({ ...run, jobName })));
}

registerSyncDomain({
  name: "serviceJobRun",
  intervalMs: 10_000,
  async sync(ctx, args: ServiceJobRunArgs = {}) {
    const jobNames = [...new Set((args.jobNames ?? []).filter(Boolean))];
    if (!jobNames.length) return 0;

    let written = 0;
    for (const jobName of jobNames) {
      written += await syncJob(ctx, jobName, args);
    }
    return written;
  },
  async refetchOne(ctx, pk) {
    const jobRunId = pk?.jobRunId;
    const jobName = pk?.jobName;
    if (!jobRunId || !jobName) return 0;
    const resp = await workerGet(ctx, `admin/serviceJobs/${encodeURIComponent(String(jobName))}/runs/${encodeURIComponent(String(jobRunId))}`, {});
    const run = Array.isArray(resp) ? resp[0] : resp;
    return run ? serviceJobRunCache.upsertMany([{ ...run, jobName }]) : 0;
  },
});
