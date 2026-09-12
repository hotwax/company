import { computed, onScopeDispose, ref, watch } from "vue";
import { api, commonUtil } from "@common";
import { useAuth } from "@/composables/useSecurity";
import { onSessionCleared } from "@/composables/sessionScope";
import { getMcpConnection } from "@/utils/mcpSetup";

const unavailable = "This instance needs a backend update to generate tokens from Company. Use JWT token settings in OMS for now.";
const unconfirmed = "Token generation could not be confirmed. Open JWT token settings in OMS for help.";

/** Credentials are view-scoped and never written to the cache, store, logs, or storage. */
export function useMcpToken(selectedEndpoint: () => string | undefined) {
  const { userProfile } = useAuth();
  const username = computed(() => String(userProfile.value?.username || ""));
  const token = ref("");
  const expirationTime = ref<number>();
  const expireDays = ref(30);
  const pending = ref(false);
  const error = ref("");
  let requestId = 0;

  const clear = () => {
    requestId++;
    token.value = "";
    expirationTime.value = undefined;
    error.value = "";
  };

  // Invalidate an in-flight response too, so leaving/logging out cannot resurrect a token.
  watch([username, selectedEndpoint], clear, { flush: "sync" });
  const unregister = onSessionCleared(clear);
  onScopeDispose(() => { clear(); unregister(); });

  function failure(status?: number) {
    // Older routes can interpret jwtToken as a partyId and return 405.
    if (status === 404 || status === 405) return unavailable;
    if (status === 401) return "Your session has expired. Sign in again before generating a token.";
    if (status === 403) return "OMS did not authorize token generation through Company. You may still be able to generate a token in JWT token settings in OMS.";
    return unconfirmed;
  }

  async function generate() {
    if (pending.value || token.value) return;
    clear();
    const current = getMcpConnection(commonUtil.getMaargURL());
    if (!username.value || !current || current.endpoint !== selectedEndpoint()) {
      error.value = "Generate a token for your signed-in OMS instance. Sign in to another instance before generating its token.";
      return;
    }
    if (![1, 7, 30, 90, 180, 365].includes(expireDays.value)) {
      error.value = "Choose a token expiry of 1, 7, 30, 90, 180, or 365 days.";
      return;
    }

    const thisRequest = requestId;
    const owner = username.value;
    pending.value = true;
    try {
      const response = await api({
        // The admin REST path inherits the same application authorization model as
        // the OMS screen. Generic RPC lacks that inherited service authorization.
        baseURL: `${current.endpoint.slice(0, -"mcp/json".length)}rest/s1/`,
        url: "admin/user/jwtToken",
        method: "post",
        data: { username: owner, purpose: "MCP", expireDays: expireDays.value },
      });
      if (thisRequest !== requestId) return;
      if (username.value !== owner || getMcpConnection(commonUtil.getMaargURL())?.endpoint !== current.endpoint) {
        clear();
        return;
      }
      const result = response.data;
      if (result?.errorCode) {
        error.value = failure(Number(result.errorCode));
      } else if (typeof result?.token !== "string" || !result.token.trim() || !Number.isFinite(result.expirationTime) || result.expirationTime <= Date.now()) {
        error.value = unconfirmed;
      } else {
        token.value = result.token;
        expirationTime.value = result.expirationTime;
      }
    } catch (cause: unknown) {
      if (thisRequest !== requestId) return;
      // Never log/throw an Axios response: it may contain a token or authorization header.
      const response = (cause as { response?: { status?: number; data?: { errorCode?: number } } })?.response;
      error.value = failure(response?.data?.errorCode ?? response?.status);
    } finally {
      pending.value = false;
    }
  }

  return { username, token, expirationTime, expireDays, pending, error, generate, clear };
}
