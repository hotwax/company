import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

const api = vi.fn();

vi.mock("@common", () => ({
  api: (...args: any[]) => api(...args),
  commonUtil: { hasError: (resp: any) => !!resp?.error, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

/**
 * The cached tables are stubbed at the useSecurity seam: `useAppPermissions` must read the group
 * and permission catalogs from there (never fetch them), so the mock exposes setters that stand in
 * for the worker writing the cache.
 */
vi.mock("@/composables/useSecurity", async () => {
  const { computed, ref } = await import("vue");
  const userGroupRecords = ref<any[]>([]);
  const permissionRecords = ref<any[]>([]);
  const hydrated = ref(true);

  return {
    __setUserGroups: (rows: any[]) => { userGroupRecords.value = rows; },
    __setPermissions: (rows: any[]) => { permissionRecords.value = rows; },
    __setHydrated: (value: boolean) => { hydrated.value = value; },
    useUserGroups: () => ({
      userGroups: computed(() =>
        [...userGroupRecords.value].sort((a: any, b: any) =>
          String(a?.description ?? "").localeCompare(String(b?.description ?? "")))),
      records: userGroupRecords,
      hydrated,
      search: () => [],
    }),
    usePermissions: () => ({
      permissions: computed(() => permissionRecords.value),
      records: permissionRecords,
      hydrated,
    }),
  };
});

const accessGroups = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    userGroupId: `GROUP_${index}`,
    description: `Group ${index}`,
    groupTypeEnumId: "UgtUserAccess",
  }));

/** Serve the two live (non-cached) per-group endpoints; everything else answers empty. */
function mockBackend(options: {
  groupPermissions?: Record<string, any[]>;
  groupUsers?: Record<string, any>;
} = {}) {
  api.mockImplementation(async (config: any) => {
    const url = String(config?.url ?? "");
    let match = url.match(/^admin\/userGroups\/([^/]+)\/permissions$/);
    if(config?.method === "get" && match) {
      return { data: options.groupPermissions?.[match[1]] ?? [] };
    }
    match = url.match(/^admin\/groups\/([^/]+)\/users$/);
    if(config?.method === "get" && match) {
      return { data: options.groupUsers?.[match[1]] ?? [] };
    }

    return { data: {} };
  });
}

const calls = () => api.mock.calls.map(([config]: any[]) => config);
const groupUserRequests = () =>
  calls().filter((config: any) => config.method === "get" && /^admin\/groups\/[^/]+\/users$/.test(String(config.url)));
const groupPermissionRequests = () =>
  calls().filter((config: any) => config.method === "get" && /^admin\/userGroups\/[^/]+\/permissions$/.test(String(config.url)));

/** Module state is shared (store-singleton parity), so each test imports a fresh module. */
async function freshModule() {
  vi.resetModules();
  api.mockReset();
  const security: any = await import("@/composables/useSecurity");
  const { clearSessionScopedState } = await import("@/composables/sessionScope");
  const { loadGroupPermissionRecords, useAppPermissions } = await import("@/composables/useAppPermissions");

  return { clearSessionScopedState, loadGroupPermissionRecords, security, useAppPermissions };
}

describe("useAppPermissions — catalogs come from the cache", () => {
  beforeEach(() => { api.mockReset(); });

  it("maps cached rows to the page's shapes and never fetches either catalog", async () => {
    const { security, useAppPermissions } = await freshModule();
    mockBackend();
    security.__setUserGroups([
      ...accessGroups(2),
      { userGroupId: "ADMIN_ONLY", description: "Not user access", groupTypeEnumId: "UgtOther" },
      { userGroupId: "NO_DESC", description: "", groupTypeEnumId: "UgtUserAccess" },
    ]);
    security.__setPermissions([
      { userPermissionId: "P_DESCRIBED", description: "A described permission" },
      { userPermissionId: "P_BARE" },
    ]);

    const composable = useAppPermissions();

    // groupTypeEnumId filter + groupName fallback (the server-side UgtUserAccess filter moved
    // client-side). Description order, so the empty-description group sorts first.
    expect(composable.securityGroups.value.map((group) => group.groupId)).toEqual(["NO_DESC", "GROUP_0", "GROUP_1"]);
    expect(composable.securityGroups.value.find((group) => group.groupId === "NO_DESC")?.groupName).toBe("NO_DESC");

    // permissionId ← userPermissionId, description falls back to the id
    expect(composable.getPermissionById("P_DESCRIBED")).toEqual({ permissionId: "P_DESCRIBED", description: "A described permission" });
    expect(composable.getPermissionById("P_BARE")?.description).toBe("P_BARE");

    // The retired store fetched both catalogs; the composable must not.
    const catalogRequests = calls().filter((config: any) => ["admin/userGroups", "admin/userPermissions"].includes(String(config.url)));
    expect(catalogRequests).toHaveLength(0);
  });

  it("loadAssignments waits for cache hydration before fanning out, then memoizes", async () => {
    const { security, useAppPermissions } = await freshModule();
    mockBackend();
    security.__setHydrated(false);
    security.__setUserGroups(accessGroups(3));
    security.__setPermissions([]);

    const composable = useAppPermissions();
    let settled = false;
    const loading = composable.loadAssignments().then(() => { settled = true; });

    await nextTick();
    expect(settled).toBe(false);
    expect(groupPermissionRequests()).toHaveLength(0);

    security.__setHydrated(true);
    await loading;
    expect(groupPermissionRequests()).toHaveLength(3);

    // A revisit re-fetches nothing (same memoization the store had).
    await composable.loadAssignments();
    expect(groupPermissionRequests()).toHaveLength(3);
  });

  it("derives active groups and sorted history from the per-group records", async () => {
    const { security, useAppPermissions } = await freshModule();
    const past = Date.now() - 100_000;
    const longPast = Date.now() - 200_000;
    const recentEnd = Date.now() - 50_000;
    mockBackend({
      groupPermissions: {
        GROUP_0: [{ userPermissionId: "P1", fromDate: past }],
        GROUP_1: [
          { userPermissionId: "P1", fromDate: longPast, thruDate: recentEnd },
          { userPermissionId: "OTHER", fromDate: past },
        ],
      },
    });
    security.__setUserGroups(accessGroups(2));
    security.__setPermissions([{ userPermissionId: "P1", description: "P one" }]);

    const composable = useAppPermissions();
    await composable.loadAssignments();

    const active = composable.activeGroupsByPermission("P1");
    expect(active.map((group) => group.groupId)).toEqual(["GROUP_0"]);
    expect(active[0].fromDate).toBe(past);

    // History includes the expired GROUP_1 record, open-ended assignments first (thruDate desc).
    const history = composable.permissionHistory("P1");
    expect(history.map((group) => group.groupId)).toEqual(["GROUP_0", "GROUP_1"]);
    expect(history[1].thruDate).toBe(recentEnd);
  });
});

describe("useAppPermissions — the fetchGroupUsers N+1 is gone", () => {
  beforeEach(() => { api.mockReset(); });

  // The defect (docs/cache-sync-remaining-work.md §2): the old page fired one
  // `admin/groups/{id}/users` request PER ACTIVE GROUP the moment the users modal opened. These
  // pin the replacement contract: reading the groups for the modal costs zero user requests, and
  // the count scales only with groups actually expanded — for ANY group count.
  it.each([3, 8])("with %i active groups: opening costs 0 requests, one expansion costs 1", async (groupCount) => {
    const { security, useAppPermissions } = await freshModule();
    const past = Date.now() - 100_000;
    const groupPermissions = Object.fromEntries(accessGroups(groupCount).map((group) => [group.userGroupId, [{ userPermissionId: "P1", fromDate: past }]]));
    mockBackend({ groupPermissions, groupUsers: { GROUP_0: [{ userId: "user.one" }] } });
    security.__setUserGroups(accessGroups(groupCount));
    security.__setPermissions([{ userPermissionId: "P1", description: "P one" }]);

    const composable = useAppPermissions();
    await composable.loadAssignments();

    // What openUsers() now does: a pure read of the already-loaded records. No user fetches.
    const groups = composable.activeGroupsByPermission("P1");
    expect(groups).toHaveLength(groupCount);
    expect(groupUserRequests()).toHaveLength(0);

    // Expanding ONE group costs exactly one request, independent of groupCount.
    const users = await composable.loadGroupUsers("GROUP_0");
    expect(users).toEqual([{ userId: "user.one" }]);
    expect(groupUserRequests()).toHaveLength(1);
    expect(composable.usersForGroup("GROUP_0")).toEqual([{ userId: "user.one" }]);
  });

  it("memoizes per group — re-expansion and concurrent expansion never re-fetch", async () => {
    const { security, useAppPermissions } = await freshModule();
    mockBackend({ groupUsers: { GROUP_0: [{ userId: "a" }], GROUP_1: [{ userId: "b" }] } });
    security.__setUserGroups(accessGroups(2));
    security.__setPermissions([]);

    const composable = useAppPermissions();

    await composable.loadGroupUsers("GROUP_0");
    await composable.loadGroupUsers("GROUP_0");
    expect(groupUserRequests()).toHaveLength(1);

    // Two simultaneous expansions of the same group collapse into one in-flight request.
    await Promise.all([composable.loadGroupUsers("GROUP_1"), composable.loadGroupUsers("GROUP_1")]);
    expect(groupUserRequests()).toHaveLength(2);
  });

  it("unwraps the endpoint's alternate envelopes (users/docs) like the store did", async () => {
    const { security, useAppPermissions } = await freshModule();
    mockBackend({ groupUsers: { GROUP_0: { users: [{ userId: "wrapped" }] } } });
    security.__setUserGroups(accessGroups(1));
    security.__setPermissions([]);

    const composable = useAppPermissions();

    expect(await composable.loadGroupUsers("GROUP_0")).toEqual([{ userId: "wrapped" }]);
  });
});

describe("useAppPermissions — savePermissionGroups", () => {
  beforeEach(() => { api.mockReset(); });

  it("POSTs added groups, soft-expires removed ones, and re-reads only the changed groups", async () => {
    const { security, useAppPermissions } = await freshModule();
    mockBackend();
    security.__setUserGroups(accessGroups(3));
    security.__setPermissions([{ userPermissionId: "P1", description: "P one" }]);

    const composable = useAppPermissions();
    const originalFromDate = Date.now() - 100_000;
    const outcome = await composable.savePermissionGroups(
      "P1",
      [{ groupId: "GROUP_0", fromDate: originalFromDate }, { groupId: "GROUP_1", fromDate: originalFromDate }],
      [{ groupId: "GROUP_1" }, { groupId: "GROUP_2" }],
    );

    expect(outcome).toEqual({ failed: 0, succeeded: 2 });

    const post = calls().find((config: any) => config.method === "post");
    expect(post.url).toBe("admin/userGroups/GROUP_2/permissions");
    expect(post.data.userPermissionId).toBe("P1");

    const put = calls().find((config: any) => config.method === "put");
    expect(put.url).toBe("admin/userGroups/GROUP_0/permissions");
    expect(put.data.fromDate).toBe(originalFromDate);
    expect(put.data.thruDate).toBeGreaterThan(originalFromDate);

    // Write-through refresh: the two CHANGED groups are re-read; untouched GROUP_1 is not.
    const refreshed = groupPermissionRequests().map((config: any) => config.url).sort();
    expect(refreshed).toEqual(["admin/userGroups/GROUP_0/permissions", "admin/userGroups/GROUP_2/permissions"]);
  });

  it("counts partial failures without losing the successful writes", async () => {
    const { security, useAppPermissions } = await freshModule();
    api.mockImplementation(async (config: any) =>
      config?.method === "post" ? { error: true, data: "nope" } : { data: [] });
    security.__setUserGroups(accessGroups(2));
    security.__setPermissions([]);

    const composable = useAppPermissions();
    const outcome = await composable.savePermissionGroups(
      "P1",
      [{ groupId: "GROUP_0", fromDate: Date.now() - 100_000 }],
      [{ groupId: "GROUP_1" }],
    );

    expect(outcome).toEqual({ failed: 1, succeeded: 1 });
  });

  it("refuses a removal whose original fromDate cannot be parsed", async () => {
    const { security, useAppPermissions } = await freshModule();
    mockBackend();
    security.__setUserGroups(accessGroups(1));
    security.__setPermissions([]);

    const composable = useAppPermissions();

    await expect(composable.savePermissionGroups("P1", [{ groupId: "GROUP_0" }], []))
      .rejects.toThrow(/Invalid permission assignment start date/);
    expect(calls().filter((config: any) => config.method === "put")).toHaveLength(0);
  });
});

describe("useAppPermissions — session boundaries", () => {
  beforeEach(() => { api.mockReset(); });

  it("clears memoized assignments and users so the next session fetches its own data", async () => {
    const { clearSessionScopedState, security, useAppPermissions } = await freshModule();
    const past = Date.now() - 100_000;
    mockBackend({
      groupPermissions: { GROUP_0: [{ userPermissionId: "P1", fromDate: past }] },
      groupUsers: { GROUP_0: [{ userId: "user.a" }] },
    });
    security.__setUserGroups(accessGroups(1));
    security.__setPermissions([{ userPermissionId: "P1", description: "P one" }]);
    const composable = useAppPermissions();

    await composable.loadAssignments();
    await composable.loadGroupUsers("GROUP_0");
    expect(composable.activeGroupsByPermission("P1")).toHaveLength(1);
    expect(composable.usersForGroup("GROUP_0")).toEqual([{ userId: "user.a" }]);

    clearSessionScopedState();

    expect(composable.activeGroupsByPermission("P1")).toEqual([]);
    expect(composable.usersForGroup("GROUP_0")).toBeUndefined();
    await composable.loadAssignments();
    await composable.loadGroupUsers("GROUP_0");
    expect(groupPermissionRequests()).toHaveLength(2);
    expect(groupUserRequests()).toHaveLength(2);
  });

  it("does not let late permission responses from the previous session repopulate state", async () => {
    const { clearSessionScopedState, loadGroupPermissionRecords, security, useAppPermissions } = await freshModule();
    security.__setUserGroups(accessGroups(1));
    security.__setPermissions([{ userPermissionId: "P1", description: "P one" }]);
    const composable = useAppPermissions();
    let resolveOld!: (value: any) => void;
    let resolveNew!: (value: any) => void;
    const oldResponse = new Promise((resolve) => { resolveOld = resolve; });
    const newResponse = new Promise((resolve) => { resolveNew = resolve; });
    api
      .mockReturnValueOnce(oldResponse)
      .mockReturnValueOnce(newResponse);

    const oldLoad = loadGroupPermissionRecords("GROUP_0");
    clearSessionScopedState();
    const newLoad = loadGroupPermissionRecords("GROUP_0");

    resolveOld({ data: [{ userPermissionId: "P1", fromDate: Date.now() - 100_000 }] });
    await oldLoad;
    expect(composable.activeGroupsByPermission("P1")).toEqual([]);

    resolveNew({ data: [{ userPermissionId: "P1", fromDate: Date.now() - 100_000 }] });
    await newLoad;
    expect(composable.activeGroupsByPermission("P1")).toHaveLength(1);
  });

  it("keeps a new session request memoized when the previous session's request finishes late", async () => {
    const { clearSessionScopedState, security, useAppPermissions } = await freshModule();
    security.__setUserGroups(accessGroups(1));
    security.__setPermissions([]);
    const composable = useAppPermissions();
    let resolveOld!: (value: any) => void;
    let resolveNew!: (value: any) => void;
    const oldResponse = new Promise((resolve) => { resolveOld = resolve; });
    const newResponse = new Promise((resolve) => { resolveNew = resolve; });
    api
      .mockReturnValueOnce(oldResponse)
      .mockReturnValueOnce(newResponse);

    const oldLoad = composable.loadGroupUsers("GROUP_0");
    clearSessionScopedState();
    const newLoad = composable.loadGroupUsers("GROUP_0");

    resolveOld({ data: [{ userId: "old.user" }] });
    await oldLoad;
    expect(composable.usersForGroup("GROUP_0")).toBeUndefined();

    // The old request's finally block must not remove the new request from the in-flight map.
    const joinedNewLoad = composable.loadGroupUsers("GROUP_0");
    expect(groupUserRequests()).toHaveLength(2);

    resolveNew({ data: [{ userId: "new.user" }] });
    await expect(Promise.all([newLoad, joinedNewLoad])).resolves.toEqual([
      [{ userId: "new.user" }],
      [{ userId: "new.user" }],
    ]);
    expect(composable.usersForGroup("GROUP_0")).toEqual([{ userId: "new.user" }]);
  });
});
