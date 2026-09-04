// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.fn();

vi.mock("@common", () => ({
  api: (args: any) => apiMock(args),
  commonUtil: {
    hasError: (res: any) => Boolean(res?.data?.error || res?.data?._ERROR_MESSAGE_),
  },
  showToast: vi.fn(),
  translate: (k: string) => k,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn().mockResolvedValue(undefined),
}));

describe("useUnigate composable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches UNIGATE_CONFIG and provides isConfigured, tenantId, and sendUrl", async () => {
    apiMock.mockResolvedValueOnce({
      data: {
        systemMessageRemoteList: [
          {
            systemMessageRemoteId: "UNIGATE_CONFIG",
            internalId: "STORE",
            sendUrl: "https://unigate-uat.hotwax.io/rest/s1/unigate",
            publicKey: "key_123",
          },
        ],
      },
    });

    const {
      fetchUnigateRemoteConfig,
      useUnigate,
    } = await import("@/composables/useUnigate");

    const config = await fetchUnigateRemoteConfig(true);
    expect(config?.internalId).toBe("STORE");

    const { isConfigured, tenantId, sendUrl, hasKey } = useUnigate();
    expect(isConfigured.value).toBe(true);
    expect(tenantId.value).toBe("STORE");
    expect(sendUrl.value).toBe("https://unigate-uat.hotwax.io/rest/s1/unigate");
    expect(hasKey.value).toBe(true);
  });

  it("creates and deletes ShippingGatewayAuth credentials", async () => {
    apiMock
      .mockResolvedValueOnce({ data: { shipAuthId: "FEDEX_AUTH" } }) // create
      .mockResolvedValueOnce({ data: { shipAuthList: [{ shippingGatewayAuthId: "FEDEX_AUTH", shippingGatewayConfigId: "FEDEX" }] } }) // fetch
      .mockResolvedValueOnce({ data: {} }) // delete
      .mockResolvedValueOnce({ data: { shipAuthList: [] } }); // fetch

    const {
      createShippingGatewayAuth,
      deleteShippingGatewayAuth,
      useUnigate,
    } = await import("@/composables/useUnigate");

    await createShippingGatewayAuth({
      shippingGatewayConfigId: "FEDEX",
      shippingGatewayAuthId: "FEDEX_AUTH",
      description: "FedEx Prod",
      username: "user1",
    });

    expect(apiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "oms/shippingGatewayAuths",
        method: "post",
      })
    );

    const { shippingGatewayAuths } = useUnigate();
    expect(shippingGatewayAuths.value.length).toBe(1);

    await deleteShippingGatewayAuth("FEDEX_AUTH");
    expect(apiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "oms/shippingGatewayAuths/FEDEX_AUTH",
        method: "delete",
      })
    );
    expect(shippingGatewayAuths.value.length).toBe(0);
  });

  it("saves and deletes ShippingCarrierConfig mappings", async () => {
    apiMock
      .mockResolvedValueOnce({ data: { carrierConfigId: "M100" } }) // save
      .mockResolvedValueOnce({ data: [{ carrierConfigId: "M100", carrierPartyId: "FEDEX", productStoreId: "STORE", gatewayAuthId: "FEDEX_AUTH" }] }) // fetch
      .mockResolvedValueOnce({ data: {} }) // delete
      .mockResolvedValueOnce({ data: [] }); // fetch

    const {
      saveShippingCarrierConfig,
      deleteShippingCarrierConfig,
      useUnigate,
    } = await import("@/composables/useUnigate");

    await saveShippingCarrierConfig({
      carrierPartyId: "FEDEX",
      productStoreId: "STORE",
      gatewayAuthId: "FEDEX_AUTH",
    });

    expect(apiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "oms/shippingCarrierConfigs",
        method: "post",
      })
    );

    const { shippingCarrierConfigs } = useUnigate();
    expect(shippingCarrierConfigs.value.length).toBe(1);

    await deleteShippingCarrierConfig("M100");
    expect(apiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "oms/shippingCarrierConfigs/M100",
        method: "delete",
      })
    );
  });

  it("derives carrier readiness with matching auths and store configs", async () => {
    apiMock
      .mockResolvedValueOnce({
        data: {
          systemMessageRemoteList: [
            { systemMessageRemoteId: "UNIGATE_CONFIG", internalId: "STORE", sendUrl: "https://unigate.test" },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          shipAuthList: [{ shippingGatewayAuthId: "FEDEX_AUTH", shippingGatewayConfigId: "FEDEX" }],
        },
      })
      .mockResolvedValueOnce({
        data: [{ carrierConfigId: "M1", carrierPartyId: "FEDEX", productStoreId: "STORE", gatewayAuthId: "FEDEX_AUTH" }],
      });

    const {
      fetchUnigateRemoteConfig,
      fetchShippingGatewayAuths,
      fetchShippingCarrierConfigs,
      useCarrierUnigateReadiness,
    } = await import("@/composables/useUnigate");

    await fetchUnigateRemoteConfig(true);
    await fetchShippingGatewayAuths(true);
    await fetchShippingCarrierConfigs(true);

    const {
      tenantStatus,
      credentialStatus,
      storeLinkStatus,
      addressValidationStatus,
      matchingAuths,
    } = useCarrierUnigateReadiness("FEDEX");

    expect(tenantStatus.value).toBe("ready");
    expect(credentialStatus.value).toBe("ready");
    expect(storeLinkStatus.value).toBe("ready");
    expect(addressValidationStatus.value).toBe("ready");
    expect(matchingAuths.value.length).toBe(1);
  });
  it("registers its reset with sessionScope so logout clears Unigate state", async () => {
    apiMock.mockResolvedValueOnce({
      data: {
        systemMessageRemoteList: [
          { systemMessageRemoteId: "UNIGATE_CONFIG", internalId: "STORE", sendUrl: "https://unigate-uat.hotwax.io/rest/s1/unigate" },
        ],
      },
    });

    const { fetchUnigateRemoteConfig, useUnigate } = await import("@/composables/useUnigate");
    const { clearSessionScopedState } = await import("@/composables/sessionScope");

    await fetchUnigateRemoteConfig(true);
    const { isConfigured, unigateConfig, status } = useUnigate();
    expect(isConfigured.value).toBe(true);
    expect(status.value.config).toBe("success");

    // The user store's postLogout() runs exactly this sweep. A wrong-arity registration
    // (`onSessionCleared("useUnigate", fn)`) silently dropped the reset and leaked state.
    clearSessionScopedState();

    expect(unigateConfig.value).toBeNull();
    expect(isConfigured.value).toBe(false);
    expect(status.value.config).toBe("none");
  });
});
