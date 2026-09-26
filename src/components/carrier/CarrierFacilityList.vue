<template>
  <div data-testid="carrier-facility-list">
    <ion-searchbar
      v-model="searchQuery"
      :placeholder="translate('Search physical facilities')"
    />

    <section v-if="filteredFacilities.length">
      <ion-card v-for="facility in filteredFacilities" :key="facility.facilityId">
        <ion-card-header>
          <div>
            <ion-card-title>{{ facility.facilityName || facility.facilityId }}</ion-card-title>
            <ion-card-subtitle>{{ facility.facilityId }}</ion-card-subtitle>
          </div>
          <ion-checkbox
            :aria-label="translate('Associate {facility} with carrier', {
              facility: facility.facilityName || facility.facilityId,
            })"
            :checked="Boolean(facility.isConfigured)"
            :disabled="disabled || isPending(facility)"
            @click="emitToggle(facility, $event)"
          />
        </ion-card-header>
      </ion-card>
    </section>

    <div v-else class="empty-state">
      <p>{{ translate(searchQuery.trim() ? "No physical facilities match your search." : "No data found") }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonCard,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCheckbox,
  IonSearchbar,
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
  if (!query) {
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
  event: any,
) {
  event.preventDefault();
  event.stopImmediatePropagation();

  if (props.disabled || isPending(facility)) {
    return;
  }

  emit("toggle", {
    facility,
    enabled: !facility.isConfigured,
  });
}
</script>

<style scoped>
ion-card-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

ion-card-header > ion-checkbox {
  flex-shrink: 0;
}

section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}
</style>
