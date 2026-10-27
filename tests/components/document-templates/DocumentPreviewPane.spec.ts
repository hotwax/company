// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IonButton, IonSelect } from "@ionic/vue";
import DocumentPreviewPane from "@/components/document-templates/DocumentPreviewPane.vue";

vi.mock("@common", () => ({ translate: (text: string, values: any = {}) => Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), text) }));
enableAutoUnmount(afterEach);
const page = { uri: "private://page", mimeType: "image/png", pageNumber: 1, widthPoints: 288, heightPoints: 432 };
const props = () => ({ revision: "22", documentName: "Warehouse packing slips", pageNumber: 1, pageCount: 1, pages: [page], busy: false });
const button = (wrapper: any, id: string) => wrapper.findAllComponents(IonButton).find((component: any) => component.attributes("data-testid") === id);
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); });

describe("document preview controls", () => {
  it("uses logical page geometry for fit and zoom even when the raster has higher resolution", async () => {
    let resize: (entries: any[]) => void = () => undefined;
    vi.stubGlobal("ResizeObserver", class { constructor(callback: any) { resize = callback; } observe() {} disconnect() {} });
    const wrapper = mount(DocumentPreviewPane, { props: { ...props(), src: "blob:image", pdfUrl: "blob:pdf" } });
    resize([{ contentRect: { width: 600, height: 648 } }]);
    await flushPromises();
    const image = wrapper.get('[data-testid="document-template-preview-image"]');
    Object.defineProperties(image.element, { naturalWidth: { value: 576 }, naturalHeight: { value: 864 } });
    await image.trigger("load");
    expect((image.element as HTMLImageElement).style.width).toBe("432px");
    expect(wrapper.text()).toContain("4 × 6 in");
    await wrapper.get('[data-testid="document-template-zoom-in-btn"]').trigger("click");
    expect((image.element as HTMLImageElement).style.width).toBe("504px");
    resize([{ contentRect: { width: 320, height: 600 } }]);
    await flushPromises();
    expect((image.element as HTMLImageElement).style.width).toBe("504px");
    await wrapper.get('[data-testid="document-template-fit-btn"]').trigger("click");
    expect((image.element as HTMLImageElement).style.width).toBe("320px");
    expect(button(wrapper, "document-template-pdf-btn").props()).toMatchObject({ href: "blob:pdf", target: "_blank" });
  });
  it("resets zoom for another page image and emits page selection", async () => {
    const wrapper = mount(DocumentPreviewPane, { props: { ...props(), src: "blob:one", pages: [page, { ...page, pageNumber: 2 }], pageCount: 2 } });
    await wrapper.get('[data-testid="document-template-zoom-in-btn"]').trigger("click");
    wrapper.findComponent(IonSelect).vm.$emit("ionChange", { detail: { value: "2" } });
    expect(wrapper.emitted("pageChange")).toEqual([[2]]);
    await wrapper.setProps({ src: "blob:two", pageNumber: 2 });
    expect(wrapper.get('[data-testid="document-template-preview-image"]').attributes("alt")).toBe("Warehouse packing slips preview, revision 22, page 2");
    expect(wrapper.text()).toContain("Page 2 of 2");
  });
  it("keeps empty, loading and failed states explicit and controls unavailable without artifacts", async () => {
    const wrapper = mount(DocumentPreviewPane, { props: props() });
    expect(wrapper.find('[data-testid="document-template-preview-empty"]').exists()).toBe(true);
    expect(button(wrapper, "document-template-fit-btn").props("disabled")).toBe(true);
    await wrapper.setProps({ busy: true });
    expect(wrapper.get('[data-testid="document-template-preview-stage"]').attributes("aria-busy")).toBe("true");
    expect(wrapper.find('[data-testid="document-template-preview-loading"]').exists()).toBe(true);
    await wrapper.setProps({ busy: false, error: "Source document could not be rendered", canCheck: true });
    expect(wrapper.get('[role="alert"]').text()).toBe("Source document could not be rendered");
    expect(wrapper.get('[data-testid="document-template-preview-status"]').text()).toBe("Needs attention");
    await wrapper.get('[data-testid="document-template-preview-status-btn"]').trigger("click");
    expect(wrapper.emitted("checkStatus")).toEqual([[]]);
    expect(button(wrapper, "document-template-pdf-btn").props("disabled")).toBe(true);
  });
});
