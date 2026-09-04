import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { hasError: (resp: any) => !!resp?.hasError, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: (...args: any[]) => harness.refreshAfterMutation(...args),
  resyncDomain: (...args: any[]) => harness.resyncDomain(...args),
  bootstrapState: { running: false },
}));

// The composable's session accessors (`useAuth`) reach into the user store, whose real import
// chain needs a browser context; none of that is under test here.
vi.mock("@/store/user", () => ({ useUserStore: () => ({}) }));

import { updateUserGroup, useUserGroupPermissions } from "@/composables/useSecurity";

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
