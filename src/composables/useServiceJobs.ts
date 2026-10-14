import { computed } from "vue";
import { api, logger, useLiveEntity } from "@common";
import cronstrue from "cronstrue";
import { companyDb } from "@/db/companyDb";
import { refreshAfterMutation } from "@/services/appDbSync";
import { isCacheReconciliationError } from "@/utils/db/cacheReconciliationError";
import { onSessionCleared } from "./sessionScope";

/**
 * Service job master entity — job definitions, plus the live detail/history surface.
 *
 * There are TWO read paths here and the split is deliberate:
 *
 *  - `useServiceJobs()` / `useServiceJobRecord()` read the CACHED definitions. Reactive, no
 *    request, and enough for "which jobs exist / are they paused / what are this template's
 *    clones" — the questions list screens ask.
 *  - `useServiceJob()` asks the SERVER. Job detail carries `serviceJobParameters`, and the full
 *    run and audit history is more than the cached snapshot holds, so a detail screen asks for it.
 */

// ---------------------------------------------------------------------------------------------
// Cached reads — job definitions
// ---------------------------------------------------------------------------------------------

/**
 * Service job definitions from the cache.
 *
 * The REST response carries computed scheduling fields (`nextExecutionDateTime`,
 * `cronDescription`) beyond the bare entity, so "when does this run next" is answerable here
 * without touching a job-run endpoint.
 */
export function useServiceJobs() {
  const { records: cached, hydrated } = useLiveEntity<any>(companyDb.tables.serviceJobs);

  /**
   * The LIST and DETAIL routes spell the human schedule differently: the list returns
   * `cronDescription` ("every hour UTC time"), the detail route returns `cronString`. Screens that
   * used to top a list row up with a detail fetch therefore read `cronString`, and reading the cached
   * row alone showed "Not scheduled" for a job that was scheduled fine.
   *
   * Normalising here means one place knows about the two spellings, and a screen can drop its detail
   * fetch without discovering this the hard way. `cronstrue` is the fallback when neither is present.
   */
  const records = computed(() => cached.value.map((job: any) => (
    job?.cronString || !job?.cronExpression
      ? job
      : { ...job, cronString: job.cronDescription || getCronString(job.cronExpression) }
  )));

  const paused = computed(() => records.value.filter((job: any) => job.paused === "Y"));
  const active = computed(() => records.value.filter((job: any) => job.paused !== "Y"));

  /** Jobs whose name matches a template prefix — how sync jobs are cloned per shop. */
  const clonesOf = (templateJobName: string) =>
    records.value.filter((job: any) => String(job.jobName ?? "").startsWith(`${templateJobName}_`));

  return { jobs: records, paused, active, clonesOf, records, hydrated };
}

export const useServiceJobRecord = (jobName: string | undefined) => {
  const { first: record, hydrated } = useLiveEntity<any>(companyDb.tables.serviceJobs, () => jobName ? { equals: { jobName } } : { filter: () => false });
  return { record, hydrated };
};

/**
 * Cached runs for one job, newest first — index-backed via `[jobName+startTime]`.
 *
 * Populated by the `serviceJobRun` worker domain, which must be ACTIVATED with the job names a
 * screen needs (there is no route that lists runs across jobs). Without that activation this stays
 * empty rather than falling back to a fetch, keeping the read path request-free by construction.
 */
export function useServiceJobRuns(jobName?: string, limit = 5) {
  const { records, hydrated } = useLiveEntity<any>(companyDb.tables.serviceJobRuns, {
    dateField: "startTime",
    ...(jobName ? { scope: { field: "jobName", value: jobName } } : {}),
    limit,
  });

  const latest = computed<any>(() => records.value[0]);
  const lastFailed = computed<any>(() => records.value.find((run: any) => run.hasError === "Y"));

  return { runs: records, latest, lastFailed, hydrated };
}

/**
 * Cached runs for SEVERAL jobs at once, grouped by job name — reactive in the job set.
 *
 * `useServiceJobRuns` binds one job name at construction, which does not fit a screen whose jobs are
 * only known after its data resolves (a shop's sync job, plus the pipeline helpers). Those screens
 * were each calling `fetchJobRuns(name, { pageSize: 1 })` per job on entry — three requests for rows
 * the `serviceJobRun` domain is already writing to the cache.
 *
 * One subscription over the table, grouped locally: the cost does not grow with the number of jobs
 * watched, and adding a job to the set costs nothing.
 *
 * ⚠️ Like `useServiceJobRuns`, this returns empty unless the `serviceJobRun` domain has been
 * ACTIVATED with these job names — there is no route listing runs across jobs, so the domain must be
 * told what to watch. Empty here means "not activated", never "no runs".
 */
