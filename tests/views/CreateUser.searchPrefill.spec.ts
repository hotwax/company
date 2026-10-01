// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { onMounted, ref } from "vue";
import { useUserAccountActions } from "@/composables/useSecurity";
import { clearSessionScopedState } from "@/composables/sessionScope";

const harness = vi.hoisted(() => ({
  enter: undefined as any,
  createUser: vi.fn(),
}));

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  onIonViewWillEnter: (cb: any) => { harness.enter = cb; onMounted(cb); },
}));
vi.mock("@/services/appCacheBootstrap", () => ({ resyncDomain: vi.fn() }));

vi.mock("@/router", () => ({ default: { push: vi.fn(), replace: vi.fn() } }));
vi.mock("@/store/user", () => ({ useUserStore: () => ({ createUser: harness.createUser }) }));
vi.mock("@/composables/useFacilities", () => ({ useFacilities: () => ({ facilities: ref([]) }) }));
vi.mock("@common", () => ({ translate: (key: string) => key, commonUtil: {}, logger: {} }));

async function mountView() {
  const CreateUser = (await import("@/views/CreateUser.vue")).default;
  const wrapper = mount(CreateUser, { global: { stubs: { IonBackButton: true } } });
  await flushPromises();
  return wrapper;
}

function names(wrapper: any) {
  const inputs = wrapper.findAllComponents({ name: "IonInput" });
  return [inputs[0].props("modelValue"), inputs[1].props("modelValue")];
}

describe("Create user search prefill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserAccountActions().clearUserCreationDraft();
  });

  it.each([
    ["Anil", "Anil", ""],
    ["Anil Patel", "Anil", "Patel"],
    ["Anil Kumar Patel", "Anil", "Kumar Patel"],
    ["  Anil   Kumar  Patel  ", "Anil", "Kumar Patel"],
    ["Mary-Jane O'Neill", "Mary-Jane", "O'Neill"],
    ["   ", "", ""],
  ])("prefills %j without submitting", async (name, firstName, lastName) => {
    useUserAccountActions().setUserCreationDraftFromSearch(name);
    const wrapper = await mountView();
    expect(names(wrapper)).toEqual([firstName, lastName]);
    expect(harness.createUser).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("opens a blank form when there is no search name", async () => {
    const wrapper = await mountView();
    expect(names(wrapper)).toEqual(["", ""]);
    wrapper.unmount();
  });

  it("uses the new search when Ionic re-enters a cached creation page", async () => {
    useUserAccountActions().setUserCreationDraftFromSearch("Anil Patel");
    const wrapper = await mountView();
    useUserAccountActions().setUserCreationDraftFromSearch("Mary Jane Watson");
    harness.enter();
    await flushPromises();
    expect(names(wrapper)).toEqual(["Mary", "Jane Watson"]);
    harness.enter();
    await flushPromises();
    expect(names(wrapper)).toEqual(["", ""]);
    expect(harness.createUser).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("clears an unused draft on logout", async () => {
    useUserAccountActions().setUserCreationDraftFromSearch("Anil Patel");
    clearSessionScopedState();
    const wrapper = await mountView();
    expect(names(wrapper)).toEqual(["", ""]);
    wrapper.unmount();
  });

});
