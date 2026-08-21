import { computed } from "vue";
import { api, commonUtil } from "@common";
import { translate } from "@/i18n";
import { appCache, appVersionCache } from "@/utils/cacheEntities";
import { resyncDomain } from "@/services/appCacheBootstrap";
import { useCachedList } from "./useCachedList";
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
 * The shape a version pin renders as. These are the RAW server fields from `admin/appVersion`
 * (`useCachedList` hands back `row.raw`, not the projected row), so the synthetic `appVersionKey`
 * is deliberately absent — the screen keys rows by `appId` + `environmentTypeId`.
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
  const { records, hydrated } = useCachedList<AppVersionRecord>(appVersionCache);

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
  const { records, hydrated } = useCachedList<{ appId: string; appName: string }>(appCache);
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
    if (commonUtil.hasError(resp)) throw resp;
    await refreshAppVersions();
    return resp;
  }

  async function updateAppVersion(payload: { appId: string; environmentTypeId: string; currentVersion: string }) {
    const resp: any = await api({ url: versionsUrl(payload.appId), method: "put", data: payload });
    if (commonUtil.hasError(resp)) throw resp;
    await refreshAppVersions();
    return resp;
  }

  async function removeAppVersion(payload: { appId: string; environmentTypeId: string }) {
    const resp: any = await api({ url: versionsUrl(payload.appId), method: "delete", data: payload });
    if (commonUtil.hasError(resp)) throw resp;
    await refreshAppVersions();
    return resp;
  }

  return { createAppVersion, updateAppVersion, removeAppVersion, refreshAppVersions };
}

/**
 * Validate a version string. Preserves the old app's rule verbatim: it must start with `v` and have
 * at least three dot-separated, non-empty segments (e.g. `v1.0.0`).
 */
export function appVersionError(version: string): string {
  const trimmed = version.trim();
  const segmentsFilled = trimmed.split(".").every((segment) => segment);
  if (!segmentsFilled || !trimmed.startsWith("v") || trimmed.split(".").length < 3) {
    return translate("Enter a valid version number, it should be in format v1.0.0");
  }
  return "";
}
