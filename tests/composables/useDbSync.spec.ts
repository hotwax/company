// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useDbSync } from "@/composables/useDbSync";

const setDomainsMock = vi.fn(async () => {});
const syncNowMock = vi.fn(async () => {});
const refetchOneMock = vi.fn(async () => 1);
const registeredDomainsMock = vi.fn(async () => ["domainA", "domainB"]);

vi.mock("@/services/appDbSync", () => ({
  syncService: () => ({
    setDomains: setDomainsMock,
    syncNow: syncNowMock,
    refetchOne: refetchOneMock,
    registeredDomains: registeredDomainsMock,
  }),
  refreshAfterMutation: async (domain: string, pk: Record<string, unknown>) => refetchOneMock(domain, pk),
}));

describe("useDbSync composable", () => {
  it("activates domains via setDomains on shared worker during start", async () => {
    setDomainsMock.mockClear();
    registeredDomainsMock.mockClear();
    const { start, ready, activeDomains, registeredDomains } = useDbSync();

    const domains = [{ name: "domainA" }];
    await start(domains);

    expect(setDomainsMock).toHaveBeenCalledWith(domains);
    expect(ready.value).toBe(true);
    expect(activeDomains.value).toEqual(domains);
    expect(registeredDomains.value).toEqual(["domainA", "domainB"]);
  });

  it("delegates syncNow to the shared worker", async () => {
    syncNowMock.mockClear();
    const { syncNow } = useDbSync();

    await syncNow();

    expect(syncNowMock).toHaveBeenCalled();
  });

  it("delegates afterMutation to refreshAfterMutation", async () => {
    refetchOneMock.mockClear();
    const { afterMutation } = useDbSync();

    await afterMutation("domainA", { id: "123" });

    expect(refetchOneMock).toHaveBeenCalledWith("domainA", { id: "123" });
  });

  it("deactivates domains on stop", async () => {
    setDomainsMock.mockClear();
    const { start, stop, ready } = useDbSync();

    await start([{ name: "domainA" }]);
    stop();

    expect(setDomainsMock).toHaveBeenLastCalledWith([]);
    expect(ready.value).toBe(false);
  });
});
