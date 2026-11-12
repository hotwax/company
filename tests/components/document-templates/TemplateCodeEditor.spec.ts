// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import TemplateCodeEditor from "@/components/document-templates/TemplateCodeEditor.vue";

enableAutoUnmount(afterEach);

describe("template code editor", () => {
  it("numbers every line and marks the line an error points at", () => {
    const wrapper = mount(TemplateCodeEditor, { props: { modelValue: "a\nb\nc", label: "Template code", errorLine: 2 } });
    const lines = wrapper.findAll(".gutter div");
    expect(lines.map(line => line.text())).toEqual(["1", "2", "3"]);
    expect(lines[1].classes()).toContain("error-line");
  });

  it("emits the edited code, and cannot be edited when read-only", async () => {
    const wrapper = mount(TemplateCodeEditor, { props: { modelValue: "a", label: "Template code" } });
    await wrapper.get("textarea").setValue("a\nb");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["a\nb"]);

    const readonly = mount(TemplateCodeEditor, { props: { modelValue: "a", label: "Template code", readonly: true } });
    expect(readonly.get("textarea").attributes("readonly")).toBeDefined();
  });
});
