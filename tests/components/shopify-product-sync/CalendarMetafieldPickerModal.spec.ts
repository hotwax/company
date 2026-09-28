// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, h, inject, provide } from "vue"

const mocks = vi.hoisted(() => ({
  fetchShopifyMetafieldDefinitions: vi.fn(),
  scrollToTop: vi.fn(),
}))

vi.mock("@common", () => ({
  translate: (key: string, params?: Record<string, string>) => params ? key.replace(/\{(\w+)\}/g, (_, name) => params[name]) : key,
  logger: { error: vi.fn() },
}))

vi.mock("@/composables/useShopify", () => ({
  fetchShopifyMetafieldDefinitions: mocks.fetchShopifyMetafieldDefinitions,
}))

vi.mock("@ionic/vue", () => {
  const passthrough = (tag = "div") => defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
  const model = (type?: string) => defineComponent({
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: type === "checkbox"
      ? "<label v-bind=\"$attrs\"><input type=\"checkbox\" :checked=\"modelValue\" @change=\"$emit('update:modelValue', $event.target.checked)\" /><slot /></label>"
      : "<input v-bind=\"$attrs\" :value=\"modelValue\" @input=\"$emit('update:modelValue', $event.target.value)\" />",
  })

  return {
    IonButton: passthrough("button"),
    IonButtons: passthrough(),
    IonCheckbox: model("checkbox"),
    IonContent: defineComponent({
      inheritAttrs: false,
      setup: (_, { attrs, slots }) => () => h("div", { ...attrs, ref: (element: any) => { if(element) {element.scrollToTop = mocks.scrollToTop} } }, slots.default?.()),
    }),
    IonFooter: passthrough(),
    IonHeader: passthrough(),
    IonIcon: passthrough("i"),
    IonInput: model(),
    IonItem: passthrough(),
    IonLabel: passthrough(),
    IonList: passthrough(),
    IonListHeader: passthrough("h3"),
    IonModal: defineComponent({ props: ["isOpen"], template: "<div v-if=\"isOpen\"><slot /></div>" }),
    IonRadio: defineComponent({
      props: ["value"],
      setup(props, { attrs, slots }) {
        const group = inject<{ select: (value: string) => void, value: () => string }>("radioGroup")!

        return () => h("button", { ...attrs, "data-radio": props.value, "aria-checked": String(group.value() === props.value), onClick: () => group.select(props.value) }, slots.default?.())
      },
    }),
    IonRadioGroup: defineComponent({
      props: ["modelValue"],
      emits: ["update:modelValue"],
      setup(props, { emit, slots }) {
        provide("radioGroup", { select: (value: string) => emit("update:modelValue", value), value: () => props.modelValue })

        return () => h("div", slots.default?.())
      },
    }),
    IonSearchbar: model(),
    IonSegment: defineComponent({
      props: ["modelValue"],
      emits: ["update:modelValue"],
      setup(props, { emit, slots }) {
        provide("segment", { select: (value: string) => emit("update:modelValue", value), value: () => props.modelValue })

        return () => h("div", slots.default?.())
      },
    }),
    IonSegmentButton: defineComponent({
      props: ["value"],
      setup(props, { attrs, slots }) {
        const segment = inject<{ select: (value: string) => void, value: () => string }>("segment")!

        return () => h("button", { ...attrs, "aria-selected": String(segment.value() === props.value), onClick: () => segment.select(props.value) }, slots.default?.())
      },
    }),
    IonSpinner: passthrough("span"),
    IonTitle: passthrough("h2"),
    IonToolbar: passthrough(),
  }
})

import CalendarMetafieldPickerModal from "@/components/shopify-product-sync/CalendarMetafieldPickerModal.vue"

const DEFINITIONS = [
  { ownerType: "PRODUCT", name: "Go live date", namespace: "custom", key: "go_live_date", type: "date", selector: "custom:go_live_date" },
  { ownerType: "PRODUCT", name: "Launch time", namespace: "custom", key: "launch_at", type: "date_time", selector: "custom:launch_at" },
  { ownerType: "PRODUCT", name: "Notes", namespace: "custom", key: "notes", type: "single_line_text_field", selector: "custom:notes" },
  { ownerType: "PRODUCTVARIANT", name: "Ship date", namespace: "rails", key: "ship_date", type: "date", selector: "rails:ship_date" },
]

async function mountPicker(props: Partial<{ currentSelector: string, saving: boolean }> = {}) {
  const wrapper = mount(CalendarMetafieldPickerModal, {
    props: {
      field: { key: "releaseDate", label: "Release date" },
      currentSelector: "",
      systemMessageRemoteId: "REMOTE_1",
      saving: false,
      ...props,
    },
  })
  await flushPromises()

  return wrapper
}

const saveButton = (wrapper: any) => wrapper.get("[data-testid=\"save-calendar-mapping\"]")

