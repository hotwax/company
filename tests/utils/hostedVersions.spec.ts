import { describe, expect, it, vi } from "vitest";
vi.mock("@common", () => ({ logger: { warn: vi.fn() } }));
import { sanitizeHostedVersions } from "@/utils/appVersionOptions";
describe("version candidates", () => {
  it("deduplicates and orders stable releases before their prereleases",()=>{
    expect(sanitizeHostedVersions("BOPIS","AppEnvUAT",["v5.3.0-ls2","v5.3.0","v5.3.0","v4.0.0"])).toEqual(["v5.3.0","v5.3.0-ls2","v4.0.0"]);
  });
  it("does not send invalid old pins or paths as probe targets",()=>{
    expect(sanitizeHostedVersions("COMPANY","AppEnvUAT",["main","../../login","v1.2.3","v99.2"])).toEqual(["v1.2.3"]);
  });
});
