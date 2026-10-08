import {
  ErrorsInstrumentation,
  faro,
  initializeFaro,
  LogLevel,
  PerformanceInstrumentation,
  SessionInstrumentation
} from "@grafana/faro-web-sdk";
import type { LogEvent, LoggerHook, LogLevel as VueLogLevel } from "vue-logger-plugin";
import { commonUtil } from "@common";
import { useUserStore } from "@/store/user";
import { useMaargConfig } from "@/composables/useSeed";

let isInitialised = false;

const parseJson = (value: any, fallback: any = {}) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (err) {
    return fallback;
  }
}

// vue-logger-plugin and Faro happen to share the same level strings, but map them
// explicitly so a change on either side surfaces as a type error rather than silently
// mislabelling every log line.
const faroLogLevel: Record<VueLogLevel, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
  log: LogLevel.LOG
}

/**
 * Ambient context attached to every signal Faro sends — logs, exceptions and events alike.
 *
 * Registered with faro.metas.add() as a *getter*, which Faro re-evaluates on every capture.
 * That is what makes it correct across login, logout and Maarg instance switches without
 * anything having to remember to re-set it.
 *
 * Faro's Meta shape has a fixed set of top-level keys, so arbitrary values go in one of its
 * string attribute bags. Everything here lives under `user.attributes`: nothing else in the
 * app writes that key, whereas `session.attributes` is owned by the session manager and
 * `page` by the page meta, and metas are merged shallowly per top-level key — so sharing
 * one of those would mean silently overwriting what the SDK put there.
 *
 * Every lookup is guarded. This runs during initializeFaro (the session_start event fires
 * before Pinia exists) and after logout, so "not available yet" is a normal state, not an
 * error, and a throw here would take the calling code path down with it.
 */
const appContextMeta = () => {
  const user: Record<string, string> = {};
  const attributes: Record<string, string> = {};

  try {
    const profile = useUserStore().current ?? {};
    if (profile.userId) user.id = String(profile.userId);
    // userLoginId is the username in this codebase; userFullName is the display name.
    if (profile.userLoginId) user.username = String(profile.userLoginId);
    if (profile.userFullName) user.fullName = String(profile.userFullName);
  } catch (err) {
    // Pinia is not active yet, or the store is torn down.
  }

  try {
    // The raw instance identifier ("demo", or a full URL) rather than the derived REST
    // base, so the value matches what an operator would recognise and type.
    const instance = commonUtil.getMaargBaseURL();
    if (instance) attributes.maargInstance = String(instance);

    const instanceInfo: any = useMaargConfig().instanceInfo.value ?? {};
    if (instanceInfo.instanceName) attributes.maargInstanceName = String(instanceInfo.instanceName);
    if (instanceInfo.instancePurpose) attributes.maargInstancePurpose = String(instanceInfo.instancePurpose);
  } catch (err) {
    // No Maarg instance selected yet, or config not loaded.
  }

  if (Object.keys(attributes).length) {
    user.attributes = attributes as any;
  }

  return { user };
}

/**
 * Starts Faro so app logs, unhandled errors and promise rejections reach the collector.
 * No-op when VITE_FARO_COLLECTOR_URL is unset, which is how an environment opts out.
 */
const initialiseFaro = () => {
  if (isInitialised) return;

  const collectorUrl = import.meta.env.VITE_FARO_COLLECTOR_URL;
  if (!collectorUrl) return;

  const versionConfig = parseJson(import.meta.env.VITE_APP_VERSION_CONFIG);
  const versionInfo = parseJson(import.meta.env.VITE_APP_VERSION_INFO);

  initializeFaro({
    url: collectorUrl,
    app: {
      name: versionConfig.appId || "COMPANY",
      version: versionInfo.version,
      environment: versionConfig.environmentTypeId,
      gitHash: versionInfo.revision
    },
    instrumentations: [
      new SessionInstrumentation(),
      new ErrorsInstrumentation(),
      new PerformanceInstrumentation()
    ]
  });

  faro.metas.add(appContextMeta);

  isInitialised = true;
}

/**
 * Forwards logger output to Faro. Registered as an *after* hook so the arguments it
 * receives have already passed through the logger's beforeHooks — RedactSensitiveDataHook
 * included — meaning nothing unredacted is shipped off the device.
 */
const faroLoggerHook: LoggerHook = {
  run(event: LogEvent) {
    if (!isInitialised) return;

    try {
      faro.api.pushLog(event.argumentArray, {
        level: faroLogLevel[event.level] ?? LogLevel.LOG,
        context: event.caller
          ? {
              fileName: String(event.caller.fileName ?? ""),
              functionName: String(event.caller.functionName ?? ""),
              lineNumber: String(event.caller.lineNumber ?? "")
            }
          : undefined
      });
    } catch (err) {
      // Never let telemetry break the calling code path, and never log here — that
      // would re-enter this hook.
    }
  }
}

export const faroUtil = {
  initialiseFaro,
  faroLoggerHook
}
