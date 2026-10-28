import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHostedAppVersions } from "@/composables/useAppVersion";
const { rows } = vi.hoisted(() => ({ rows: new Map<string, {value:any;expires:number}>() }));
vi.mock("@/db/appVersionCache", () => ({ appVersionCache: {
  get: async (key:string, stale=false) => {const row=rows.get(key);return row && (stale || row.expires>Date.now()) ? row.value : undefined;},
  matching: async (prefix:string) => [...rows].filter(([key])=>key.startsWith(prefix)).map(([,row])=>row.value),
  put: async (key:string,value:any,ttl:number) => {rows.set(key,{value,expires:Date.now()+ttl});}
} }));
vi.mock("@common", () => ({ api: vi.fn(), commonUtil: {}, logger: { error: vi.fn(), warn: vi.fn() }, useLiveEntity: vi.fn() }));
vi.mock("@/db/companyDb", () => ({ companyDb: {} }));
vi.mock("@/db/appDbSync", () => ({ resyncDomain: vi.fn() }));
vi.mock("@/composables/useSeed", () => ({ useTypedEnums: vi.fn() }));
beforeEach(()=>{rows.clear();vi.stubEnv("VITE_APP_VERSION_DISCOVERY_URL","https://discovery.example/appVersions");});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const response = (status="available",env="AppEnvUAT") => ({ schemaVersion: 2, appId: "JOB_MANAGER", environmentTypeId: env, origin:"https://job-manager-uat.hotwax.io", checks:[{version:"",status:"available",checkedAt:new Date().toISOString(),defaultBuild:"v3.4.2"},{version:"v3.4.2",status,checkedAt:new Date().toISOString()}] });
describe("public hosting checks and cache", () => {
  it("reuses recent results across composable instances but always rechecks before saving", async () => {
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>response()});vi.stubGlobal("fetch",fetcher);
    await useHostedAppVersions().refreshHostedVersions("JOB_MANAGER","AppEnvUAT",false,["v3.4.2"]);
    const state=useHostedAppVersions();
    expect((await state.readCachedHostedVersions("JOB_MANAGER","AppEnvUAT"))?.versions).toEqual(["v3.4.2"]);
    await state.refreshHostedVersions("JOB_MANAGER","AppEnvUAT",false,["v3.4.2"]);expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue({ok:true,json:async()=>response("unavailable")});
    expect((await state.refreshHostedVersions("JOB_MANAGER","AppEnvUAT",true,["v3.4.2"])).versions).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith("https://discovery.example/appVersions?app=JOB_MANAGER&environment=AppEnvUAT&versions=v3.4.2",expect.objectContaining({credentials:"omit",cache:"no-store"}));
  });
  it("expires positive results and distinguishes unknown from unavailable",async()=>{
    vi.useFakeTimers();const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>response()});vi.stubGlobal("fetch",fetcher);
    const state=useHostedAppVersions();await state.refreshHostedVersions("JOB_MANAGER","AppEnvUAT",false,["v3.4.2"]);
    vi.advanceTimersByTime(5*60000+1);fetcher.mockResolvedValue({ok:true,json:async()=>response("unknown")});
    const result=await state.refreshHostedVersions("JOB_MANAGER","AppEnvUAT",false,["v3.4.2"]);
    expect(result.versions).toEqual([]);expect(result.checks?.["v3.4.2"].status).toBe("unknown");expect(fetcher).toHaveBeenCalledTimes(2);
    await state.refreshHostedVersions("JOB_MANAGER","AppEnvUAT",false,["v3.4.2"]);expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rejects mismatched or incomplete responses",async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>response("available","AppEnvProd")});vi.stubGlobal("fetch",fetcher);
    const state=useHostedAppVersions();await expect(state.refreshHostedVersions("JOB_MANAGER","AppEnvUAT",true,["v3.4.2"])).rejects.toThrow();
    fetcher.mockResolvedValue({ok:true,json:async()=>({...response(),checks:[]})});await expect(state.refreshHostedVersions("JOB_MANAGER","AppEnvUAT",true,["v3.4.2"])).rejects.toThrow();
  });
  it("does not treat a request failure as an empty available list",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockRejectedValue(Error("Unavailable")));const state=useHostedAppVersions();
    await expect(state.refreshHostedVersions("JOB_MANAGER","AppEnvUAT",true,["v3.4.2"])).rejects.toThrow();expect(state.error.value).toBe(true);
  });
});
