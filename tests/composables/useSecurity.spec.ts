import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { clearSessionScopedState } from "@/composables/sessionScope";

/**
 * L1 unit — the security composable that absorbed `src/store/authorization.ts`.
 *
 * Pins the two behaviours the migration could silently break:
 *
 *  1. READ derivation — `useUserGroupPermissions` must reproduce the store's active-grant
 *     projection. `admin/userGroups/{id}/permissions` returns the FULL UserGroupPermission
 *     history (revokes are soft-expires that set `thruDate`, not deletes), and the store filtered
 *     to `!thruDate || thruDate > now` keyed by `userPermissionId`. Losing the filter renders
 *     revoked permissions as still granted; losing the keying breaks every `isChecked` lookup.
 *
 *  2. MUTATION + write-through — `updateUserGroup` must PUT the group AND re-sync the cached
 *     `userGroups` lookup via `resyncDomain("userGroup")`, NOT `refreshAfterMutation`. The
 *     userGroup domain registers neither `byPk` nor `refetchScope` (referenceDomains.ts:155,
 *     lookup loop), so `refetchOne` silently returns 0 for it (snapshotDomain.ts:256) — with
 *     `refreshAfterMutation` the rename would sit stale in every cached reader until next login.
 */

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
}));

const profile = ref({ username: "test-user" });
const sessionBackend = ref("");

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { getMaargURL: () => sessionBackend.value, hasError: (resp: any) => !!resp?.hasError, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: (...args: any[]) => harness.refreshAfterMutation(...args),
  resyncDomain: (...args: any[]) => harness.resyncDomain(...args),
  bootstrapState: { running: false },
}));

// The composable's session accessors (`useAuth`) reach into the user store, whose real import
// chain needs a browser context. Expose reactive session data for token-lifecycle tests.
vi.mock("@/store/user", () => ({
  useUserStore: () => ({ get getUserProfile() { return profile.value; } }),
}));

import { updateUserGroup, useUserGroupPermissions, useUserToken } from "@/composables/useSecurity";

beforeEach(() => {
  harness.api.mockReset();
  harness.refreshAfterMutation.mockReset();
  harness.resyncDomain.mockReset();
});

describe("useUserGroupPermissions — active-grant derivation", () => {
  it("keeps only unexpired grants, keyed by userPermissionId, from THIS group's endpoint", async () => {
    const now = Date.now();
    harness.api.mockResolvedValueOnce({
      data: [
        // Soft-expired revoke — must NOT come back as granted.
        { userGroupId: "SGRP", userPermissionId: "REVOKED_PERM", fromDate: 1, thruDate: now - 60_000 },
        // Open-ended grant (no thruDate) — active.
        { userGroupId: "SGRP", userPermissionId: "OPEN_PERM", fromDate: 1 },
        // Grant expiring in the future — still active today.
        { userGroupId: "SGRP", userPermissionId: "FUTURE_PERM", fromDate: 1, thruDate: now + 60_000 },
      ],
    });

    const group = useUserGroupPermissions("SGRP");
    await group.load();

    expect(harness.api).toHaveBeenCalledWith(expect.objectContaining({
      url: "admin/userGroups/SGRP/permissions",
      method: "get",
    }));
    expect(Object.keys(group.activePermissions.value).sort()).toEqual(["FUTURE_PERM", "OPEN_PERM"]);
    // The full grant row is kept — revoking needs its `fromDate` to address the record.
    expect(group.activePermissions.value.OPEN_PERM.fromDate).toBe(1);
  });

  it("reports a failed fetch as no grants rather than stale ones", async () => {
    harness.api.mockResolvedValueOnce({ data: [{ userGroupId: "SGRP", userPermissionId: "OPEN_PERM", fromDate: 1 }] });
    const group = useUserGroupPermissions("SGRP");
    await group.load();
    expect(Object.keys(group.activePermissions.value)).toHaveLength(1);

    harness.api.mockRejectedValueOnce(new Error("boom"));
    await group.load();

    expect(group.activePermissions.value).toEqual({});
  });
});