export function useServiceJobRunsByJob(jobNames: () => string[], limitPerJob = 5) {
  const { records, hydrated } = useLiveEntity<any>(companyDb.tables.serviceJobRuns, { dateField: "startTime" });

  const byJobName = computed<Record<string, any[]>>(() => {
    const wanted = new Set(jobNames().filter(Boolean).map(String));
    const grouped: Record<string, any[]> = {};
    for (const run of records.value) {
      const name = String(run?.jobName ?? "");
      if (!wanted.has(name)) continue;
      const bucket = (grouped[name] ||= []);
      if (bucket.length < limitPerJob) bucket.push(run);
    }
    return grouped;
  });

  /** Newest run per job — what a status card shows. */
  const latestByJobName = computed<Record<string, any>>(() =>
    Object.fromEntries(Object.entries(byJobName.value).map(([name, runs]) => [name, runs[0]])));

  const runsFor = (jobName: string | undefined) => (jobName ? byJobName.value[jobName] ?? [] : []);
  const latestFor = (jobName: string | undefined) => (jobName ? latestByJobName.value[jobName] : undefined);

  return { byJobName, latestByJobName, runsFor, latestFor, hydrated };
}

// ---------------------------------------------------------------------------------------------
// Server reads + writes — job detail, runs, audit history
// ---------------------------------------------------------------------------------------------

const getCronString = (cronExpression: any) => {
  try {
    return cronstrue.toString(cronExpression);
  } catch(e) {
    logger.warn(e);
    return "";
  }
}

const getNormalizedJob = (job: any = {}) => ({
  serviceInParameters: Array.isArray(job?.serviceInParameters) ? job.serviceInParameters : [],
  serviceJobParameters: Array.isArray(job?.serviceJobParameters) ? job.serviceJobParameters : [],
  ...job
});

const getEntityAuditLogs = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (payload?._entity === "moqui.entity.EntityAuditLog") return [payload];
  if (Array.isArray(payload?.entityAuditLogs)) return payload.entityAuditLogs;
  if (Array.isArray(payload?.entityAuditLogList)) return payload.entityAuditLogList;
  if (Array.isArray(payload?.auditLogs)) return payload.auditLogs;
  if (Array.isArray(payload?.auditLogList)) return payload.auditLogList;
  if (Array.isArray(payload?.entityValueList)) return payload.entityValueList;
  if (Array.isArray(payload?.docs)) return payload.docs;
  return [];
};

const getNormalizedJobDetail = (jobDetail: any = {}) => getNormalizedJob(jobDetail);

/**
 * Collapse identical in-flight requests.
 *
 * The sync screens fan out overlapping fetches — several components asking for the same job detail
 * on the same tick — so without this the same request goes out repeatedly.
 */
const pendingRequests = {} as any;

/** `userId` → username for this session: an audit log records who changed a job by id only. */
const usernamesById = new Map<string, Promise<string>>();
onSessionCleared(() => usernamesById.clear());
const fetchDeduplicated = async (key: string, fetchFn: () => Promise<any>) => {
  if (pendingRequests[key]) return pendingRequests[key];
  pendingRequests[key] = fetchFn().finally(() => delete pendingRequests[key]);
  return pendingRequests[key];
};