async function enterManually(wrapper: any, selector: string) {
  await wrapper.get("[data-testid=\"metafield-mode-manual\"]").trigger("click")
  await wrapper.get("[data-testid=\"manual-metafield-input\"]").setValue(selector)
}

async function checkOnShopify(wrapper: any) {
  await wrapper.get("[data-testid=\"check-manual-metafield\"]").trigger("click")
  await flushPromises()
}

describe("CalendarMetafieldPickerModal", () => {
  beforeEach(() => {
    mocks.fetchShopifyMetafieldDefinitions.mockReset().mockResolvedValue(DEFINITIONS)
    mocks.scrollToTop.mockReset()
  })

  it("lists only date metafields, grouped into product and variant sections", async () => {
    const wrapper = await mountPicker()

    expect(mocks.fetchShopifyMetafieldDefinitions).toHaveBeenCalledWith("REMOTE_1")
    expect(wrapper.findAll("h3").map((header) => header.text())).toEqual(["Product metafields", "Variant metafields"])
    expect(wrapper.findAll("[data-radio]").map((radio) => radio.attributes("data-radio"))).toEqual([
      "PRODUCT|custom:go_live_date",
      "PRODUCT|custom:launch_at",
      "PRODUCTVARIANT|rails:ship_date",
    ])
    expect(wrapper.text()).toContain("Date and time")
  })

  it("selects the current mapping and keeps Save off until the choice changes", async () => {
    const wrapper = await mountPicker({ currentSelector: "custom:go_live_date" })

    expect(wrapper.get("[data-radio=\"PRODUCT|custom:go_live_date\"]").attributes("aria-checked")).toBe("true")
    expect(saveButton(wrapper).attributes("disabled")).toBeDefined()

    await wrapper.get("[data-radio=\"PRODUCTVARIANT|rails:ship_date\"]").trigger("click")
    await saveButton(wrapper).trigger("click")

    expect(wrapper.emitted("save")).toEqual([["rails:ship_date"]])
  })

  it("checks in place, without swapping the list or the form for a loading state", async () => {
    const wrapper = await mountPicker()
    let finishCheck: (value: unknown) => void = () => undefined
    mocks.fetchShopifyMetafieldDefinitions.mockReturnValueOnce(new Promise((resolve) => { finishCheck = resolve }))

    await enterManually(wrapper, "custom:launch_at")
    await wrapper.get("[data-testid=\"check-manual-metafield\"]").trigger("click")

    expect(wrapper.get("[data-testid=\"manual-metafield-result\"]").text()).toBe("Checking Shopify")
    expect(wrapper.get("[data-testid=\"check-manual-metafield\"]").text()).toBe("Check on Shopify")
    expect(wrapper.find("[data-testid=\"manual-metafield-input\"]").exists()).toBe(true)

    await wrapper.get("[data-testid=\"metafield-mode-list\"]").trigger("click")
    expect(wrapper.text()).not.toContain("Loading Shopify metafields")
    expect(wrapper.findAll("[data-radio]")).toHaveLength(3)

    finishCheck(DEFINITIONS)
    await flushPromises()
    await wrapper.get("[data-testid=\"metafield-mode-manual\"]").trigger("click")

    expect(wrapper.get("[data-testid=\"manual-metafield-result\"]").text()).toBe("Matches Launch time on Shopify.")
  })

  it("resets the scroll position when switching between the list and manual entry", async () => {
    const wrapper = await mountPicker()

    await wrapper.get("[data-testid=\"metafield-mode-manual\"]").trigger("click")

    expect(mocks.scrollToTop).toHaveBeenCalledWith(0)
  })

  it("filters the list by name, namespace, or key", async () => {
    const wrapper = await mountPicker()

    await wrapper.get("[placeholder=\"Search metafields\"]").setValue("ship")

    expect(wrapper.findAll("[data-radio]").map((radio) => radio.attributes("data-radio"))).toEqual(["PRODUCTVARIANT|rails:ship_date"])
    expect(wrapper.text()).toContain("No matching date metafields")
  })

  it("requires a Shopify check before saving a typed metafield, and enables Save on a match", async () => {
    const wrapper = await mountPicker()

    await enterManually(wrapper, "custom:launch_at")
    expect(saveButton(wrapper).attributes("disabled")).toBeDefined()

    await checkOnShopify(wrapper)

    expect(mocks.fetchShopifyMetafieldDefinitions).toHaveBeenCalledTimes(2)
    expect(wrapper.get("[data-testid=\"manual-metafield-result\"]").text()).toBe("Matches Launch time on Shopify.")
    expect(wrapper.find("[data-testid=\"acknowledge-metafield-warning\"]").exists()).toBe(false)
    await saveButton(wrapper).trigger("click")
    expect(wrapper.emitted("save")).toEqual([["custom:launch_at"]])
  })

  it("lets an unmatched metafield be saved only after the warning is acknowledged", async () => {
    const wrapper = await mountPicker()

    await enterManually(wrapper, "custom:not_on_shopify")
    await checkOnShopify(wrapper)

    expect(wrapper.get("[data-testid=\"manual-metafield-result\"]").text())
      .toBe("No product or variant metafield definition on Shopify matches custom:not_on_shopify.")
    expect(saveButton(wrapper).attributes("disabled")).toBeDefined()

    await wrapper.get("[data-testid=\"acknowledge-metafield-warning\"] input").setValue(true)
    await saveButton(wrapper).trigger("click")

    expect(wrapper.emitted("save")).toEqual([["custom:not_on_shopify"]])
  })

  it("warns when the typed metafield exists but is not a date", async () => {
    const wrapper = await mountPicker()

    await enterManually(wrapper, "custom:notes")
    await checkOnShopify(wrapper)

    expect(wrapper.get("[data-testid=\"manual-metafield-result\"]").text()).toContain("exists on Shopify as single_line_text_field, not a date")
    expect(wrapper.find("[data-testid=\"acknowledge-metafield-warning\"]").exists()).toBe(true)
  })

  it("discards the check and the acknowledgement when the typed value changes", async () => {
    const wrapper = await mountPicker()

    await enterManually(wrapper, "custom:not_on_shopify")
    await checkOnShopify(wrapper)
    await wrapper.get("[data-testid=\"acknowledge-metafield-warning\"] input").setValue(true)
    await wrapper.get("[data-testid=\"manual-metafield-input\"]").setValue("custom:other")

    expect(wrapper.get("[data-testid=\"manual-metafield-result\"]").text()).toBe("Check the metafield on Shopify before saving.")
    expect(wrapper.find("[data-testid=\"acknowledge-metafield-warning\"]").exists()).toBe(false)
    expect(saveButton(wrapper).attributes("disabled")).toBeDefined()
  })

  it("blocks a value the sync cannot parse, with no way to acknowledge past it", async () => {
    const wrapper = await mountPicker()

    await enterManually(wrapper, "go_live_date")
    await checkOnShopify(wrapper)

    expect(wrapper.get("[data-testid=\"manual-metafield-result\"]").text()).toBe("Use namespace:key, for example custom:release_date.")
    expect(wrapper.find("[data-testid=\"acknowledge-metafield-warning\"]").exists()).toBe(false)
    expect(saveButton(wrapper).attributes("disabled")).toBeDefined()
    expect(mocks.fetchShopifyMetafieldDefinitions).toHaveBeenCalledTimes(1)
  })

  it("treats an unreachable Shopify as unverified, which also needs acknowledgement", async () => {
    mocks.fetchShopifyMetafieldDefinitions.mockRejectedValue(new Error("Shopify connection is unavailable."))
    const wrapper = await mountPicker()

    expect(wrapper.get("[data-testid=\"metafield-load-error\"]").text()).toContain("Shopify connection is unavailable.")

    await enterManually(wrapper, "custom:go_live_date")
    await checkOnShopify(wrapper)

    expect(wrapper.get("[data-testid=\"manual-metafield-result\"]").text()).toBe("Could not check Shopify. Shopify connection is unavailable.")
    await wrapper.get("[data-testid=\"acknowledge-metafield-warning\"] input").setValue(true)
    expect(saveButton(wrapper).attributes("disabled")).toBeUndefined()
  })

  it("opens a current mapping that is not a listed date metafield in manual entry", async () => {
    const wrapper = await mountPicker({ currentSelector: "HC_PREORDER.PROMISE_DATE" })

    expect(wrapper.get("[data-testid=\"metafield-mode-manual\"]").attributes("aria-selected")).toBe("true")
    expect((wrapper.get("[data-testid=\"manual-metafield-input\"]").element as HTMLInputElement).value).toBe("HC_PREORDER.PROMISE_DATE")
  })

  it("offers Remove mapping only when a mapping exists, and emits an empty selector", async () => {
    expect((await mountPicker()).find("[data-testid=\"remove-calendar-mapping\"]").exists()).toBe(false)

    const wrapper = await mountPicker({ currentSelector: "custom:go_live_date" })
    await wrapper.get("[data-testid=\"remove-calendar-mapping\"]").trigger("click")

    expect(wrapper.emitted("save")).toEqual([[""]])
  })

  it("disables Save and Remove while the card is saving", async () => {
    const wrapper = await mountPicker({ currentSelector: "custom:go_live_date", saving: true })

    expect(saveButton(wrapper).attributes("disabled")).toBeDefined()
    expect(wrapper.get("[data-testid=\"remove-calendar-mapping\"]").attributes("disabled")).toBeDefined()
  })
})
