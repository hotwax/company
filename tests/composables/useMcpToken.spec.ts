import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { clearSessionScopedState } from "@/composables/sessionScope";

const harness = vi.hoisted(() => ({ api: vi.fn(), backend: "" }));
const profile = ref({ username: "test-user" });
vi.mock("@common", () => ({
  api: (...args: unknown[]) => harness.api(...args),
  commonUtil: { getMaargURL: () => harness.backend },
}));
vi.mock("@/composables/useSecurity", () => ({ useAuth: () => ({ userProfile: profile }) }));

import { useMcpToken } from "@/composables/useMcpToken";

// Client contract/lifecycle tests only; these do not establish live token issuance.
let scope: ReturnType<typeof effectScope>;
let endpoint: ReturnType<typeof ref<string>>;
let state: ReturnType<typeof useMcpToken>;
const issued = () => ({ data: { token: "test-only-token", expirationTime: Date.now() + 60_000 } });

beforeEach(() => {
  harness.api.mockReset();
  harness.backend = "https://example.hotwax.io/moqui/rest/s1/";
  profile.value = { username: "test-user" };
  endpoint = ref("https://example.hotwax.io/moqui/mcp/json");
  scope = effectScope();
  state = scope.run(() => useMcpToken(() => endpoint.value))!;
});
afterEach(() => scope.stop());

describe("MCP token generation", () => {
  it.each([7, 90, 180, 365])("uses the signed-in account and context root with a %i-day expiry", async (expireDays) => {
    harness.api.mockResolvedValueOnce(issued());
    state.expireDays.value = expireDays;
    await state.generate();
    expect(harness.api).toHaveBeenCalledWith({
      baseURL: "https://example.hotwax.io/moqui/rest/s1/",
      url: "admin/user/jwtToken",
      method: "post",
      data: { username: "test-user", purpose: "MCP", expireDays },
    });
    expect(state.token.value).toBe("test-only-token");
    expect(state.expirationTime.value).toBeGreaterThan(Date.now());
    expect(state.pending.value).toBe(false);
  });

  it("never sends an authenticated request to the user-edited instance", async () => {
    endpoint.value = "https://another.example.com/mcp/json";
    await state.generate();
    expect(harness.api).not.toHaveBeenCalled();
    expect(state.error.value).toContain("signed-in OMS instance");
  });

  it("requires a loaded user and a supported expiry before issuing a request", async () => {
    profile.value = { username: "" };
    await state.generate();
    profile.value = { username: "test-user" };
    state.expireDays.value = 0;
    await state.generate();
    expect(harness.api).not.toHaveBeenCalled();
    expect(state.error.value).toContain("1, 7, 30, 90, 180, or 365");
  });

  it("blocks duplicate requests while pending and while a generated token is displayed", async () => {
    let complete!: (value: ReturnType<typeof issued>) => void;
    harness.api.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const request = state.generate();
    await state.generate();
    expect(state.pending.value).toBe(true);
    expect(harness.api).toHaveBeenCalledTimes(1);
    complete(issued());
    await request;
    await state.generate();
    expect(harness.api).toHaveBeenCalledTimes(1);
  });

  it.each(["leave", "logout", "user change", "instance change", "dispose"])("clears credentials and discards pending responses on %s", async (event) => {
    const invalidate = () => {
      if (event === "leave") state.clear();
      if (event === "logout") clearSessionScopedState();
      if (event === "user change") profile.value = { username: "another-user" };
      if (event === "instance change") endpoint.value = "https://another.example.com/mcp/json";
      if (event === "dispose") scope.stop();
    };
    let complete!: (value: ReturnType<typeof issued>) => void;
    harness.api.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const request = state.generate();
    invalidate();
    complete(issued());
    await request;
    expect(state.token.value).toBe("");
    expect(state.expirationTime.value).toBeUndefined();
    expect(state.pending.value).toBe(false);
  });

  it("clears an already displayed credential on logout", async () => {
    harness.api.mockResolvedValueOnce(issued());
    await state.generate();
    clearSessionScopedState();
    expect(state.token.value).toBe("");
    expect(state.expirationTime.value).toBeUndefined();
  });

  it("discards a response if the authenticated backend changed while awaiting it", async () => {
    let complete!: (value: ReturnType<typeof issued>) => void;
    harness.api.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const request = state.generate();
    harness.backend = "https://another.example.com/rest/s1/";
    complete(issued());
    await request;
    expect(state.token.value).toBe("");
  });

  it.each([
    { data: { errorCode: 403, errors: "server-internal-data" } },
    { data: { token: "test-only-token", expirationTime: 0 } },
    { data: {} },
  ])("does not display unusable or failed responses", async (response) => {
    harness.api.mockResolvedValueOnce(response);
    await state.generate();
    expect(state.token.value).toBe("");
    expect(state.error.value).not.toBe("");
    expect(state.error.value).not.toContain("server-internal-data");
  });

  it.each([404, 405])("explains that an absent REST route (%i) needs a backend update without retrying via RPC", async (status) => {
    harness.api.mockRejectedValueOnce({ response: { status } });
    await state.generate();
    expect(state.error.value).toContain("backend update");
    expect(harness.api).toHaveBeenCalledTimes(1);
    expect(state.token.value).toBe("");
  });

  it("reports permission failures without exposing transport error details or retrying", async () => {
    harness.api.mockRejectedValueOnce({ response: { status: 403, data: { message: "server-internal-data" } } });
    await state.generate();
    expect(state.error.value).toContain("through Company");
    expect(state.error.value).not.toContain("server-internal-data");
    expect(state.pending.value).toBe(false);
    expect(harness.api).toHaveBeenCalledTimes(1);
  });
});
