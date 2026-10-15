// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as appDbSync from "@/db/appDbSync";
import { serviceState } from "@common/db";

describe("appDbSync surface contract", () => {
  it("exports expected service functions", () => {
    expect(typeof appDbSync.startAppDbSync).toBe("function");
    expect(typeof appDbSync.stopAppDbSync).toBe("function");
    expect(typeof appDbSync.refreshAfterMutation).toBe("function");
    expect(typeof appDbSync.resyncReferenceData).toBe("function");
    expect(typeof appDbSync.resyncDomain).toBe("function");
    expect(typeof appDbSync.syncService).toBe("function");
    expect(typeof appDbSync.activateSyncDomains).toBe("function");
    expect(typeof appDbSync.deactivateSyncDomains).toBe("function");
    expect(typeof appDbSync.createSyncDomainOwner).toBe("function");
    expect(typeof appDbSync.syncNow).toBe("function");
  });

  it("exports bootstrapState as an alias to serviceState", () => {
    expect(appDbSync.bootstrapState).toBeDefined();
    expect(appDbSync.bootstrapState.running).toBe(serviceState.running);
  });

  it("exports the view-scoped activation state as refs", () => {
    expect(appDbSync.syncDomainsReady.value).toBe(false);
    expect(appDbSync.syncDomainsError.value).toBe("");
  });
});

