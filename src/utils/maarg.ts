// Known Unigate hostnames per environment. Used by getDefaultUnigateSendUrl
// (to prefill the new-tenant form) and by getUnigateSendUrlWarning (to detect
// when a user configured a URL that points at the wrong environment).
const UNIGATE_HOSTS_BY_ENV: Record<string, string> = {
  production: "unigate.hotwax.io",
  uat: "unigate-uat.hotwax.io",
  dev: "unigate-uat.hotwax.io",
};

const ENV_LABEL: Record<string, string> = {
  production: "production",
  uat: "UAT",
  dev: "dev",
};

// Map an instance's `instancePurpose` (raw string from /admin/maarg) to one of
// our canonical env keys. Anything we don't recognise returns "".
function canonicalEnv(rawPurpose: string): string {
  const purpose = String(rawPurpose || "").trim().toLowerCase();
  if (purpose === "prod" || purpose === "production") return "production";
  if (purpose === "uat") return "uat";
  if (purpose === "dev" || purpose === "development") return "dev";
  return "";
}

// Reverse-lookup: given a Unigate URL, which env does it belong to?
function envForUnigateUrl(sendUrl: string): string {
  const trimmed = String(sendUrl || "").trim();
  if (!trimmed) return "";
  let host = "";
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return "";
  }
  for (const [env, knownHost] of Object.entries(UNIGATE_HOSTS_BY_ENV)) {
    if (host === knownHost) return env;
  }
  return "";
}

export function getMaargInstancePurpose(maargInfo: any) {
  return String(maargInfo?.instanceInfo?.instancePurpose || "").trim().toLowerCase();
}

export function normalizeUnigateSendUrl(sendUrl: string) {
  const trimmedSendUrl = String(sendUrl || "").trim();
  if (!trimmedSendUrl) return "";

  try {
    const url = new URL(trimmedSendUrl);
    const normalizedPath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    return `${url.origin}${normalizedPath}`;
  } catch {
    return trimmedSendUrl.endsWith("/") ? trimmedSendUrl : `${trimmedSendUrl}/`;
  }
}

export function getDefaultUnigateSendUrl(maargInfo: any) {
  const env = canonicalEnv(getMaargInstancePurpose(maargInfo));
  const host = UNIGATE_HOSTS_BY_ENV[env];
  return host ? `https://${host}/rest/s1/unigate/` : "";
}

export function getPreferredUnigateSendUrl(existingSendUrl: string, maargInfo: any) {
  return String(existingSendUrl || "").trim() || getDefaultUnigateSendUrl(maargInfo);
}

// Emit a warning when the configured Unigate URL is recognisably from a
// different environment than the OMS instance. Two signals are checked:
//
// 1. Reverse-lookup: does the configured hostname belong to a known env that
//    differs from this instance? Catches dev-with-prod-url, uat-with-prod-url,
//    prod-with-uat-url, etc. — even when we don't have a "default" URL for the
//    current instance type.
// 2. Default mismatch fallback: if both sides have a known expected URL and
//    they disagree, name them explicitly. (Mostly the same as #1, but covers
//    cases where we only know one side.)
export function getUnigateSendUrlWarning(sendUrl: string, maargInfo: any) {
  const configuredSendUrl = normalizeUnigateSendUrl(sendUrl);
  if (!configuredSendUrl) return "";

  const instanceEnv = canonicalEnv(getMaargInstancePurpose(maargInfo));
  const configuredEnv = envForUnigateUrl(configuredSendUrl);

  // Reverse-lookup signal: configured URL belongs to a known env that doesn't
  // match the instance.
  if (configuredEnv && instanceEnv && configuredEnv !== instanceEnv) {
    const configuredLabel = ENV_LABEL[configuredEnv];
    const instanceLabel = ENV_LABEL[instanceEnv];
    return `This is the ${configuredLabel} Unigate URL configured on a ${instanceLabel} OMS instance. Klaviyo calls will be proxied to the wrong environment.`;
  }

  // Fallback: configured URL is unknown but we have a default for this env and
  // it differs.
  const expectedSendUrl = normalizeUnigateSendUrl(getDefaultUnigateSendUrl(maargInfo));
  if (expectedSendUrl && configuredSendUrl !== expectedSendUrl && instanceEnv) {
    const instanceLabel = ENV_LABEL[instanceEnv];
    return `${instanceLabel} OMS instances are expected to use ${expectedSendUrl}. This tenant is currently using ${configuredSendUrl}.`;
  }

  return "";
}
