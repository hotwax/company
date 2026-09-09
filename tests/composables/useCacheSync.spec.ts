// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useCacheSync } from "@/composables/useCacheSync";

const setDomainsMock = vi.fn(async () => {});
const syncNowMock = vi.fn(async () => {});
const refetchOneMock = vi.fn(async () => 1);
const registeredDomainsMock = vi.fn(async () => ["domainA", "domainB"]);

vi.mock("@/services/appCacheBootstrap", () => ({
  syncService: () => ({
    setDomains: setDomainsMock,
    syncNow: syncNowMock,
    refetchOne: refetchOneMock,
    registeredDomains: registeredDomainsMock,
  }),
  refreshAfterMutation: async (domain: string, pk: Record<string, unknown>) => refetchOneMock(domain, pk),
}));

describe("useCacheSync composable", () => {
  it("activates domains via setDomains on shared worker during start", async () => {
    setDomainsMock.mockClear();
    registeredDomainsMock.mockClear();
    const { start, ready, activeDomains, registeredDomains } = useCacheSync();

    const domains = [{ name: "domainA" }];
    await start(domains);

    expect(setDomainsMock).toHaveBeenCalledWith(domains);
    expect(ready.value).toBe(true);
    expect(activeDomains.value).toEqual(domains);
    expect(registeredDomains.value).toEqual(["domainA", "domainB"]);
  });

  it("delegates syncNow to the shared worker", async () => {
    syncNowMock.mockClear();
    const { syncNow } = useCacheSync();

    await syncNow();

    expect(syncNowMock).toHaveBeenCalled();
  });

  it("delegates afterMutation to refreshAfterMutation", async () => {
    refetchOneMock.mockClear();
    const { afterMutation } = useCacheSync();

    await afterMutation("domainA", { id: "123" });

    expect(refetchOneMock).toHaveBeenCalledWith("domainA", { id: "123" });
  });

  it("deactivates domains on stop", async () => {
    setDomainsMock.mockClear();
    const { start, stop, ready } = useCacheSync();

    await start([{ name: "domainA" }]);
    stop();

    expect(setDomainsMock).toHaveBeenLastCalledWith([]);
    expect(ready.value).toBe(false);
  });
});
