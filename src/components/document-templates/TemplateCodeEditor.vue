<template>
  <div class="code-editor" :class="{ readonly }">
    <div ref="gutter" class="gutter" aria-hidden="true">
      <div v-for="line in lineCount" :key="line" :class="{ 'error-line': line === errorLine }">{{ line }}</div>
    </div>
    <textarea ref="area" :value="modelValue" :readonly="readonly" :aria-label="label" spellcheck="false" autocapitalize="off"
      autocomplete="off" wrap="off" data-testid="document-template-code" @input="onInput" @scroll="syncScroll" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{ modelValue: string; readonly?: boolean; label: string; errorLine?: number }>();
const emit = defineEmits<{ (e: "update:modelValue", value: string): void }>();

const area = ref<HTMLTextAreaElement | null>(null);
const gutter = ref<HTMLElement | null>(null);
const lineCount = computed(() => props.modelValue.split("\n").length);

function onInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
}

function syncScroll() {
  if(gutter.value && area.value) {gutter.value.scrollTop = area.value.scrollTop;}
}

/** Puts the cursor at the start of a line and scrolls it into view, for an error the server reported. */
function goToLine(line: number) {
  const textarea = area.value;
  if(!textarea || line < 1) {return;}
  const lines = props.modelValue.split("\n");
  const offset = lines.slice(0, line - 1).reduce((total, text) => total + text.length + 1, 0);
  textarea.focus();
  textarea.setSelectionRange(offset, offset + (lines[line - 1]?.length || 0));
  textarea.scrollTop = Math.max(0, (line - 5) * LINE_HEIGHT);
  syncScroll();
}

const LINE_HEIGHT = 20;

defineExpose({ goToLine });
</script>

<style scoped>
.code-editor {
  display: flex;
  height: 70vh;
  border: 1px solid var(--ion-color-light-shade, #d7d8da);
  border-radius: 4px;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 20px;
  background: var(--ion-background-color, #fff);
}

.gutter {
  flex: none;
  min-width: 3.5em;
  padding: 8px 8px 8px 0;
  overflow: hidden;
  text-align: right;
  color: var(--ion-color-medium);
  background: var(--ion-color-light, #f4f5f8);
  user-select: none;
}

.gutter .error-line {
  color: var(--ion-color-danger);
  font-weight: 600;
}

textarea {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 8px;
  border: none;
  outline: none;
  resize: none;
  font: inherit;
  line-height: inherit;
  white-space: pre;
  overflow: auto;
  tab-size: 4;
  color: var(--ion-text-color, #000);
  background: transparent;
}

.readonly textarea {
  color: var(--ion-color-step-700, #4d4d4d);
}
</style>
