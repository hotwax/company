// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as appCacheBootstrap from "@/services/appCacheBootstrap";
import { serviceState } from "@common/db";

describe("appCacheBootstrap surface contract", () => {
  it("exports expected service functions", () => {
    expect(typeof appCacheBootstrap.startReferenceSync).toBe("function");
    expect(typeof appCacheBootstrap.stopReferenceSync).toBe("function");
    expect(typeof appCacheBootstrap.refreshAfterMutation).toBe("function");
    expect(typeof appCacheBootstrap.resyncReferenceData).toBe("function");
    expect(typeof appCacheBootstrap.resyncDomain).toBe("function");
    expect(typeof appCacheBootstrap.syncService).toBe("function");
  });

  it("exports bootstrapState as an alias to serviceState", () => {
    expect(appCacheBootstrap.bootstrapState).toBeDefined();
    expect(appCacheBootstrap.bootstrapState.running).toBe(serviceState.running);
  });

  it("exports referenceDomainNames as an array", () => {
    expect(Array.isArray(appCacheBootstrap.referenceDomainNames)).toBe(true);
  });
});
