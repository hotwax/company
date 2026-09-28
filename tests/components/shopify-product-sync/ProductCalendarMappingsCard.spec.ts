// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent } from "vue"

const mocks = vi.hoisted(() => ({
  mappings: [] as any[],
  hydrated: true,
  saveTypeMapping: vi.fn(),
  deleteTypeMapping: vi.fn(),
  refreshTypeMappings: vi.fn(),
  hasError: vi.fn(),
  showToast: vi.fn(),
  logger: { error: vi.fn() },
}))

vi.mock("@common", () => ({
  translate: (value: string) => value,
  commonUtil: {
    hasError: mocks.hasError,
    showToast: mocks.showToast,
  },
  logger: mocks.logger,
}))

vi.mock("@/composables/useShopify", async () => {
  const { computed } = await import("vue")

  return {
    useShopifyTypeMappings: () => ({
      mappings: computed(() => mocks.mappings),
      hydrated: computed(() => mocks.hydrated),
    }),
    useShopifySyncContext: () => ({ remoteId: computed(() => "REMOTE_1") }),
    useShopifyShopMutations: () => ({
      saveTypeMapping: mocks.saveTypeMapping,
      deleteTypeMapping: mocks.deleteTypeMapping,
      refreshTypeMappings: mocks.refreshTypeMappings,
    }),
  }
})

vi.mock("@/components/shopify-product-sync/CalendarMetafieldPickerModal.vue", async () => {
  const { defineComponent: define } = await import("vue")

  return {
    default: define({
      name: "CalendarMetafieldPickerModal",
      props: ["field", "currentSelector", "systemMessageRemoteId", "saving"],
      emits: ["close", "save"],
      template: "<div data-testid=\"picker\" />",
    }),
  }
})

vi.mock("@ionic/vue", () => ({
  IonCard: defineComponent({ template: "<section><slot /></section>" }),
  IonCardHeader: defineComponent({ template: "<header><slot /></header>" }),
  IonCardSubtitle: defineComponent({ template: "<p><slot /></p>" }),
  IonCardTitle: defineComponent({ template: "<h2><slot /></h2>" }),
  IonItem: defineComponent({ template: "<div v-bind=\"$attrs\"><slot /></div>" }),
  IonLabel: defineComponent({ template: "<label><slot /></label>" }),
  IonList: defineComponent({ template: "<div><slot /></div>" }),
  IonSkeletonText: defineComponent({ template: "<span data-testid=\"skeleton\" />" }),
  IonSpinner: defineComponent({ template: "<span data-testid=\"spinner\" />" }),
}))

import PickerStub from "@/components/shopify-product-sync/CalendarMetafieldPickerModal.vue"
import ProductCalendarMappingsCard from "@/components/shopify-product-sync/ProductCalendarMappingsCard.vue"
import { CACHE_RECONCILIATION_ERROR_MESSAGE, CacheReconciliationError } from "@/utils/cacheReconciliationError"

const row = (wrapper: any, field: string) => wrapper.get(`[data-testid="calendar-mapping-${field}"]`)
const picker = (wrapper: any) => wrapper.getComponent(PickerStub)

async function pickFor(wrapper: any, field: string, selector: string) {
  await row(wrapper, field).trigger("click")
  picker(wrapper).vm.$emit("save", selector)
  await flushPromises()
}

