import { logger } from "@common";

/**
 * Hosted app versions, per app AND per environment — the only versions the App Version screen
 * offers for pinning.
 *
 * ⚠️ HAND-MAINTAINED. A version is reachable only if it was built into that app's `dist/` and
 * listed in that app's `firebase.json` rewrites for that hosting target. There is no OMS resource
 * that lists hosted versions, so this map mirrors those rewrites by hand: add an entry when a
 * version is hosted, remove it when a version is pruned.
 *
 * Keyed by environment because hosting targets drift apart in practice — a new build lands on `dev`
 * before it reaches `prod`, and a version pinnable on one must not be offered for the other. The
 * rewrite lists happen to be identical across targets today, hence the repetition below.
 *
 * Baked in at build time, so hosting a new version needs a company-app rebuild + redeploy before it
 * can be pinned. Replace this with a server-driven source if the OMS ever exposes one.
 */
const HOSTED_APP_VERSIONS: Record<string, Record<string, string[]>> = {
  JOB_MANAGER: {
    AppEnvDev: [],
    AppEnvUAT: ["v3.3.0"],
    AppEnvProd: ["v3.3.0"]
  },
  COMPANY: {
    AppEnvDev: [],
    AppEnvUAT: ["v2.2.2"],
    AppEnvProd: ["v2.2.2"]
  },
};

/**
 * Mirrors the module-private `VERSION_SEGMENT_PATTERN` in `common/utils/appVersionUtil.ts` — the
 * pattern `getVersionedPathInfo` uses to decide whether a URL is versioned at all. A value that
 * fails it looks unversioned to the router guard, so it could never work as a pin. Duplicated
 * rather than exported from `common/` to keep this change inside `apps/company`.
 */
const HOSTED_VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;

/** Newest-first. Safe only for values that passed `HOSTED_VERSION_PATTERN`. */
function compareNewestFirst(a: string, b: string): number {
  const left = a.slice(1).split(".").map(Number);
  const right = b.slice(1).split(".").map(Number);

  for(let index = 0; index < 3; index += 1) {
    if(left[index] !== right[index]) {
      return right[index] - left[index];
    }
  }

  return 0;
}

/**
 * The usable versions from a hand-written list, newest-first.
 *
 * Takes the list as an argument rather than reading the map so it can be exercised directly — the
 * hand-edited map is the one place a malformed version can still enter the system.
 */
export function sanitizeHostedVersions(appId: string, environmentTypeId: string, versions: string[]): string[] {
  const usable = versions.filter((version) => {
    if(HOSTED_VERSION_PATTERN.test(version)) {
      return true;
    }

    logger.warn(`Ignoring hosted app version "${version}" for ${appId} in ${environmentTypeId}: expected vX.Y.Z`);

    return false;
  });

  return usable.sort(compareNewestFirst);
}

/**
 * The versions this deployment can pin for `appId` in `environmentTypeId`, newest-first. Empty when
 * none are hosted for that combination.
 */
export function hostedVersionsFor(appId: string, environmentTypeId: string): string[] {
  return sanitizeHostedVersions(appId, environmentTypeId, HOSTED_APP_VERSIONS[appId]?.[environmentTypeId] ?? []);
}

/**
 * The environments that have at least one hosted version for `appId`. The create modal offers only
 * these, so an environment with nothing to pin never appears.
 */
export function hostedEnvironmentsFor(appId: string): string[] {
  return Object.keys(HOSTED_APP_VERSIONS[appId] ?? {})
    .filter((environmentTypeId) => hostedVersionsFor(appId, environmentTypeId).length);
}

/** The mapped app ids, for tests. */
export const hostedAppVersionAppIds = Object.keys(HOSTED_APP_VERSIONS);
