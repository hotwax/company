import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  clearAuth: vi.fn(),
  updateUserId: vi.fn(),
  showToast: vi.fn(),
  loggerError: vi.fn()
}))

vi.mock("@common", () => ({
  api: mocks.api,
  commonUtil: {
    getMaargURL: () => "http://localhost:8080/rest/s1/",
    hasError: (response: any) => Boolean(response?.data?._ERROR_MESSAGE_),
    showToast: mocks.showToast
  },
  emitter: { emit: vi.fn() },
  logger: { error: mocks.loggerError },
  translate: (key: string) => key
}))

vi.mock("@common/composables/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: { value: true },
    clearAuth: mocks.clearAuth,
    updateUserId: mocks.updateUserId
  })
}))

vi.mock("@common/composables/useSolrSearch", () => ({
  useSolrSearch: () => ({})
}))

vi.mock("@/store/util", () => ({
  useUtilStore: () => ({})
}))

import { useUserStore } from "@/store/user"

describe("user profile session handling", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it("hydrates the user identity after a successful profile request", async () => {
    mocks.api.mockResolvedValue({
      data: { userId: "USER_1", timeZone: "Asia/Kolkata" }
    })

    const store = useUserStore()
    await store.fetchUserProfile()

    expect(store.current.userId).toBe("USER_1")
    expect(store.fetchStatus.profile).toBe("success")
    expect(mocks.updateUserId).toHaveBeenCalledWith("USER_1")
    expect(mocks.clearAuth).not.toHaveBeenCalled()
  })

  it("preserves the current session when profile refresh fails transiently", async () => {
    mocks.api.mockRejectedValue(new Error("Network Error"))

    const store = useUserStore()
    store.current = { userId: "USER_1" }

    await expect(store.fetchUserProfile()).rejects.toThrow()

    expect(store.current.userId).toBe("USER_1")
    expect(store.fetchStatus.profile).toBe("error")
    expect(mocks.clearAuth).not.toHaveBeenCalled()
    expect(mocks.loggerError).toHaveBeenCalledWith("fetchUserProfile", {
      message: "Network Error",
      status: undefined
    })
    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toContain("Authorization")
  })
})
