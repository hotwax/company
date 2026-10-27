import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const api = vi.fn();

vi.mock("@common", () => ({
  api: (...args: any[]) => api(...args),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn() },
  translate: (value: string) => value,
  useDb: () => ({ records: ref([]), hydrated: ref(true) }),
}));

vi.mock("@/db/companyDb", () => ({
  companyDb: {},
}));

vi.mock("@/services/appDbSync", () => ({
  resyncDomain: vi.fn(),
}));

vi.mock("@ionic/vue", () => ({
  alertController: { create: vi.fn() },
}));

describe("useNetSuite — updateSftpConfig", () => {
  it("calls netsuite/sftpConfig with correct payload and method", async () => {
    api.mockResolvedValue({ data: { success: true } });
    const { useNetSuite } = await import("@/composables/useNetSuite");
    const { updateSftpConfig } = useNetSuite();

    const payload = {
      hostName: "sftp.example.com",
      userName: "test_user",
      port: "22",
      hostKey: "test_key",
      defaultDirectory: "/upload",
      secretId: "test_secret",
    };

    await updateSftpConfig(payload);

    expect(api).toHaveBeenCalledWith({
      url: "netsuite/sftpConfig",
      method: "post",
      data: payload,
    });
  });
});
