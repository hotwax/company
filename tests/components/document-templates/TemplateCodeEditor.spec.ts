// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import TemplateCodeEditor from "@/components/document-templates/TemplateCodeEditor.vue";

enableAutoUnmount(afterEach);

describe("template code editor", () => {
  it("shows the code in a CodeMirror editor with numbered lines", async () => {
    const wrapper = mount(TemplateCodeEditor, { props: { modelValue: "<fo:root>\n  <#if x>a</#if>\n</fo:root>", label: "Template code" }, attachTo: document.body });
    await flushPromises();
    const editor = wrapper.element.querySelector(".cm-editor");
    expect(editor).not.toBeNull();
    expect(editor?.querySelectorAll(".cm-line").length).toBe(3);
    expect(editor?.querySelector(".cm-content")?.getAttribute("aria-label")).toBe("Template code");
  });

  it("is not editable when read-only", async () => {
    const wrapper = mount(TemplateCodeEditor, { props: { modelValue: "<a/>", label: "Template code", readonly: true }, attachTo: document.body });
    await flushPromises();
    expect(wrapper.element.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("false");
  });
});
