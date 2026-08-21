import { computed, reactive, toRefs } from "vue";
import { api, logger } from "@common";
import cronstrue from "cronstrue";
import { serviceJobCache, serviceJobRunCache } from "@/utils/cacheEntities";
import { useCachedList, useCachedRecord } from "./useCachedList";

/**
 * Service job master entity — job definitions, plus the live detail/history surface.
 *
 * There are TWO read paths here and the split is deliberate:
 *
 *  - `useServiceJobs()` / `useServiceJobRecord()` read the CACHED definitions. Reactive, no
 *    request, and enough for "which jobs exist / are they paused / what are this template's
 *    clones" — the questions list screens ask.
 *  - `useServiceJob()` fetches LIVE. Job detail carries `serviceJobParameters`, runs and audit
 *    history, none of which the cached snapshot holds, and run state changes constantly, so a
 *    detail screen must ask the server rather than read a snapshot.
 *
 * Both expose a `jobs` binding, so mind which one a screen means: `useServiceJobs().jobs` is the
 * cached definition list, `useServiceJob().jobs` is the live working set this module holds.
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
  const { records: cached, hydrated } = useCachedList<any>(serviceJobCache);

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

export const useServiceJobRecord = (jobName: string | undefined) =>
  useCachedRecord(serviceJobCache, "jobName", jobName);

/**
 * Cached runs for one job, newest first — index-backed via `[jobName+startTime]`.
 *
 * Populated by the `serviceJobRun` worker domain, which must be ACTIVATED with the job names a
 * screen needs (there is no route that lists runs across jobs). Without that activation this stays
 * empty rather than falling back to a fetch, keeping the read path request-free by construction.
 */
export function useServiceJobRuns(jobName?: string, limit = 5) {
  const { records, hydrated } = useCachedList<any>(serviceJobRunCache, {
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
  const { records, hydrated } = useCachedList<any>(serviceJobRunCache, { dateField: "startTime" });

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
// Live reads + writes — job detail, runs, audit history
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

/**
 * Every envelope shape these endpoints have been seen to return.
 *
 * The job endpoints are not consistent — bare array, `serviceJobList`, `docs`, `entityValueList` —
 * so the collection is unwrapped defensively rather than assuming one convention.
 */
const getServiceJobs = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.serviceJobs)) return payload.serviceJobs;
  if (Array.isArray(payload?.serviceJobList)) return payload.serviceJobList;
  if (Array.isArray(payload?.jobs)) return payload.jobs;
  if (Array.isArray(payload?.jobList)) return payload.jobList;
  if (Array.isArray(payload?.docs)) return payload.docs;
  if (Array.isArray(payload?.entityValueList)) return payload.entityValueList;
  return [];
};

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
 * Module-level state, shared by every caller of `useServiceJob()` — NOT per-component. The sync
 * screens call it from several components at once and expect one working set.
 */
const state = reactive({
  jobs: [] as Array<any>,
  products: {} as any,
  loading: false
});

const defaultJobFetchParams = {
  instanceOfProductId_op: "empty",
  instanceOfProductId_not: "Y"
};

/**
 * Collapse identical in-flight requests.
 *
 * The sync screens fan out overlapping fetches — several components asking for the same job detail
 * on the same tick — so without this the same request goes out repeatedly.
 */
const pendingRequests = {} as any;
const fetchDeduplicated = async (key: string, fetchFn: () => Promise<any>) => {
  if (pendingRequests[key]) return pendingRequests[key];
  pendingRequests[key] = fetchFn().finally(() => delete pendingRequests[key]);
  return pendingRequests[key];
};

