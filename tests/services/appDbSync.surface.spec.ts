// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as appDbSync from "@/services/appDbSync";
import { serviceState } from "@common/db";

describe("appDbSync surface contract", () => {
  it("exports expected service functions", () => {
    expect(typeof appDbSync.startAppDbSync).toBe("function");
    expect(typeof appDbSync.stopAppDbSync).toBe("function");
    expect(typeof appDbSync.startReferenceSync).toBe("function");
    expect(typeof appDbSync.stopReferenceSync).toBe("function");
    expect(typeof appDbSync.refreshAfterMutation).toBe("function");
    expect(typeof appDbSync.resyncReferenceData).toBe("function");
    expect(typeof appDbSync.resyncDomain).toBe("function");
    expect(typeof appDbSync.syncService).toBe("function");
  });

  it("exports bootstrapState as an alias to serviceState", () => {
    expect(appDbSync.bootstrapState).toBeDefined();
    expect(appDbSync.bootstrapState.running).toBe(serviceState.running);
  });

  it("exports referenceDomainNames as an array", () => {
    expect(Array.isArray(appDbSync.referenceDomainNames)).toBe(true);
  });
});

