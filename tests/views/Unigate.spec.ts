// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.fn();

vi.mock("@common", () => ({
  api: (args: any) => apiMock(args),
  commonUtil: {
    hasError: (res: any) => Boolean(res?.data?.error),
  },
  showToast: vi.fn(),
  translate: (k: string, v: Record<string, any> = {}) =>
    Object.entries(v).reduce((m, [key, val]) => m.replace(`{${key}}`, String(val)), k),
}));

vi.mock("@ionic/vue", async () => {
  const actual = await vi.importActual<any>("@ionic/vue");
  return {
    ...actual,
    modalController: {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    },
    alertController: {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };
});

describe("Unigate View", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.mockResolvedValue({ data: [] });
  });

  it("renders Unigate page header and segments", async () => {
    const Unigate = (await import("@/views/Unigate.vue")).default;
    const wrapper = mount(Unigate);

    expect(wrapper.text()).toContain("Unigate Gateway");
    expect(wrapper.find("[data-testid='unigate-segment-tabs']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='tab-credentials']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='tab-mappings']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='tab-billing']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='tab-connection']").exists()).toBe(true);
  });

  it("opens modal when clicking Add credentials button", async () => {
    const { modalController } = await import("@ionic/vue");
    const Unigate = (await import("@/views/Unigate.vue")).default;
    const wrapper = mount(Unigate);

    const addBtn = wrapper.find("[data-testid='add-credential-btn']");
    expect(addBtn.exists()).toBe(true);

    await addBtn.trigger("click");
    expect(modalController.create).toHaveBeenCalled();
  });
});