export function useServiceJob() {

  /**
   * CACHE-FIRST. The `serviceJob` domain snapshots every job definition at login, so the cached set
   * is the same data this used to page for — two 250-row requests on every page load.
   *
   * Falls back to the network only while the cache is unpopulated (cold start before the login sync
   * completes, or a filtered query the snapshot cannot answer).
   */
  const fetchJobs = async (params: Record<string, any> = defaultJobFetchParams) => {
    // Normalize params to ensure stable keying (especially for empty objects vs defaults)
    const normalizedParams = (params && Object.keys(params).length > 0) ? params : {};
    const key = `jobs_${JSON.stringify(normalizedParams)}`;

    try {
      const cached = await serviceJobCache.all();
      if (cached.length) {
        state.jobs = cached.map((row: any) => {
          const job = row.raw ?? row;
          return { ...job, cronString: job.cronExpression ? getCronString(job.cronExpression) : "" };
        });
        return state.jobs;
      }
    } catch (err) {
      logger.warn("Service job cache unavailable; falling back to the server", err);
    }

    return fetchDeduplicated(key, async () => {
      state.loading = true;
      try {
        let total = 0;
        let pageIndex = 0;
        let allJobs = [] as any[];
        do {
          const resp = await api({
            url: "admin/serviceJobs",
            method: "GET",
            params: {
              pageSize: 250,
              pageIndex,
              ...normalizedParams
            }
          }) as any;


          const respJobs = getServiceJobs(resp?.data).map((job: any) => ({
            ...job,
            cronString: job.cronExpression ? getCronString(job.cronExpression) : ''
          }));

          total = respJobs.length;
          allJobs = pageIndex > 0 ? allJobs.concat(respJobs) : respJobs;
          pageIndex++;
        } while(total === 250);

        state.jobs = allJobs;
      } catch(err) {
        logger.error("Failed to fetch jobs", err);
        throw err;
      } finally {
        state.loading = false;
      }
    });
  };

  /** Product detail for a product-bound job. Internal: only `fetchJobDetail` needs it. */
  const fetchProductDetail = async (productId: string) => {
    if (state.products[productId]) return;
    return fetchDeduplicated(`product_${productId}`, async () => {
      try {
        const resp = await api({
          url: `oms/products/${productId}`,
          method: "GET"
        }) as any;
        if (resp?.data) {
          state.products[productId] = resp.data;
        }
      } catch(err) {
        logger.error("Failed to fetch product detail", err);
        throw err;
      }
    });
  };

  /**
   * `productStoreId` scopes a store-bound job: a job carrying a `productStoreIds` parameter only
   * counts as "this store's job" when the values match, and is otherwise treated as a draft.
   *
   * Passed in rather than read from a store. It used to come from `productStore.current`, which
   * made the result depend on ambient state only two screens ever set — a caller that had not been
   * through those flows silently got draft-job behaviour.
   */
  const fetchJobDetail = async (jobName: string, productStoreId?: string) => {
    return fetchDeduplicated(`job_detail_${jobName}`, async () => {
      let jobDetails: Record<string, any> = {};
      try {
        const resp = await api({
          url: `admin/serviceJobs/${jobName}`,
          method: "GET",
          params: {
            pageSize: 1000
          }
        }) as any;
        const job = resp?.data?.jobDetail || {};

        const isJobProductStoreDependent = () => job.serviceJobParameters?.some((param: any) => param.parameterName === "productStoreIds");

        if (isJobProductStoreDependent()) {
          const jobProductStore = job.serviceJobParameters.find((param: any) => param.parameterName === "productStoreIds");
          if (jobProductStore?.parameterName && jobProductStore.parameterValue === productStoreId) {
            jobDetails = job;
          } else if (!jobProductStore?.parameterName) {
            jobDetails = { ...job, isDraftJob: true };
          }
        } else {
          jobDetails = job;
        }
      } catch(err) {
        logger.error("Failed to fetch job details", err);
        throw err;
      }

      if (!Object.keys(jobDetails || {}).length) {
        throw new Error(`Service job detail is unavailable for ${jobName}.`);
      }

      const job = getNormalizedJobDetail(jobDetails);
      if (job.instanceOfProductId && !state.products[job.instanceOfProductId]) {
        await fetchProductDetail(job.instanceOfProductId);
      }
      return job;
    });
  };

  const fetchJobRuns = async (jobName: string, payload: any) => {
    const params = {
      pageSize: 250,
      pageIndex: 0,
      orderByField: "-startTime",
      ...payload
    }
    const key = `job_runs_${jobName}_${JSON.stringify(params)}`;

    // CACHE-FIRST: the `serviceJobRun` domain keeps the newest runs per job, which is what every
    // caller here asks for (`pageSize: 1` or a handful, ordered by -startTime).
    try {
      const cached = (await serviceJobRunCache.all())
        .filter((row: any) => row.jobName === jobName)
        .sort((a: any, b: any) => (Number(b.startTime ?? 0) - Number(a.startTime ?? 0)));
      if (cached.length) {
        const wanted = Number(params.pageSize ?? 250);
        return cached.slice(0, wanted).map((row: any) => row.raw ?? row);
      }
    } catch (err) {
      logger.warn("Service job run cache unavailable; falling back to the server", err);
    }

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

  const updateJob = async (payload: any) => {
    return await api({
      url: `admin/serviceJobs/${payload.jobName}`,
      method: "PUT",
      data: payload,
    });
  };

  const runNow = async (jobName: string) => {
    return await api({
      url: `admin/serviceJobs/${jobName}/runNow`,
      method: "POST"
    });
  };

  return {
    ...toRefs(state),
    fetchJobs,
    fetchJobDetail,
    fetchJobRuns,
    fetchJobAuditHistory,
    updateJob,
    runNow
  };
}
