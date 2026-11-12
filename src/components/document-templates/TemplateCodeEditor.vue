<template>
  <div class="code-editor" data-testid="document-template-code" />
</template>

<script setup lang="ts">
import { indentWithTab } from "@codemirror/commands";
import { xml } from "@codemirror/lang-xml";
import { Compartment, EditorSelection, EditorState, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { getCurrentInstance, onBeforeUnmount, onMounted, watch } from "vue";

/**
 * A lightweight code editor for FreeMarker XSL-FO templates, on CodeMirror 6: XML highlighting (FreeMarker
 * directives read as tags), line numbers, folding, bracket matching, find and replace (Cmd/Ctrl+F), multiple
 * cursors, undo history and tag completion. The line a save error points at is marked.
 */
const props = defineProps<{ modelValue: string; readonly?: boolean; label: string; errorLine?: number }>();
const emit = defineEmits<{ (e: "update:modelValue", value: string): void }>();

// The component's own root element hosts the editor.
const instance = getCurrentInstance();
let view: EditorView | null = null;
const editable = new Compartment();

// The error line, as a decoration the server's line number points at.
const setErrorLine = StateEffect.define<number | undefined>();
const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for(const effect of transaction.effects) {
      if(!effect.is(setErrorLine)) {continue;}
      const builder = new RangeSetBuilder<Decoration>();
      const line = effect.value;
      if(line && line >= 1 && line <= transaction.state.doc.lines) {
        const from = transaction.state.doc.line(line).from;
        builder.add(from, from, Decoration.line({ class: "cm-template-error-line" }));
      }
      next = builder.finish();
    }
    return next;
  },
  provide: field => EditorView.decorations.from(field),
});

const editableExtensions = (readonly: boolean) => [EditorState.readOnly.of(readonly), EditorView.editable.of(!readonly)];

// Follows the app's Ionic colours, so it reads as part of the page in light and dark mode.
const theme = EditorView.theme({
  "&": { height: "70vh", fontSize: "13px", backgroundColor: "var(--ion-background-color, #fff)", color: "var(--ion-text-color, #000)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: "20px" },
  ".cm-gutters": { backgroundColor: "var(--ion-color-light, #f4f5f8)", color: "var(--ion-color-medium)", border: "none" },
  ".cm-activeLine": { backgroundColor: "rgba(var(--ion-color-primary-rgb, 56, 128, 255), 0.06)" },
  ".cm-activeLineGutter": { backgroundColor: "rgba(var(--ion-color-primary-rgb, 56, 128, 255), 0.12)" },
  ".cm-template-error-line": { backgroundColor: "rgba(var(--ion-color-danger-rgb, 235, 68, 90), 0.14)" },
});

onMounted(() => {
  view = new EditorView({
    parent: instance?.proxy?.$el as HTMLElement,
    // CodeMirror looks for its style root through slot assignments, which leads into ion-content's shadow root;
    // the editor itself is in the page, so its styles must go on the document.
    root: document,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        xml(),
        theme,
        errorLineField,
        editable.of(editableExtensions(!!props.readonly)),
        EditorView.contentAttributes.of({ "aria-label": props.label }),
        EditorView.updateListener.of(update => {
          if(update.docChanged) {emit("update:modelValue", update.state.doc.toString());}
        }),
      ],
    }),
  });
  if(props.errorLine) {view.dispatch({ effects: setErrorLine.of(props.errorLine) });}
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

// A new revision loaded, or code replaced by the page: show it without echoing it back as an edit.
watch(() => props.modelValue, value => {
  if(view && value !== view.state.doc.toString()) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value }, effects: setErrorLine.of(props.errorLine) });
  }
});
watch(() => props.readonly, readonly => view?.dispatch({ effects: editable.reconfigure(editableExtensions(!!readonly)) }));
watch(() => props.errorLine, line => view?.dispatch({ effects: setErrorLine.of(line) }));

/** Selects a line and scrolls it into view, for an error the server reported. */
function goToLine(line: number) {
  if(!view || line < 1 || line > view.state.doc.lines) {return;}
  const target = view.state.doc.line(line);
  view.dispatch({ selection: EditorSelection.range(target.from, target.to), effects: EditorView.scrollIntoView(target.from, { y: "center" }) });
  view.focus();
}

defineExpose({ goToLine });
</script>

<style scoped>
.code-editor {
  border: 1px solid var(--ion-color-light-shade, #d7d8da);
  border-radius: 4px;
  overflow: hidden;
}
</style>
