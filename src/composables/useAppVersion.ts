import { api, commonUtil, logger, useLiveEntity } from "@common";
import { companyDb } from "@/db/companyDb";
import { computed, ref } from "vue";
import { hostedVersionsFor as legacyHostedVersionsFor, versionsFromManifest } from "@/utils/appVersionOptions";
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

  async function updateAppVersion(payload: { appId: string; environmentTypeId: string; currentVersion: string }) {
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

// Public deployment metadata is not tenant data. Never attach OMS credentials to this request.
export function useHostedAppVersions() {
  const uatVersions = ref<string[]>([]);
  const loading = ref(false);
  const error = ref(false);
  let request: Promise<void> | undefined;

  const refreshHostedVersions = () => {
    if(request) {return request;}
    loading.value = true;
    error.value = false;
    uatVersions.value = [];
    request = (async () => {
      try {
        const response = await fetch("https://job-manager-uat.web.app/hosted-versions.json", { credentials: "omit", cache: "no-store" });
        if(!response.ok) {throw new Error("Could not load hosted versions");}
        uatVersions.value = versionsFromManifest(await response.json(), "JOB_MANAGER", "AppEnvUAT");
      } catch(cause) {
        error.value = true;
        logger.error(cause);
      } finally {
        loading.value = false;
        request = undefined;
      }
    })();

    return request;
  };

  const hostedVersionsFor = (appId: string, environmentTypeId: string) =>
    appId === "JOB_MANAGER" && environmentTypeId === "AppEnvUAT"
      ? uatVersions.value
      : legacyHostedVersionsFor(appId, environmentTypeId);

  return { hostedVersionsFor, refreshHostedVersions, loading, error };
}
