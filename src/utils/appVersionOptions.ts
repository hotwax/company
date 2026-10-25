import { logger } from "@common";
import semver from "semver";


export interface AppDeployment {
  origin: string | null;
  site: string | null;
  available: boolean;
  versions: string[];
  defaultBuild: string | null;
  verifiedAt: string;
  configuredEnvironmentTypeId?: string;
  checks?: Record<string, { version: string; status: "available" | "unavailable" | "unknown"; checkedAt: string; reason?: string }>;
}

/** Version paths support release tags and their optional prerelease suffix. */
const HOSTED_VERSION_PATTERN = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Newest-first, with a stable release ahead of its prereleases. */
function compareNewestFirst(a: string, b: string): number {
  return semver.rcompare(a, b);
}

/** Validate deployed version names and return them newest-first. */
export function sanitizeHostedVersions(appId: string, environmentTypeId: string, versions: string[]): string[] {
  const usable = [...new Set(versions)].filter((version) => {
    if(HOSTED_VERSION_PATTERN.test(version) && semver.valid(version)) {
      return true;
    }

    logger.warn(`Ignoring hosted app version "${version}" for ${appId} in ${environmentTypeId}: expected a v-prefixed semantic version`);

    return false;
  });

  return usable.sort(compareNewestFirst);
}
