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
      mappings: {
        get value() {
          return mocks.mappings
        },
      },
      hydrated: computed(() => mocks.hydrated),
    }),
    useShopifyShopMutations: () => ({
      saveTypeMapping: mocks.saveTypeMapping,
      deleteTypeMapping: mocks.deleteTypeMapping,
      refreshTypeMappings: mocks.refreshTypeMappings,
    }),
  }
})

vi.mock("@ionic/vue", () => ({
  IonButton: defineComponent({ template: "<button v-bind=\"$attrs\"><slot /></button>" }),
  IonCard: defineComponent({ template: "<section><slot /></section>" }),
  IonCardContent: defineComponent({ template: "<div><slot /></div>" }),
  IonCardHeader: defineComponent({ template: "<header><slot /></header>" }),
  IonCardSubtitle: defineComponent({ template: "<p><slot /></p>" }),
  IonCardTitle: defineComponent({ template: "<h2><slot /></h2>" }),
  IonIcon: defineComponent({ template: "<i v-bind=\"$attrs\" />" }),
  IonInput: defineComponent({
    props: ["value"],
    emits: ["ionInput"],
    template: "<input :value=\"value\" @input=\"$emit('ionInput', { detail: { value: $event.target.value } })\" />",
  }),
  IonItem: defineComponent({ template: "<div v-bind=\"$attrs\"><slot /></div>" }),
  IonLabel: defineComponent({ template: "<label><slot /></label>" }),
  IonList: defineComponent({ template: "<div><slot /></div>" }),
  IonSkeletonText: defineComponent({ template: "<span data-testid=\"skeleton\" />" }),
}))

import ProductCalendarMappingsCard from "@/components/shopify-product-sync/ProductCalendarMappingsCard.vue"
import { CACHE_RECONCILIATION_ERROR_MESSAGE, CacheReconciliationError } from "@/utils/cacheReconciliationError"

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

  it("shows cached selectors for all supported calendar fields", () => {
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    expect(wrapper.text()).toContain("Product calendar mappings")
    expect(wrapper.findAll("input")).toHaveLength(4)
    expect(wrapper.get("[data-testid=\"calendar-mapping-releaseDate\"] input").element.value)
      .toBe("calendar:release_date")
  })

  it("saves a non-empty selector to its calendar destination field", async () => {
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    await wrapper.get("[data-testid=\"calendar-mapping-releaseDate\"] input").setValue("calendar:launch")
    await wrapper.get("[data-testid=\"save-calendar-mapping-releaseDate\"]").trigger("click")
    await flushPromises()

    expect(mocks.saveTypeMapping).toHaveBeenCalledWith({
      mappedTypeId: "SHOPIFY_PRODUCT_CALENDAR_DATE",
      mappedKey: "releaseDate",
      mappedValue: "calendar:launch",
    })
    expect(mocks.deleteTypeMapping).not.toHaveBeenCalled()
  })

  it("deletes a configured destination when its selector is cleared", async () => {
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    await wrapper.get("[data-testid=\"calendar-mapping-releaseDate\"] input").setValue("")
    await wrapper.get("[data-testid=\"save-calendar-mapping-releaseDate\"]").trigger("click")
    await flushPromises()

    expect(mocks.deleteTypeMapping).toHaveBeenCalledWith({ mappedKey: "releaseDate" })
    expect(mocks.saveTypeMapping).not.toHaveBeenCalled()
  })

  it("keeps the field dirty and reports an error when OMS rejects a save", async () => {
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })
    mocks.hasError.mockReturnValueOnce(true)

    await wrapper.get("[data-testid=\"calendar-mapping-releaseDate\"] input").setValue("calendar:launch")
    await wrapper.get("[data-testid=\"save-calendar-mapping-releaseDate\"]").trigger("click")
    await flushPromises()

    expect(mocks.showToast).toHaveBeenCalledWith("Failed to update mapping")
    expect(wrapper.get("[data-testid=\"save-calendar-mapping-releaseDate\"]").attributes("disabled")).toBeUndefined()
  })

  it("shows skeletons instead of editable blanks until the mapping cache hydrates", () => {
    mocks.hydrated = false
    mocks.mappings = []
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    expect(wrapper.findAll("input")).toHaveLength(0)
    expect(wrapper.findAll("[data-testid=\"skeleton\"]")).toHaveLength(4)
    expect(wrapper.text()).toContain("Release date")
  })

  it("locks every field while any save is pending", async () => {
    let finishSave: (value: unknown) => void = () => undefined
    mocks.saveTypeMapping.mockReturnValueOnce(new Promise((resolve) => { finishSave = resolve }))
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    await wrapper.get("[data-testid=\"calendar-mapping-introductionDate\"] input").setValue("calendar:intro")
    await wrapper.get("[data-testid=\"calendar-mapping-releaseDate\"] input").setValue("calendar:launch")
    await wrapper.get("[data-testid=\"save-calendar-mapping-releaseDate\"]").trigger("click")

    expect(wrapper.get("[data-testid=\"save-calendar-mapping-introductionDate\"]").attributes("disabled")).toBeDefined()
    expect(wrapper.get("[data-testid=\"calendar-mapping-introductionDate\"] input").attributes("disabled")).toBeDefined()

    finishSave({})
    await flushPromises()

    expect(wrapper.get("[data-testid=\"save-calendar-mapping-introductionDate\"]").attributes("disabled")).toBeUndefined()
  })

  it("treats a failed cache refresh after a committed save as saved, so it cannot be replayed", async () => {
    mocks.saveTypeMapping.mockRejectedValueOnce(new CacheReconciliationError("shopifyTypeMapping", { shopId: "SHOP_1" }))
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    await wrapper.get("[data-testid=\"calendar-mapping-releaseDate\"] input").setValue("calendar:launch")
    await wrapper.get("[data-testid=\"save-calendar-mapping-releaseDate\"]").trigger("click")
    await flushPromises()

    expect(mocks.showToast).toHaveBeenCalledWith(CACHE_RECONCILIATION_ERROR_MESSAGE)
    expect(mocks.showToast).not.toHaveBeenCalledWith("Failed to update mapping")
    expect(wrapper.get("[data-testid=\"save-calendar-mapping-releaseDate\"]").attributes("disabled")).toBeDefined()
    expect(mocks.saveTypeMapping).toHaveBeenCalledTimes(1)
  })
})
