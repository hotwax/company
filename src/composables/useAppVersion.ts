import { api, commonUtil, logger, useLiveEntity } from "@common";
import { companyDb } from "@/db/companyDb";
import { appVersionCache } from "@/db/appVersionCache";
import { computed, ref } from "vue";
import { AppDeployment, sanitizeHostedVersions } from "@/utils/appVersionOptions";
import { resyncDomain } from "@/db/appDbSync";
import { useTypedEnums } from "./useSeed";

/**
 * App Version master entity — the whole "which build of each app is served per environment" surface
 * in one composable, following the NetSuite pattern (pure CRUD over reference tables):
 *   - READS come from the local cache (synced at login), so the screen opens with no request.
 *   - WRITES call `admin/appVersion` directly and then resync the cached domain, because the pin's
 *     natural key is composite and the endpoint returns nothing useful on write — the cache has to
 *     be re-read for the UI to reflect the change.
 *
 * The environment list is the `AppEnvironment` enum, which is already part of the cached `enum`
 * domain, so it is read through `useTypedEnums` rather than given a domain of its own.
 */

/** The environment enumTypeId whose values every app version is pinned against. */
export const APP_ENVIRONMENT_ENUM_TYPE_ID = "AppEnvironment";

/**
 * The shape a version pin renders as — the projected fields of the `appVersions` entity. There is
 * no synthetic `appVersionKey`: the screen keys rows by `appId` + `environmentTypeId`, which is
 * also the entity's real compound primary key.
 */
export interface AppVersionRecord {
  appId: string;
  appName: string;
  environmentTypeId: string;
  currentVersion: string;
  enumDesc: string;
}

// =============================================================================================
// Reads
// =============================================================================================

/** The configured app version pins, cached at login. */
export function useAppVersions() {
  const { records, hydrated } = useLiveEntity<AppVersionRecord>(companyDb.tables.appVersions);

  /** `${appId}_${environmentTypeId}` → the pin, matching the key the create modal excludes by. */
  const byAppEnv = computed<Record<string, AppVersionRecord>>(() =>
    records.value.reduce((map: Record<string, AppVersionRecord>, row) => {
      map[`${row.appId}_${row.environmentTypeId}`] = row;

      return map;
    }, {}));

  return { appVersions: records, byAppEnv, records, hydrated };
}

/** The app catalog (`admin/apps`) the create modal picks from. */
export function useApps() {
  const { records, hydrated } = useLiveEntity<{ appId: string; appName: string }>(companyDb.tables.apps);

  return { apps: records, hydrated };
}

/** The `AppEnvironment` enum values, from the cached enum domain. */
export function useAppEnvironments() {
  const { values, hydrated } = useTypedEnums(APP_ENVIRONMENT_ENUM_TYPE_ID);

  return { appEnvironments: values, hydrated };
}

// =============================================================================================
// Writes — each resyncs the cached `appVersion` domain it changed
// =============================================================================================

export function useAppVersionMutations() {
  const refreshAppVersions = () => resyncDomain("appVersion");

  // A deployment is keyed by (appId, environmentTypeId); appId is a PATH segment now, so every write
  // targets `admin/apps/{appId}/appVersions`. The full payload is still sent as the body (the path
  // param is redundant with it, matching how other path-scoped writes in this app work).
  const versionsUrl = (appId: string) => `admin/apps/${encodeURIComponent(appId)}/appVersions`;

  async function createAppVersion(payload: { appId: string; environmentTypeId: string; currentVersion: string }) {
    const resp: any = await api({ url: versionsUrl(payload.appId), method: "post", data: payload });
    if(commonUtil.hasError(resp)) {throw resp;}
    await refreshAppVersions();

    return resp;
  }

  async function updateAppVersion(payload: { appId: string; environmentTypeId: string; currentVersion: string | null }) {
    const resp: any = await api({ url: versionsUrl(payload.appId), method: "put", data: payload });
    if(commonUtil.hasError(resp)) {throw resp;}
    await refreshAppVersions();

    return resp;
  }

  async function removeAppVersion(payload: { appId: string; environmentTypeId: string }) {
    const resp: any = await api({ url: versionsUrl(payload.appId), method: "delete", data: payload });
    if(commonUtil.hasError(resp)) {throw resp;}
    await refreshAppVersions();

    return resp;
  }

  return { createAppVersion, updateAppVersion, removeAppVersion, refreshAppVersions };
}

