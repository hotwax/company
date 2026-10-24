import { describe, expect, it, vi } from "vitest";
vi.mock("@common", () => ({ logger: { warn: vi.fn() } }));
import { versionsFromManifest, hostedVersionsFor } from "@/utils/appVersionOptions";
const manifest = (versions: string[]) => ({ schemaVersion: 1, appId: "JOB_MANAGER", environmentTypeId: "AppEnvUAT", versions: versions.map(version => ({version, environmentTypeId: "AppEnvUAT"})) });
describe("hosted versions", () => {
  it("offers deployed stable versions in newest-first order", () => {
    expect(versionsFromManifest(manifest(["v3.3.0", "v3.4.1", "v3.5.0", "v3.3.0"]), "JOB_MANAGER", "AppEnvUAT")).toEqual(["v3.5.0", "v3.4.1", "v3.3.0"]);
  });
  it("rejects another environment or application", () => {
    expect(() => versionsFromManifest(manifest(["v3.3.0"]), "COMPANY", "AppEnvUAT")).toThrow();
    expect(() => versionsFromManifest(manifest(["v3.3.0"]), "JOB_MANAGER", "AppEnvProd")).toThrow();
  });
  it("rejects malformed metadata instead of offering unverified versions", () => {
    for(const value of [null, "<html>fallback</html>", manifest(["../../login"]), {...manifest([]), versions: null}]) {
      expect(() => versionsFromManifest(value, "JOB_MANAGER", "AppEnvUAT")).toThrow();
    }
  });
  it("has no stale UAT fallback and preserves production choices", () => {
    expect(hostedVersionsFor("JOB_MANAGER", "AppEnvUAT")).toEqual([]);
    expect(hostedVersionsFor("JOB_MANAGER", "AppEnvProd")).toEqual(["v3.3.0"]);
  });
});
