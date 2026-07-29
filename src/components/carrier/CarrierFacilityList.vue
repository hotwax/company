<template>
  <section data-testid="carrier-facility-list">
    <ion-searchbar
      v-model="searchQuery"
      :placeholder="translate('Search physical facilities')"
    />

    <ion-list>
      <ion-item
        v-for="facility in filteredFacilities"
        :key="facility.facilityId"
      >
        <ion-label class="ion-text-wrap">
          <h2>{{ facility.facilityName || facility.facilityId }}</h2>
          <p>{{ facility.facilityId }}</p>
          <p>{{ facility.facilityTypeDescription || facility.facilityTypeId }}</p>
        </ion-label>
        <ion-toggle
          slot="end"
          :aria-label="translate('Associate {facility} with carrier', {
            facility: facility.facilityName || facility.facilityId,
          })"
          :checked="Boolean(facility.isConfigured)"
          :disabled="disabled || isPending(facility)"
          @ion-change="emitToggle(facility, $event)"
        />
      </ion-item>

      <ion-item v-if="!filteredFacilities.length" lines="none">
        <ion-label class="ion-text-center ion-text-wrap">
          {{ translate(searchQuery.trim()
            ? "No physical facilities match your search."
            : "No physical facilities available.") }}
        </ion-label>
      </ion-item>
    </ion-list>
  </section>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonToggle,
} from "@ionic/vue";
import { computed, ref } from "vue";

const props = withDefaults(defineProps<{
  facilities: Record<string, any>[];
  disabled?: boolean;
  pendingKeys?: string[];
}>(), {
  disabled: false,
  pendingKeys: () => [],
});

const emit = defineEmits<{
  (event: "toggle", payload: {
    facility: Record<string, any>;
    enabled: boolean;
  }): void;
}>();

const searchQuery = ref("");
const physicalFacilities = computed(() =>
  props.facilities.filter((facility) =>
    facility.facilityTypeId !== "VIRTUAL_FACILITY" &&
    facility.parentTypeId !== "VIRTUAL_FACILITY"));
const filteredFacilities = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if(!query) {
    return physicalFacilities.value;
  }

  return physicalFacilities.value.filter((facility) =>
    String(facility.facilityId ?? "").toLowerCase().includes(query) ||
    String(facility.facilityName ?? "").toLowerCase().includes(query));
});

function pendingKey(facility: Record<string, any>) {
  return `facility:${facility.facilityId}`;
}

function isPending(facility: Record<string, any>) {
  return props.pendingKeys.includes(pendingKey(facility));
}

function emitToggle(
  facility: Record<string, any>,
  event: CustomEvent<{ checked: boolean }>,
) {
  if(props.disabled || isPending(facility)) {
    return;
  }

  emit("toggle", {
    facility,
    enabled: Boolean(event.detail.checked),
  });
}
</script>
