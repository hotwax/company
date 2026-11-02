// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { modalController } from "@ionic/vue";
import AppVersion from "@/views/AppVersion.vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), discover: vi.fn() }));
vi.mock("@common", () => ({ translate: (s: string) => s, commonUtil: { showToast: vi.fn() }, emitter: { emit: vi.fn() }, logger: { error: vi.fn() } }));
vi.mock("@ionic/vue", async importOriginal => ({ ...await importOriginal<any>(), onIonViewWillEnter: vi.fn(), modalController: { create: vi.fn() } }));
vi.mock("@/components/app-version/SelectAppVersionModal.vue", () => ({ default: { template: "<div/>" } }));
vi.mock("@/components/app-version/AppVersionHistoryModal.vue", () => ({ default: { template: "<div/>" } }));
vi.mock("@/composables/useAppVersion", () => ({
  useApps: () => ({ apps: ref([{appId:"COMPANY",appName:"Company"},{appId:"JOB_MANAGER",appName:"Job Manager"},{appId:"OTHER",appName:"Other app"}]), hydrated: ref(true) }),
  useAppVersions: () => ({ byAppEnv: ref({JOB_MANAGER_AppEnvProd:{appId:"JOB_MANAGER",environmentTypeId:"AppEnvProd",currentVersion:"v3.3.0"}}), hydrated: ref(true) }),
  useHostedAppVersions: () => ({ refreshHostedVersions: mocks.discover, readCachedHostedVersions: vi.fn().mockResolvedValue(undefined), loading: ref(false), error: ref(false) }),
  useAppVersionMutations: () => ({ createAppVersion:mocks.create,updateAppVersion:mocks.update,removeAppVersion:mocks.remove })
}));
enableAutoUnmount(afterEach);
beforeEach(() => { vi.clearAllMocks(); mocks.discover.mockResolvedValue({ available: true, versions: ["v3.4.2", "v3.3.0"] }); vi.mocked(modalController.create).mockResolvedValue({ present: vi.fn() } as any); });

describe("app version matrix", () => {
  it("shows every registered app, including unpinned Company, with two chips and one combined history action", () => {
    const wrapper=mount(AppVersion);
    expect(wrapper.findAll('[data-testid$="-row"]')).toHaveLength(3);
    expect(wrapper.findAll('[data-testid$="-chip"]')).toHaveLength(6);
    expect(wrapper.findAll('[data-testid$="-history-btn"]')).toHaveLength(3);
    expect(wrapper.get('[data-testid="app-version-COMPANY-AppEnvUAT-chip"]').text()).toBe("Default");
    expect(wrapper.get('[data-testid="app-version-JOB_MANAGER-AppEnvProd-chip"]').text()).toBe("v3.3.0");
  });
  it("opens combined history for the clicked app without changing a version", async () => {
    const wrapper=mount(AppVersion); await wrapper.get('[data-testid="app-version-COMPANY-history-btn"]').trigger("click");
    expect(modalController.create).toHaveBeenCalledWith(expect.objectContaining({componentProps:{appId:"COMPANY",appName:"Company"}}));
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("creates an unpinned environment and updates an existing pin through their respective APIs", async () => {
    const wrapper=mount(AppVersion);
    await wrapper.get('[data-testid="app-version-COMPANY-AppEnvUAT-chip"]').trigger("click"); await flushPromises();
    let config=vi.mocked(modalController.create).mock.lastCall![0] as any; config.componentProps.onSave("v3.4.2"); await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({appId:"COMPANY",environmentTypeId:"AppEnvUAT",currentVersion:"v3.4.2"});
    await wrapper.get('[data-testid="app-version-JOB_MANAGER-AppEnvProd-chip"]').trigger("click"); await flushPromises();
    config=vi.mocked(modalController.create).mock.lastCall![0] as any; config.componentProps.onSave("v3.4.2"); await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({appId:"JOB_MANAGER",environmentTypeId:"AppEnvProd",currentVersion:"v3.4.2"});
  });
  it("rejects a version removed since the picker was opened", async () => {
    const wrapper=mount(AppVersion);
    await wrapper.get('[data-testid="app-version-COMPANY-AppEnvUAT-chip"]').trigger("click"); await flushPromises();
    const config=vi.mocked(modalController.create).mock.lastCall![0] as any;
    mocks.discover.mockResolvedValue({ available: true, versions: [] });
    expect(await config.componentProps.onSave("v3.4.2")).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("clears only the selected environment when Default is chosen", async () => {
    const wrapper=mount(AppVersion); await wrapper.get('[data-testid="app-version-JOB_MANAGER-AppEnvProd-chip"]').trigger("click"); await flushPromises();
    const config=vi.mocked(modalController.create).mock.lastCall![0] as any; config.componentProps.onSave(""); await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({appId:"JOB_MANAGER",environmentTypeId:"AppEnvProd",currentVersion:null});
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
