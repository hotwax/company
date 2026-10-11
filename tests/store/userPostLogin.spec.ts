import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const calls = vi.hoisted(() => [] as string[]);

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  cookieHelper: () => ({ get: () => "" }),
  emitter: { emit: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (key: string) => key,
}));
vi.mock("@common/composables/useAuth", () => ({ useAuth: () => ({}) }));
vi.mock("@common/composables/useSolrSearch", () => ({ useSolrSearch: () => ({}) }));
vi.mock("@/composables/useServiceJobs", () => ({ useServiceJob: () => ({}) }));
vi.mock("@/composables/useSeed", () => ({ useMaargConfig: () => ({ load: () => calls.push("loadMaargConfig") }) }));
vi.mock("@/services/appDbSync", () => ({
  stopAppDbSync: vi.fn(async () => { calls.push("wipe"); }),
  startAppDbSync: vi.fn(async () => { calls.push("start"); }),
}));

import { useUserStore } from "@/store/user";

/**
 * A session that expires while nothing is requesting never reaches `postLogout`, so the local
 * database survives into the next login. `postLogin` therefore wipes it first — before the profile
 * and permission loads, which read cached product stores — and only then starts the sync.
 */
describe("postLogin", () => {
  beforeEach(() => {
    calls.length = 0;
    setActivePinia(createPinia());
  });

  it("wipes the local database before anything reads it, then starts the sync", async () => {
    const store = useUserStore();
    store.fetchUserProfile = vi.fn(async () => { calls.push("profile"); }) as any;
    store.fetchPermissions = vi.fn(async () => { calls.push("permissions"); }) as any;

    await store.postLogin();

    expect(calls).toEqual(["wipe", "profile", "permissions", "loadMaargConfig", "start"]);
  });
});