describe("ProductCalendarMappingsCard", () => {
  beforeEach(() => {
    mocks.mappings = [
      {
        shopId: "SHOP_1",
        mappedTypeId: "SHOPIFY_PRODUCT_CALENDAR_DATE",
        mappedKey: "releaseDate",
        mappedValue: "calendar:release_date",
      },
    ]
    mocks.hydrated = true
    mocks.saveTypeMapping.mockReset().mockResolvedValue({})
    mocks.deleteTypeMapping.mockReset().mockResolvedValue({})
    mocks.refreshTypeMappings.mockReset().mockResolvedValue(undefined)
    mocks.hasError.mockReset().mockReturnValue(false)
    mocks.showToast.mockReset()
    mocks.logger.error.mockReset()
  })

  it("shows each calendar field with its mapped metafield or Not mapped", () => {
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    expect(row(wrapper, "releaseDate").text()).toContain("calendar:release_date")
    expect(row(wrapper, "introductionDate").text()).toContain("Not mapped")
    expect(picker(wrapper).props("field")).toBeNull()
  })

  it("opens the picker for the clicked field with its current mapping and the shop's Shopify connection", async () => {
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    await row(wrapper, "releaseDate").trigger("click")

    expect(picker(wrapper).props()).toMatchObject({
      field: { key: "releaseDate", label: "Release date" },
      currentSelector: "calendar:release_date",
      systemMessageRemoteId: "REMOTE_1",
      saving: false,
    })
  })

  it("saves the picked metafield to its calendar field and closes the picker", async () => {
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    await pickFor(wrapper, "introductionDate", "custom:intro_date")

    expect(mocks.saveTypeMapping).toHaveBeenCalledWith({
      mappedTypeId: "SHOPIFY_PRODUCT_CALENDAR_DATE",
      mappedKey: "introductionDate",
      mappedValue: "custom:intro_date",
    })
    expect(mocks.deleteTypeMapping).not.toHaveBeenCalled()
    expect(picker(wrapper).props("field")).toBeNull()
    expect(row(wrapper, "introductionDate").text()).toContain("custom:intro_date")
  })

  it("deletes a mapping when the picker removes it", async () => {
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    await pickFor(wrapper, "releaseDate", "")

    expect(mocks.deleteTypeMapping).toHaveBeenCalledWith({ mappedKey: "releaseDate" })
    expect(mocks.saveTypeMapping).not.toHaveBeenCalled()
  })

  it("keeps the picker open and the old value when OMS rejects a save", async () => {
    mocks.hasError.mockReturnValueOnce(true)
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    await pickFor(wrapper, "releaseDate", "calendar:launch")

    expect(mocks.showToast).toHaveBeenCalledWith("Failed to update mapping")
    expect(picker(wrapper).props("field")).toMatchObject({ key: "releaseDate" })
    expect(row(wrapper, "releaseDate").text()).toContain("calendar:release_date")
  })

  it("shows skeletons and ignores clicks until the mapping cache hydrates", async () => {
    mocks.hydrated = false
    mocks.mappings = []
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    expect(wrapper.findAll("[data-testid=\"skeleton\"]")).toHaveLength(4)
    expect(wrapper.text()).not.toContain("Not mapped")

    await row(wrapper, "releaseDate").trigger("click")
    expect(picker(wrapper).props("field")).toBeNull()
  })

  it("locks every field while any save is pending", async () => {
    let finishSave: (value: unknown) => void = () => undefined
    mocks.saveTypeMapping.mockReturnValueOnce(new Promise((resolve) => { finishSave = resolve }))
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    await row(wrapper, "releaseDate").trigger("click")
    picker(wrapper).vm.$emit("save", "calendar:launch")
    await flushPromises()

    expect(picker(wrapper).props("saving")).toBe(true)
    expect(row(wrapper, "introductionDate").attributes("disabled")).toBe("true")
    expect(row(wrapper, "releaseDate").find("[data-testid=\"spinner\"]").exists()).toBe(true)
    picker(wrapper).vm.$emit("close")
    picker(wrapper).vm.$emit("save", "calendar:other")
    await flushPromises()
    expect(picker(wrapper).props("field")).toMatchObject({ key: "releaseDate" })
    expect(mocks.saveTypeMapping).toHaveBeenCalledTimes(1)

    finishSave({})
    await flushPromises()

    expect(row(wrapper, "introductionDate").attributes("disabled")).toBe("false")
    expect(picker(wrapper).props("field")).toBeNull()
  })

  it("treats a failed cache refresh after a committed save as saved, so it cannot be replayed", async () => {
    mocks.saveTypeMapping.mockRejectedValueOnce(new CacheReconciliationError("shopifyTypeMapping", { shopId: "SHOP_1" }))
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    await pickFor(wrapper, "releaseDate", "calendar:launch")

    expect(mocks.showToast).toHaveBeenCalledWith(CACHE_RECONCILIATION_ERROR_MESSAGE)
    expect(mocks.showToast).not.toHaveBeenCalledWith("Failed to update mapping")
    expect(picker(wrapper).props("field")).toBeNull()
    expect(row(wrapper, "releaseDate").text()).toContain("calendar:launch")

    await row(wrapper, "releaseDate").trigger("click")
    expect(picker(wrapper).props("currentSelector")).toBe("calendar:launch")
    expect(mocks.saveTypeMapping).toHaveBeenCalledTimes(1)
  })
})
