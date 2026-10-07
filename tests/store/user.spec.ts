// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useUserStore } from "@/store/user";

const harness = vi.hoisted(() => ({
  api: vi.fn().mockResolvedValue({ data: {} }),
  getOmsURL: vi.fn().mockReturnValue("https://oms.hotwax.io")
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: {
    getOmsURL: () => harness.getOmsURL(),
    getMaargURL: () => "https://oms.hotwax.io",
    hasError: () => false,
    showToast: vi.fn()
  },
  emitter: { emit: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
  bootstrapState: { running: false },
}));

describe("useUserStore - sendResetPasswordEmail", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    harness.api.mockClear();
  });

  it("sends sendResetPasswordMail payload with username", async () => {
    const userStore = useUserStore();
    await userStore.sendResetPasswordEmail({ username: "test.user" });

    expect(harness.api).toHaveBeenCalledTimes(1);
    expect(harness.api).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "sendResetPasswordMail",
        method: "post",
        baseURL: "https://oms.hotwax.io",
        data: { username: "test.user" }
      })
    );
  });
});