export function useServiceJob() {

  /**
   * The job as the server has it. Given a `productStoreId`, a job carrying a `productStoreIds`
   * parameter must belong to that store, or the read fails: that is how a screen asks "this store's
   * job". Without one there is no store to check, so the job is returned as it is; gating it anyway
   * failed every store-bound job for callers that only want to show it (the job modal).
   */
  const fetchJobDetail = async (jobName: string, productStoreId?: string) => {
    return fetchDeduplicated(`job_detail_${jobName}_${productStoreId ?? ""}`, async () => {
      let job: Record<string, any>;
      try {
        const resp = await api({
          url: `admin/serviceJobs/${jobName}`,
          method: "GET",
          params: {
            pageSize: 1000
          }
        }) as any;
        job = resp?.data?.jobDetail || {};
      } catch(err) {
        logger.error("Failed to fetch job details", err);
        throw err;
      }

      const storeParameter = job.serviceJobParameters?.find((param: any) => param.parameterName === "productStoreIds");
      if (!Object.keys(job).length || (productStoreId !== undefined && storeParameter && storeParameter.parameterValue !== productStoreId)) {
        throw new Error(`Service job detail is unavailable for ${jobName}.`);
      }

      return getNormalizedJobDetail(job);
    });
  };

  /**
   * A job's runs, always from the server.
   *
   * The `serviceJobRun` domain keeps only the newest few runs per job, so it cannot answer a history
   * read; screens that only need the latest runs read them live through `useServiceJobRuns`.
   */
  const fetchJobRuns = async (jobName: string, payload: any) => {
    const params = {
      pageSize: 250,
      pageIndex: 0,
      orderByField: "-startTime",
      ...payload
    }
    const key = `job_runs_${jobName}_${JSON.stringify(params)}`;

    return fetchDeduplicated(key, async () => {
      let jobRuns = [] as any;
      try {
        const resp = await api({
          url: `admin/serviceJobs/${jobName}/runs`,
          method: "GET",
          params
        }) as any;
        jobRuns = resp?.data || [];
      } catch(err) {
        logger.error("Failed to fetch job runs", err);
        throw err;
      }
      return Array.isArray(jobRuns) ? jobRuns : [];
    });
  };

  const fetchJobAuditHistory = async (jobName: string, payload = { pageSize: 10, pageIndex: 0 }) => {
    const resp = await api({
      url: "admin/entityAuditLogs",
      method: "GET",
      params: {
        pageSize: payload.pageSize,
        pageIndex: payload.pageIndex,
        changedEntityName: "moqui.service.job.ServiceJob",
        pkPrimaryValue: jobName,
        orderByField: "-changedDate"
      }
    }) as any;

    return getEntityAuditLogs(resp?.data);
  };

  /**
   * The username behind each user id, one request per user per session. A user that cannot be read
   * (a system id, a missing permission) stays its id, and is asked again next time.
   */
  const fetchUsernames = async (userIds: string[]): Promise<Record<string, string>> => {
    const entries = await Promise.all([...new Set(userIds.filter(Boolean))].map(async (userId) => {
      if(!usernamesById.has(userId)) {
        usernamesById.set(userId, api({ url: `admin/users/${encodeURIComponent(userId)}`, method: "GET" })
          .then((resp: any) => String(resp?.data?.username || userId))
          .catch(() => {
            usernamesById.delete(userId);

            return userId;
          }));
      }

      return [userId, await usernamesById.get(userId)!] as const;
    }));

    return Object.fromEntries(entries);
  };

  /**
   * The PUT answers with a message, not the updated row, and the LIST screens read the cached
   * definition rather than this response - so without the write-through a job stayed "Paused / No
   * active schedule" on the page that had just activated it, right through a full reload, until the
   * next login sync. The `serviceJob` domain is configured for exactly this (`byPk` +
   * `byPkRecordKey`); it just was not being called.
   */
  const updateJob = async (payload: any) => {
    const resp = await api({
      url: `admin/serviceJobs/${payload.jobName}`,
      method: "PUT",
      data: payload,
    });
    await refreshAfterMutation("serviceJob", { jobName: payload.jobName });
    return resp;
  };

  /**
   * Run state (last run, next run) lives on the job row too, so the cache needs the same nudge.
   *
   * Unlike `updateJob`, a failed nudge does not reject: a run cannot be taken back, and the screens
   * calling this report any rejection as "could not run", which invites a second run. The failure is
   * still recorded as a sync error, so the stale row is reported there.
   */
  const runNow = async (jobName: string) => {
    const resp = await api({
      url: `admin/serviceJobs/${jobName}/runNow`,
      method: "POST"
    });
    try {
      await refreshAfterMutation("serviceJob", { jobName });
    } catch (error) {
      if(!isCacheReconciliationError(error)) throw error;
      logger.warn(`Queued ${jobName}, but its cached job row could not be refreshed`, error);
    }
    return resp;
  };

  return {
    fetchJobDetail,
    fetchJobRuns,
    fetchJobAuditHistory,
    fetchUsernames,
    updateJob,
    runNow
  };
}
