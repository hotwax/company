// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { onMounted, reactive, ref } from "vue";

/**
 * The security-group filter must offer ONLY login-capable groups.
 *
 * The old util store fetched `admin/userGroups?groupTypeEnumId=UgtUserAccess`, so framework/system
 * groups (UgtMoquiAdmin, UgtRemoteSystems, …) never reached the picker. The cached `userGroup`
 * table deliberately holds EVERY group, so that scope now lives in the view as a client-side
 * filter — and nothing but these tests would notice if a cleanup "simplified" it away and quietly
 * re-exposed framework groups to user management.
 *
 * The cache also hydrates asynchronously, so the dropdown must cope with mounting against an empty
 * table and fill in when the rows land, still scoped.
 */

const harness = vi.hoisted(() => ({
  userGroups: undefined as any,
  userStore: undefined as any,
}));

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  onIonViewWillEnter: (cb: any) => onMounted(cb),
  onIonViewDidEnter: (cb: any) => onMounted(cb),
}));

vi.mock("@common", async () => ({
  translate: (key: string) => key,
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  commonUtil: { showToast: vi.fn(), hasError: () => false, formatUtcDate: () => "" },
  emitter: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

vi.mock("@/composables/useSecurity", () => ({
  useUserGroups: () => ({ userGroups: harness.userGroups, records: harness.userGroups, hydrated: ref(true) }),
}));

vi.mock("@/store/user", () => ({ useUserStore: () => harness.userStore }));

vi.mock("@/router", () => ({ default: { push: vi.fn(), replace: vi.fn() } }));

const ACCESS_GROUP = { userGroupId: "STORE_MANAGER", description: "Store Manager", groupTypeEnumId: "UgtUserAccess" };
const FRAMEWORK_GROUP = { userGroupId: "MOQUI_ADMIN", description: "Moqui Administrators", groupTypeEnumId: "UgtMoquiAdmin" };

async function mountView() {
  const Users = (await import("@/views/Users.vue")).default;
  const wrapper = mount(Users, { global: { stubs: { IonBackButton: true } } });
  await flushPromises();
  return wrapper;
}

/** The options the security-group filter actually offers ("All" plus one per group). */
function groupFilterOptions(wrapper: any): string[] {
  return wrapper
    .find("ion-select")
    .findAll("ion-select-option")
    .map((option: any) => option.text().trim());
}

describe("Users security-group filter scope", () => {
  beforeEach(() => {
    vi.resetModules();
    harness.userStore = reactive({
      query: { queryString: "", userGroupId: "", status: "" },
      getUsers: [],
      isScrollable: false,
      getUserProfile: {},
      hasPermission: () => true,
      fetchUsers: vi.fn(async () => true),
      getUserGroups: vi.fn(async () => []),
      updateQuery: vi.fn(async () => undefined),
      updateSelectedUser: vi.fn(async () => undefined),
      clearSelectedUser: vi.fn(),
    });
  });

  it("offers login-capable groups and hides framework/system groups", async () => {
    harness.userGroups = ref<any[]>([FRAMEWORK_GROUP, ACCESS_GROUP]);
    const wrapper = await mountView();

    const options = groupFilterOptions(wrapper);
    expect(options).toContain("Store Manager");
    expect(options).not.toContain("Moqui Administrators");
  });

  it("mounts against a cold cache and fills in — still scoped — once rows land", async () => {
    // Cold: the table is empty at mount, exactly as it is right after login.
    harness.userGroups = ref<any[]>([]);
    const wrapper = await mountView();

    expect(groupFilterOptions(wrapper)).toEqual(["All"]);

    // IndexedDB emits a moment later.
    harness.userGroups.value = [FRAMEWORK_GROUP, ACCESS_GROUP];
    await flushPromises();

    expect(groupFilterOptions(wrapper)).toEqual(["All", "Store Manager"]);
  });

  it("guides an empty search directly to the existing creation flow", async () => {
    harness.userGroups = ref([]);
    harness.userStore.query.queryString = "anil";
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("No users found");
    const create = wrapper.findAll("ion-button").find(button => button.text().trim() === "Create user")!;
    expect(create.exists()).toBe(true);
    expect(wrapper.find("ion-fab").exists()).toBe(false);
    await create.trigger("click");
    expect(harness.userStore.clearSelectedUser).toHaveBeenCalledOnce();
    const router = (await import("@/router")).default;
    expect(router.push).toHaveBeenCalledWith("/create-user");
  });

  it("offers search recovery without creation permission", async () => {
    harness.userGroups = ref([]);
    harness.userStore.query.queryString = "anil";
    harness.userStore.hasPermission = () => false;
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("Try another search or clear your filters");
    expect(wrapper.findAll("ion-button").some(button => button.text().trim() === "Create user")).toBe(false);
  });

  it("does not suggest creation before the search finishes", async () => {
    harness.userGroups = ref([]);
    harness.userStore.query.queryString = "anil";
    let complete!: (value: boolean) => void;
    harness.userStore.fetchUsers = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve; }));
    const wrapper = await mountView();
    expect(wrapper.text()).not.toContain("No users found");
    complete(true);
    await flushPromises();
    expect(wrapper.text()).toContain("No users found");
  });

  it("shows a retryable error instead of a creation prompt when search fails", async () => {
    harness.userGroups = ref([]);
    harness.userStore.query.queryString = "anil";
    harness.userStore.fetchUsers.mockResolvedValueOnce(false);
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("Unable to load users");
    expect(wrapper.text()).not.toContain("No users found");
    await wrapper.findAll("ion-button").find(button => button.text().trim() === "Try again")!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("No users found");
  });

  it("clears the search and both filters and reruns the query", async () => {
    harness.userGroups = ref([]);
    harness.userStore.query = { queryString: "anil", userGroupId: "STORE_MANAGER", status: "Y" };
    const wrapper = await mountView();
    await wrapper.findAll("ion-button").find(button => button.text().trim() === "Clear search and filters")!.trigger("click");
    await flushPromises();
    expect(harness.userStore.query).toEqual({ queryString: "", userGroupId: "", status: "" });
    expect(harness.userStore.fetchUsers).toHaveBeenCalledTimes(2);
  });

  it("keeps populated results and the existing floating create action", async () => {
    harness.userGroups = ref([]);
    harness.userStore.getUsers = [{ firstName: "Anil", username: "anil", partyId: "123" }];
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("Anil");
    expect(wrapper.text()).not.toContain("No users found");
    expect(wrapper.find("ion-fab").exists()).toBe(true);
  });

  it("does not claim there are no users when the pinned current user is visible", async () => {
    harness.userGroups = ref([]);
    harness.userStore.getUserProfile = { userId: "admin", userFullName: "Administrator" };
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("Administrator");
    expect(wrapper.text()).not.toContain("No users found");
  });

});
