// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, h, ref } from "vue"

const harness = vi.hoisted(() => ({
  enter: null as null | (() => void),
  leave: null as null | (() => void),
  cacheSync: null as any
}))

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value
}))

vi.mock("@ionic/vue", () => ({
  onIonViewDidEnter: (callback: () => void) => { harness.enter = callback },
  onIonViewDidLeave: (callback: () => void) => { harness.leave = callback }
}))

vi.mock("@/composables/useCacheSync", () => ({
  useCacheSync: () => harness.cacheSync
}))

import {
  mergeOrderSyncHistoryBatches,
  useShopifyOrderSyncHistorySession
} from "@/composables/useShopify"

function mountHistorySession(options: Parameters<typeof useShopifyOrderSyncHistorySession>[0]) {
  let session!: ReturnType<typeof useShopifyOrderSyncHistorySession>
  const Host = defineComponent({
    setup() {
      session = useShopifyOrderSyncHistorySession(options)

      return () => h("div")
    }
  })
  const wrapper = mount(Host)

  return { session, wrapper }
}

describe("useShopifyOrderSyncHistorySession", () => {
  beforeEach(() => {
    harness.enter = null
    harness.leave = null
    harness.cacheSync = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      syncNow: vi.fn().mockResolvedValue(undefined),
      error: ref("")
    }
  })

  it("activates exact-shop regular and onboarding history domains, refreshes in the worker, and stops on leave", async () => {
    const remoteIds = ref(["REMOTE-B", "REMOTE-A"])
    const { session, wrapper } = mountHistorySession({
      remoteIds: () => remoteIds.value,
      jobName: () => "sync_ShopifyOrderHistory_SHOP"
    })

    expect(harness.enter).toBeTypeOf("function")
    harness.enter?.()
    await flushPromises()

    const domains = harness.cacheSync.start.mock.calls.at(-1)[0]
    const messageDomains = domains.filter((domain: any) => domain.name === "systemMessage")
    expect(messageDomains).toHaveLength(2)
    expect(messageDomains).toEqual(expect.arrayContaining([
      expect.objectContaining({
        args: expect.objectContaining({
          systemMessageRemoteIds: ["REMOTE-B", "REMOTE-A"],
          types: [{ systemMessageTypeId: "ShopifyOrderSync", total: 100 }]
        })
      }),
      expect.objectContaining({
        args: expect.objectContaining({
          systemMessageRemoteIds: ["REMOTE-B", "REMOTE-A"],
          types: [{ systemMessageTypeId: "BulkOrderHistoryQuery", total: 100 }]
        })
      })
    ]))
    expect(domains).toContainEqual(expect.objectContaining({
      name: "dataManagerLog",
      args: { configId: "BULK_ORDER_HISTORY", total: 100 }
    }))
    expect(domains).toContainEqual(expect.objectContaining({
      name: "serviceJobRun",
      args: { jobNames: ["sync_ShopifyOrderHistory_SHOP"], total: 25 }
    }))

    await session.manualRefresh()
    expect(harness.cacheSync.syncNow).toHaveBeenCalled()

    harness.leave?.()
    expect(harness.cacheSync.stop).toHaveBeenCalled()
    wrapper.unmount()
  })

  it("starts no worker domains until the selected shop remote scope resolves", async () => {
    const { session, wrapper } = mountHistorySession({ remoteIds: () => [] })

    await session.activate()

    expect(harness.cacheSync.start).not.toHaveBeenCalled()
    expect(harness.cacheSync.stop).toHaveBeenCalled()
    wrapper.unmount()
  })

  it("keeps a merged regular and onboarding history newest-first", () => {
    expect(mergeOrderSyncHistoryBatches(
      [{ systemMessageId: "REGULAR", initDate: "2026-08-12T10:00:00Z" }],
      [
        { systemMessageId: "OLDER-HISTORY", initDate: "2026-08-12T09:00:00Z" },
        { systemMessageId: "NEWER-HISTORY", initDate: "2026-08-12T11:00:00Z" }
      ]
    ).map((batch) => batch.systemMessageId)).toEqual([
      "NEWER-HISTORY",
      "REGULAR",
      "OLDER-HISTORY"
    ])
  })
})