describe("updateUserGroup — mutation shape and write-through", () => {
  it("PUTs the group and re-syncs the cached userGroups lookup", async () => {
    harness.api.mockResolvedValueOnce({ data: {} });

    await updateUserGroup({ userGroupId: "SGRP", description: "Store managers" });

    expect(harness.api).toHaveBeenCalledWith({
      url: "admin/userGroups/SGRP",
      method: "put",
      data: { userGroupId: "SGRP", description: "Store managers" },
    });
    // Whole-domain resync — see the header note on why refetchOne cannot land this write.
    expect(harness.resyncDomain).toHaveBeenCalledWith("userGroup");
    expect(harness.refreshAfterMutation).not.toHaveBeenCalled();
  });

  it("leaves the cache alone when the server reports an error", async () => {
    harness.api.mockResolvedValueOnce({ hasError: true, data: {} });

    await updateUserGroup({ userGroupId: "SGRP", description: "nope" });

    expect(harness.resyncDomain).not.toHaveBeenCalled();
  });
});

describe("useUserToken — issuance and credential lifecycle", () => {
  // Client contract/lifecycle tests only; these do not establish live token issuance.
  let scope: ReturnType<typeof effectScope>;
  let expectedBackend: ReturnType<typeof ref<string>>;
  let state: ReturnType<typeof useUserToken>;
  const issued = () => ({ data: { token: "test-only-token", expirationTime: Date.now() + 60_000 } });

  beforeEach(() => {
    harness.api.mockReset();
    sessionBackend.value = "https://example.hotwax.io/moqui/rest/s1/";
    profile.value = { username: "test-user" };
    expectedBackend = ref("https://example.hotwax.io/moqui/rest/s1/");
    scope = effectScope();
    state = scope.run(() => useUserToken(() => expectedBackend.value))!;
  });
  afterEach(() => scope.stop());

  it("accepts a purpose and expiry supplied by a consumer other than MCP", async () => {
    harness.api.mockResolvedValueOnce(issued());
    await state.generate({ purpose: "Reporting", expireDays: 14 });
    expect(harness.api).toHaveBeenCalledWith(expect.objectContaining({
      data: { username: "test-user", purpose: "Reporting", expireDays: 14 },
    }));
    expect(state.token.value).toBe("test-only-token");
  });

  it.each([
    { purpose: " ", expireDays: 30 },
    { purpose: "MCP", expireDays: -1 },
    { purpose: "MCP", expireDays: 1.5 },
    { purpose: "MCP", expireDays: NaN },
    { purpose: "MCP", expireDays: Infinity },
  ])("rejects invalid token options without making a request: %o", async (options) => {
    await state.generate(options);
    expect(harness.api).not.toHaveBeenCalled();
    expect(state.error.value).toContain("positive whole number");
  });

  it.each([
    "", "http://example.com/rest/s1/", "https://user:secret@example.com/rest/s1/",
    "https://example.com/rest/s1/?token=secret", "https://example.com/rest/s1/#secret",
    "https://example.com/mcp/json",
  ])("rejects an invalid authenticated backend without making a request: %s", async (backend) => {
    sessionBackend.value = backend;
    expectedBackend.value = backend;
    await state.generate({ purpose: "MCP", expireDays: 30 });
    expect(harness.api).not.toHaveBeenCalled();
    expect(state.error.value).toContain("signed-in OMS instance");
  });

  it("clears a displayed token when the authenticated backend changes", async () => {
    harness.api.mockResolvedValueOnce(issued());
    await state.generate({ purpose: "MCP", expireDays: 30 });
    sessionBackend.value = "https://another.example.com/rest/s1/";
    expect(state.token.value).toBe("");
    expect(state.expirationTime.value).toBeUndefined();
  });

  it("keeps generated credentials local to each consumer", async () => {
    const otherScope = effectScope();
    try {
      const other = otherScope.run(() => useUserToken(() => expectedBackend.value))!;
      harness.api.mockResolvedValueOnce(issued());
      await state.generate({ purpose: "MCP", expireDays: 30 });
      expect(other.token.value).toBe("");
      other.clear();
      expect(state.token.value).toBe("test-only-token");
    } finally {
      otherScope.stop();
    }
  });

  it.each([7, 90, 180, 365])("uses the signed-in account and context root with a %i-day expiry", async (expireDays) => {
    harness.api.mockResolvedValueOnce(issued());
    await state.generate({ purpose: "MCP", expireDays });
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

  it("never sends an authenticated request to the backend that differs from the signed-in instance", async () => {
    expectedBackend.value = "https://another.example.com/rest/s1/";
    await state.generate({ purpose: "MCP", expireDays: 30 });
    expect(harness.api).not.toHaveBeenCalled();
    expect(state.error.value).toContain("signed-in OMS instance");
  });

  it("requires a loaded user and positive integer expiry before issuing a request", async () => {
    profile.value = { username: "" };
    await state.generate({ purpose: "MCP", expireDays: 30 });
    profile.value = { username: "test-user" };
    await state.generate({ purpose: "MCP", expireDays: 0 });
    expect(harness.api).not.toHaveBeenCalled();
    expect(state.error.value).toContain("positive whole number");
  });

  it("blocks duplicate requests while pending and while a generated token is displayed", async () => {
    let complete!: (value: ReturnType<typeof issued>) => void;
    harness.api.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const request = state.generate({ purpose: "MCP", expireDays: 30 });
    await state.generate({ purpose: "MCP", expireDays: 30 });
    expect(state.pending.value).toBe(true);
    expect(harness.api).toHaveBeenCalledTimes(1);
    complete(issued());
    await request;
    await state.generate({ purpose: "MCP", expireDays: 30 });
    expect(harness.api).toHaveBeenCalledTimes(1);
  });

  it.each(["leave", "logout", "user change", "instance change", "dispose"])("clears credentials and discards pending responses on %s", async (event) => {
    const invalidate = () => {
      if (event === "leave") state.clear();
      if (event === "logout") clearSessionScopedState();
      if (event === "user change") profile.value = { username: "another-user" };
      if (event === "instance change") expectedBackend.value = "https://another.example.com/rest/s1/";
      if (event === "dispose") scope.stop();
    };
    let complete!: (value: ReturnType<typeof issued>) => void;
    harness.api.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const request = state.generate({ purpose: "MCP", expireDays: 30 });
    invalidate();
    complete(issued());
    await request;
    expect(state.token.value).toBe("");
    expect(state.expirationTime.value).toBeUndefined();
    expect(state.pending.value).toBe(false);
  });

  it("clears an already displayed credential on logout", async () => {
    harness.api.mockResolvedValueOnce(issued());
    await state.generate({ purpose: "MCP", expireDays: 30 });
    clearSessionScopedState();
    expect(state.token.value).toBe("");
    expect(state.expirationTime.value).toBeUndefined();
  });

  it("discards a response if the authenticated backend changed while awaiting it", async () => {
    let complete!: (value: ReturnType<typeof issued>) => void;
    harness.api.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const request = state.generate({ purpose: "MCP", expireDays: 30 });
    sessionBackend.value = "https://another.example.com/rest/s1/";
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
    await state.generate({ purpose: "MCP", expireDays: 30 });
    expect(state.token.value).toBe("");
    expect(state.error.value).not.toBe("");
    expect(state.error.value).not.toContain("server-internal-data");
  });

  it.each([404, 405])("explains that an absent REST route (%i) needs a backend update without retrying via RPC", async (status) => {
    harness.api.mockRejectedValueOnce({ response: { status } });
    await state.generate({ purpose: "MCP", expireDays: 30 });
    expect(state.error.value).toContain("backend update");
    expect(harness.api).toHaveBeenCalledTimes(1);
    expect(state.token.value).toBe("");
  });

  it("reports permission failures without exposing transport error details or retrying", async () => {
    harness.api.mockRejectedValueOnce({ response: { status: 403, data: { message: "server-internal-data" } } });
    await state.generate({ purpose: "MCP", expireDays: 30 });
    expect(state.error.value).toContain("through Company");
    expect(state.error.value).not.toContain("server-internal-data");
    expect(state.pending.value).toBe(false);
    expect(harness.api).toHaveBeenCalledTimes(1);
  });
});
