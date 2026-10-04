// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUnigateConnection } from "@/composables/useUnigateConnection";

const harness = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn() }));
vi.mock("@common", () => ({ api: (...args: any[]) => harness.api(...args), commonUtil: { hasError: (res: any) => Boolean(res?.data?.error) } }));
vi.mock("@/services/appCacheBootstrap", () => ({ refreshAfterMutation: (...args: any[]) => harness.refresh(...args) }));

beforeEach(() => { vi.clearAllMocks(); harness.refresh.mockResolvedValue(undefined); });
const saved = { exists: true, tenantId: "TENANT", sendUrl: "https://unigate-uat.hotwax.io/rest/s1/unigate/", hasKey: true };

describe("UniGate connection state", () => {
  it("treats a legacy hidden key as unknown, and recognizes an existing record for updates", async () => {
    harness.api.mockRejectedValueOnce({ response: { status: 404 } }).mockResolvedValueOnce({ data: { systemMessageRemoteList: [{ systemMessageRemoteId: "UNIGATE_CONFIG", internalId: saved.tenantId, sendUrl: saved.sendUrl }] } });
    const state = useUnigateConnection();
    await state.load();
    expect(state.connection.value.hasKey).toBeNull();
    expect(state.connection.value.exists).toBe(true);
    expect(state.loadError.value).toBe(false);
    expect(state.result.value).toBeNull();
  });
  it("does not interpret forbidden reads or invalid responses as empty configuration", async () => {
    const state = useUnigateConnection();
    harness.api.mockRejectedValueOnce({ response: { status: 403 } });
    await state.load();
    expect(state.loadError.value).toBe(true);
    expect(harness.api).toHaveBeenCalledTimes(1);
    harness.api.mockResolvedValueOnce({ data: {} });
    await state.load();
    expect(state.loadError.value).toBe(true);
  });
  it("keeps saved and verified states separate, and omits an unchanged key from writes", async () => {
    harness.api.mockResolvedValueOnce({ data: saved }).mockResolvedValueOnce({ data: {} });
    const state = useUnigateConnection();
    await state.load();
    expect(await state.save({ tenantId: saved.tenantId, sendUrl: saved.sendUrl, key: "" })).toBe(true);
    expect(harness.api.mock.calls[1][0].method).toBe("put");
    expect(harness.api.mock.calls[1][0].data.sendUrl).toBe("https://unigate-uat.hotwax.io");
    expect(harness.api.mock.calls[1][0].data).not.toHaveProperty("publicKey");
    expect(state.result.value).toBeNull();
    harness.api.mockRejectedValueOnce({ response: { status: 404 } }).mockRejectedValueOnce({ response: { status: 404 } });
    await state.test();
    expect(state.result.value?.status).toBe("unavailable");
    expect(state.connection.value.exists).toBe(true);
  });
  it("does not replay a committed save when cache refresh fails", async () => {
    harness.api.mockResolvedValueOnce({ data: {} });
    harness.refresh.mockRejectedValueOnce(new Error("Cache unavailable"));
    const state = useUnigateConnection();
    expect(await state.save({ tenantId: saved.tenantId, sendUrl: saved.sendUrl, key: "" })).toBe(true);
    expect(state.connection.value.exists).toBe(true);
    expect(state.notice.value).toContain("Settings saved");
    expect(harness.api).toHaveBeenCalledTimes(1);
  });
  it("only reports verified after an explicit successful check; later errors clear that result", async () => {
    const state = useUnigateConnection();
    harness.api.mockResolvedValueOnce({ data: { status: "connected", checkedAt: "2026-10-03T12:00:00Z" } });
    await state.test();
    expect(state.result.value?.status).toBe("connected");
    harness.api.mockResolvedValueOnce({ data: { status: "unauthorized" } });
    await state.test();
    expect(state.result.value?.status).toBe("unauthorized");
    harness.api.mockResolvedValueOnce({ data: { unexpected: true } });
    await state.test();
    expect(state.result.value?.status).toBe("error");
  });
  it("checks the saved tenant through the existing uncached OMS proxy when the new endpoint is unavailable", async () => {
    const state = useUnigateConnection();
    harness.api.mockRejectedValueOnce({ response: { status: 404 } }).mockResolvedValueOnce({ data: { shipGatewayConfigList: [{ shippingGatewayConfigId: "FEDEX" }] } });
    await state.test();
    expect(harness.api).toHaveBeenLastCalledWith({ url: "oms/shipping/gatewayConfigs", method: "get", cache: false });
    expect(state.result.value?.status).toBe("connected");
    expect(state.connection.value.hasKey).toBe(true);
  });
  it("does not treat an error envelope, missing provider list, or malformed provider list as connected", async () => {
    const state = useUnigateConnection();
    for(const data of [{ error: true, shipGatewayConfigList: [] }, {}, { shipGatewayConfigList: [{}] }]) {
      harness.api.mockRejectedValueOnce({ response: { status: 404 } }).mockResolvedValueOnce({ data });
      await state.test();
      expect(state.result.value?.status).toBe("invalid-response");
    }
  });

  it("distinguishes an upstream missing route from rejected credentials without displaying server errors", async () => {
    const state = useUnigateConnection();
    for(const [code, expected] of [["404", "route-unavailable"], ["401", "unauthorized"], ["403", "unauthorized"]]) {
      harness.api.mockRejectedValueOnce({ response: { status: 404 } }).mockRejectedValueOnce({ response: { status: 400, data: { errors: `Upstream status code: ${code}` } } });
      await state.test();
      expect(state.result.value?.status).toBe(expected);
    }
  });

  it("verifies credentials independently when the carrier route is missing, without claiming carrier compatibility", async () => {
    harness.api.mockRejectedValueOnce({ response: { status: 404 } })
      .mockRejectedValueOnce({ response: { status: 400, data: { errors: "Unsuccessful with status code: 404" } } })
      .mockResolvedValueOnce({ data: { commConfigList: [{ commGatewayConfigId: "KLAVIYO" }] } });
    const state = useUnigateConnection();
    await state.test();
    expect(harness.api).toHaveBeenLastCalledWith({ url: "oms/commGatewayConfigs", method: "get", cache: false });
    expect(state.result.value).toMatchObject({ status: "connected", carrierApiUnavailable: true });
    expect(state.connection.value.hasKey).toBe(true);
  });
  it("does not verify credentials through an invalid alternate registry response", async () => {
    const state = useUnigateConnection();
    for(const data of [{}, { commConfigList: [{}] }, { error: true, commConfigList: [] }]) {
      harness.api.mockRejectedValueOnce({ response: { status: 404 } })
        .mockRejectedValueOnce({ response: { status: 400, data: { errors: "Unsuccessful with status code: 404" } } })
        .mockResolvedValueOnce({ data });
      await state.test();
      expect(state.result.value?.status).toBe("route-unavailable");
    }
  });

});
