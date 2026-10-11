import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.fn();

vi.mock("@common", () => ({
  api: (...args: any[]) => api(...args),
  commonUtil: { hasError: (resp: any) => !!resp?.error },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/composables/useFacilities", async () => {
  const { ref } = await import("vue");
  return { useFacilities: () => ({ facilities: ref([{ facilityId: "101", facilityName: "Store 101" }]) }) };
});

import { useNotificationSubscriptions } from "@/composables/useNotificationSubscriptions";

function mockBackend(topicRows: any[]) {
  api.mockImplementation(async (config: any) => {
    if(config.url === "admin/enums") {
      return { data: [{ enumId: "READY_FOR_PICKUP", description: "Ready for pickup" }, { enumId: "NEW_ORDER", description: "New order" }] };
    }
    if(config.url === "firebase/user/notificationtopic") return { data: topicRows };
    if(config.url === "oms/users") return { data: [] };
    return { data: [] };
  });
}

describe("useNotificationSubscriptions subscriber data", () => {
  beforeEach(() => {
    api.mockReset();
  });

  it("does not report subscriber data when the response holds topic metadata rows only", async () => {
    mockBackend([
      { topic: "acme-uat-101-READY_FOR_PICKUP", topicTypeId: "BOPIS" },
      { topic: "acme-uat-101-NEW_ORDER", topicTypeId: "BOPIS" }
    ]);
    const subscriptions = useNotificationSubscriptions();

    await subscriptions.load("BOPIS");

    expect(subscriptions.topics.value).toHaveLength(2);
    expect(subscriptions.hasSubscriberData.value).toBe(false);
    expect(subscriptions.topics.value.every((topic) => topic.userIds.length === 0)).toBe(true);
    expect(api.mock.calls.some(([config]) => config.url === "oms/users")).toBe(false);
  });

  it("reports subscriber totals when NotificationTopicUser rows carry userId", async () => {
    mockBackend([
      { topic: "acme-uat-101-READY_FOR_PICKUP", userId: "U1" },
      { topic: "acme-uat-101-READY_FOR_PICKUP", userId: "U2" },
      { topic: "acme-uat-101-NEW_ORDER", userId: "U1" }
    ]);
    const subscriptions = useNotificationSubscriptions();

    await subscriptions.load("BOPIS");

    expect(subscriptions.hasSubscriberData.value).toBe(true);
    expect(subscriptions.userCount.value).toBe(2);
  });
});
