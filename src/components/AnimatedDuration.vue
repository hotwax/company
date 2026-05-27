<template>
  <span>{{ formattedDuration }}</span>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, defineProps } from 'vue';
import { DateTime } from 'luxon';
import { parseDateTimeValue } from '@/utils';

const props = defineProps({
  startTime: {
    type: [Number, String],
    required: false
  },
  endTime: {
    type: [Number, String],
    required: false
  },
  elapsedTime: {
    type: [Number, String],
    required: false
  },
  runtime: {
    type: [Number, String],
    required: false
  }
});

const now = ref(DateTime.now());
let animationFrame: number | null = null;

const updateNow = () => {
  now.value = DateTime.now();
  if (!props.endTime && props.startTime) {
    animationFrame = requestAnimationFrame(updateNow);
  }
};

const formattedDuration = computed(() => {
  if (props.runtime) return `${props.runtime} ms`;
  if (props.elapsedTime) return `${props.elapsedTime} ms`;

  const start = parseDateTimeValue(props.startTime);
  if (!start) return "";
  
  const end = props.endTime ? parseDateTimeValue(props.endTime) : now.value;
  if (!end) return "";
  
  const diff = end.diff(start, ["minutes", "seconds"]).toObject();
  const minutes = Math.floor(diff.minutes || 0);
  const seconds = Math.floor(diff.seconds || 0);
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
});

watch(() => props.endTime, (newVal) => {
  if (newVal) {
    if (animationFrame) cancelAnimationFrame(animationFrame);
  } else if (props.startTime) {
    updateNow();
  }
});

onMounted(() => {
  if (!props.endTime && props.startTime) {
    updateNow();
  }
});

onUnmounted(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }
});
</script>