// Public deployment metadata is not tenant data. Never attach OMS credentials.
export function useHostedAppVersions() {
  const deployments = ref<Record<string, AppDeployment>>({});
  const loading = ref(false);
  const error = ref(false);
  const endpoint = import.meta.env.VITE_APP_VERSION_DISCOVERY_URL || "https://us-central1-hotwax-digital-commerce.cloudfunctions.net/appVersions";
  const prefix = (app: string, env: string) => `public-check-v2:${endpoint}:${app}:${env}:`;

  function project(rows: any[]): AppDeployment | undefined {
    const root = rows.find(row => row.version === "");
    if(!root) {return undefined;}
    return {
      origin: root.origin, site: null, available: root.status === "available",
      versions: rows.filter(row => row.version && row.status === "available").map(row => row.version),
      checks: Object.fromEntries(rows.map(row => [row.version, row])),
      defaultBuild: root.defaultBuild || null, configuredEnvironmentTypeId: root.configuredEnvironmentTypeId || undefined,
      verifiedAt: rows.map(row => row.checkedAt).sort()[0]
    };
  }
  async function readCachedHostedVersions(app: string, env: string) {
    return project(await appVersionCache.matching(prefix(app, env)));
  }
  async function refreshHostedVersions(appId: string, environmentTypeId: string, fresh = false, candidates: string[] = []): Promise<AppDeployment> {
    loading.value = true;
    error.value = false;
    const key = `${appId}_${environmentTypeId}`;
    const tags = sanitizeHostedVersions(appId, environmentTypeId, candidates.filter(Boolean));
    try {
      const missing = [];
      for(const version of ["", ...tags]) {
        if(fresh || !await appVersionCache.get(prefix(appId, environmentTypeId) + version)) {missing.push(version);}
      }
      const rows: any[] = [];
      // Each request verifies the root and at most twenty version paths, with bounded service concurrency.
      const versionChecks = missing.filter(Boolean);
      for(let offset = 0; offset < Math.max(versionChecks.length, missing.length ? 1 : 0); offset += 20) {
        const url = new URL(endpoint);
        url.searchParams.set("app", appId);
        url.searchParams.set("environment", environmentTypeId);
        url.searchParams.set("versions", versionChecks.slice(offset, offset + 20).join(","));
        const response = await fetch(url.toString(), { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(60000) });
        if(!response.ok) {throw new Error("Could not check hosted versions");}
        const data = await response.json();
        const expected = ["", ...versionChecks.slice(offset, offset + 20)];
        if(data?.schemaVersion !== 2 || data.appId !== appId || data.environmentTypeId !== environmentTypeId || !Array.isArray(data.checks) || data.checks.length !== expected.length || expected.some(version => data.checks.filter((row: any) => row.version === version).length !== 1) || data.checks.some((row: any) => !["available", "unavailable", "unknown"].includes(row.status) || !Number.isFinite(Date.parse(row.checkedAt)))) {throw new Error("Invalid version check response");}
        for(const row of data.checks) {
          const value = { ...row, origin: data.origin };
          rows.push(value);
          await appVersionCache.put(prefix(appId, environmentTypeId) + row.version, value, row.status === "available" ? 5 * 60000 : row.status === "unavailable" ? 60000 : 0);
        }
      }
      for(const version of ["", ...tags]) {
        if(!rows.some(row => row.version === version)) {
          const cached = await appVersionCache.get(prefix(appId, environmentTypeId) + version, true);
          if(cached) {rows.push(cached);}
        }
      }
      const deployment = project(rows);
      if(!deployment || deployment.checks?.[""]?.status === "unknown") {throw new Error("Could not verify the app deployment");}
      deployments.value[key] = deployment;
      return deployment;
    } catch(cause) {
      delete deployments.value[key];
      error.value = true;
      logger.error(cause);
      throw cause;
    } finally { loading.value = false; }
  }
  const deploymentFor = (app: string, env: string) => deployments.value[`${app}_${env}`];
  const hostedVersionsFor = (app: string, env: string) => deploymentFor(app, env)?.versions ?? [];
  return { hostedVersionsFor, deploymentFor, readCachedHostedVersions, refreshHostedVersions, loading, error };
}
