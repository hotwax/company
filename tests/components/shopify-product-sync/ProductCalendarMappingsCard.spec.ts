// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils"
import { defineComponent } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  mappings: [] as any[],
  saveTypeMapping: vi.fn(),
  retireTypeMapping: vi.fn(),
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

vi.mock("@/composables/useShopify", () => ({
  useShopifyTypeMappings: () => ({
    mappings: {
      get value() {
        return mocks.mappings
      },
    },
  }),
  useShopifyShopMutations: () => ({
    saveTypeMapping: mocks.saveTypeMapping,
    retireTypeMapping: mocks.retireTypeMapping,
    refreshTypeMappings: mocks.refreshTypeMappings,
  }),
}))

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
}))

import ProductCalendarMappingsCard from "@/components/shopify-product-sync/ProductCalendarMappingsCard.vue"

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
    mocks.saveTypeMapping.mockReset().mockResolvedValue({})
    mocks.retireTypeMapping.mockReset().mockResolvedValue({})
    mocks.refreshTypeMappings.mockReset().mockResolvedValue(undefined)
    mocks.hasError.mockReset().mockReturnValue(false)
    mocks.showToast.mockReset()
    mocks.logger.error.mockReset()
  })

  it("shows cached selectors for all supported calendar fields", () => {
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    expect(wrapper.text()).toContain("Product calendar mappings")
    expect(wrapper.findAll("input")).toHaveLength(4)
    expect(wrapper.get('[data-testid="calendar-mapping-releaseDate"] input').element.value)
      .toBe("calendar:release_date")
  })

  it("saves a non-empty selector to its calendar destination field", async () => {
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    await wrapper.get('[data-testid="calendar-mapping-releaseDate"] input').setValue("calendar:launch")
    await wrapper.get('[data-testid="save-calendar-mapping-releaseDate"]').trigger("click")
    await flushPromises()

    expect(mocks.saveTypeMapping).toHaveBeenCalledWith({
      mappedTypeId: "SHOPIFY_PRODUCT_CALENDAR_DATE",
      mappedKey: "releaseDate",
      mappedValue: "calendar:launch",
    })
    expect(mocks.retireTypeMapping).not.toHaveBeenCalled()
  })

  it("retires a configured destination when its selector is cleared", async () => {
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })

    await wrapper.get('[data-testid="calendar-mapping-releaseDate"] input').setValue("")
    await wrapper.get('[data-testid="save-calendar-mapping-releaseDate"]').trigger("click")
    await flushPromises()

    expect(mocks.retireTypeMapping).toHaveBeenCalledWith({
      mappedTypeId: "SHOPIFY_PRODUCT_CALENDAR_DATE",
      mappedKey: "releaseDate",
    })
    expect(mocks.saveTypeMapping).not.toHaveBeenCalled()
  })

  it("keeps the field dirty and reports an error when OMS rejects a save", async () => {
    const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })
    mocks.hasError.mockReturnValueOnce(true)

    await wrapper.get('[data-testid="calendar-mapping-releaseDate"] input').setValue("calendar:launch")
    await wrapper.get('[data-testid="save-calendar-mapping-releaseDate"]').trigger("click")
    await flushPromises()

    expect(mocks.showToast).toHaveBeenCalledWith("Failed to update mapping")
    expect(wrapper.get('[data-testid="save-calendar-mapping-releaseDate"]').attributes("disabled")).toBeUndefined()
  })
})
