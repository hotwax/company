import { api, commonUtil } from "@common";
import { ref } from "vue";
import { refreshAfterMutation } from "@/services/appCacheBootstrap";
import { isCacheReconciliationError } from "@/utils/cacheReconciliationError";
import { normalizeUnigateSendUrl } from "@/utils/maarg";

export type Connection = { exists: boolean; tenantId: string; sendUrl: string; hasKey: boolean | null };
export type CheckResult = { status: "connected" | "incomplete" | "unauthorized" | "unreachable" | "invalid-url" | "invalid-response" | "unavailable" | "route-unavailable" | "error"; checkedAt?: string; carrierApiUnavailable?: boolean };
const unsupported = (error: any) => [404, 405].includes(error?.response?.status ?? error?.status);

export function useUnigateConnection() {
  const connection = ref<Connection>({ exists: false, tenantId: "", sendUrl: "", hasKey: null });
  const loading = ref(true);
  const loadError = ref(false);
  const busy = ref(false);
  const result = ref<CheckResult | null>(null);
  const notice = ref("");

  async function load() {
    loading.value = true;
    loadError.value = false;
    result.value = null;
    try {
      let data: any;
      try {
        const response = await api({ url: "oms/unigate/connection", method: "get" });
        if(commonUtil.hasError(response)) {throw new Error("Connection read failed");}
        data = response.data;
        if(typeof data?.exists !== "boolean" || typeof data?.hasKey !== "boolean") {throw new Error("Invalid connection response");}
        connection.value = { exists: data.exists, tenantId: data.tenantId || "", sendUrl: data.sendUrl || "", hasKey: data.hasKey };
      } catch (error) {
        if(!unsupported(error)) {throw error;}
        // Older OMS versions omit both the secret and its presence flag. Absence is unknown, not false.
        const response = await api({ url: "oms/systemMessageRemotes", method: "get", params: { systemMessageRemoteId: "UNIGATE_CONFIG" } });
        if(commonUtil.hasError(response)) {throw new Error("Connection read failed", { cause: error });}
        const rows = response.data?.systemMessageRemoteList;
        if(!Array.isArray(rows)) {throw new Error("Invalid connection response", { cause: error });}
        const row = rows.find((item: any) => item.systemMessageRemoteId === "UNIGATE_CONFIG");
        connection.value = { exists: !!row, tenantId: row?.internalId || row?.username || "", sendUrl: row?.sendUrl || "", hasKey: row ? null : false };
      }
    } catch {
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function test() {
    busy.value = true;
    result.value = null;
    try {
      const response = await api({ url: "oms/unigate/connection/test", method: "post" });
      if(commonUtil.hasError(response)) {throw new Error("Connection check failed");}
      const allowed = ["connected", "incomplete", "unauthorized", "unreachable", "invalid-url", "invalid-response"];
      if(!allowed.includes(response.data?.status)) {throw new Error("Invalid check response");}
      result.value = { status: response.data.status, checkedAt: response.data.checkedAt };
    } catch (error) {
      if(!unsupported(error)) {
        result.value = { status: "error" };

        return;
      }
      // Older OMS versions already proxy this read-only registry through the saved tenant/key.
      // Use the raw response: useUnigate's provider-list helper substitutes defaults on failure.
      try {
        const response = await api({ url: "oms/shipping/gatewayConfigs", method: "get", cache: false });
        const rows = response.data?.shipGatewayConfigList;
        if(commonUtil.hasError(response) || !Array.isArray(rows) || !rows.every((row: any) => row && typeof row.shippingGatewayConfigId === "string" && row.shippingGatewayConfigId.length > 0)) {
          result.value = { status: "invalid-response" };

          return;
        }
        result.value = { status: "connected", checkedAt: new Date().toISOString() };
        connection.value.hasKey = true;
      } catch (legacyError) {
        // Classify only the status marker, never expose the upstream error body (it may contain secrets).
        const data = (legacyError as any)?.response?.data;
        const errors = typeof data?.errors === "string" ? data.errors : Array.isArray(data?.errors) ? data.errors.filter((item: unknown) => typeof item === "string").join(" ") : "";
        const upstreamStatus = errors.match(/status code[: ]+(\d{3})/i)?.[1];
        if(upstreamStatus === "404") {
          // Older UniGate deployments expose shipGatewayConfig while OMS requests
          // shippingGatewayConfig. Verify authentication through the shared registry,
          // but keep that carrier incompatibility visible instead of claiming it works.
          try {
            const registry = await api({ url: "oms/commGatewayConfigs", method: "get", cache: false });
            const configs = registry.data?.commConfigList;
            if(!commonUtil.hasError(registry) && Array.isArray(configs) && configs.every((row: any) => row && typeof row.commGatewayConfigId === "string" && row.commGatewayConfigId.length > 0)) {
              result.value = { status: "connected", checkedAt: new Date().toISOString(), carrierApiUnavailable: true };
              connection.value.hasKey = true;

              return;
            }
          } catch { /* Keep the original carrier-route error when independent verification fails. */ }
        }
        result.value = { status: upstreamStatus === "404" ? "route-unavailable" : ["401", "403"].includes(upstreamStatus || "") ? "unauthorized" : unsupported(legacyError) ? "unavailable" : "error" };
      }
    } finally {
      busy.value = false;
    }
  }

  async function save(input: { tenantId: string; sendUrl: string; key: string }) {
    busy.value = true;
    notice.value = "";
    result.value = null;
    try {
      const sendUrl = normalizeUnigateSendUrl(input.sendUrl);
      if(!sendUrl) {throw new Error("Invalid UniGate instance URL");}

      const data: Record<string, string> = { systemMessageRemoteId: "UNIGATE_CONFIG", internalId: input.tenantId.trim(), sendUrl };
      if(input.key.trim()) {data.publicKey = input.key.trim();}
      const response = await api({ url: connection.value.exists ? "oms/systemMessageRemotes/UNIGATE_CONFIG" : "oms/systemMessageRemotes", method: connection.value.exists ? "put" : "post", data });
      if(commonUtil.hasError(response)) {throw new Error("Save failed");}
      connection.value = { exists: true, tenantId: data.internalId, sendUrl: data.sendUrl, hasKey: input.key.trim() ? true : connection.value.hasKey };
      try {
        await refreshAfterMutation("systemMessageRemote", { systemMessageRemoteId: "UNIGATE_CONFIG" });
      } catch (error) {
        if(isCacheReconciliationError(error)) {notice.value = "Settings saved. Other screens could not be refreshed; reload them before continuing.";} else {notice.value = "Settings saved. Refresh the page before making more changes.";}
      }

      return true;
    } catch {
      notice.value = "Could not save the connection. Check your access and try again.";

      return false;
    } finally {
      busy.value = false;
    }
  }

  return { connection, loading, loadError, busy, result, notice, load, save, test };
}
