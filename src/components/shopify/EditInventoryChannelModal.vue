<template>
  <ion-modal :is-open="isOpen" @didDismiss="close()">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button :aria-label="translate('Close')" @click="close()">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Edit inventory channel") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list lines="full">
        <!-- Fixed by construction: either one changing makes this a mapping between different things
             rather than an edit of this one, and the deltas already recorded were calculated for the
             pair below. Shown because they are the channel's identity, not because they are settable. -->
        <ion-item>
          <ion-label>
            {{ translate("Facility group") }}
            <p>{{ channel?.facilityGroupName || channel?.facilityGroupId }}</p>
          </ion-label>
          <ion-note slot="end">{{ translate("Fixed") }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Shopify shop") }}
            <p>{{ channel?.shopId }}</p>
          </ion-label>
          <ion-note slot="end">{{ translate("Fixed") }}</ion-note>
        </ion-item>

        <ion-item>
          <ion-input
            :label="translate('Description')"
            label-placement="stacked"
            :value="draftDescription"
            :disabled="isSaving"
            :placeholder="translate('How this channel is used')"
            @ionInput="draftDescription = $event.detail.value || ''"
          />
        </ion-item>
      </ion-list>

      <ion-list lines="full">
        <ion-list-header>
          <ion-label>{{ translate("Aggregate location") }}</ion-label>
        </ion-list-header>

        <ion-item v-if="loadingLocations" lines="none">
          <ion-spinner name="crescent" />
        </ion-item>

        <ion-item v-else-if="locationError" lines="none" role="alert">
          <ion-label class="ion-text-wrap">
            {{ translate("Shopify locations unavailable") }}
            <p>{{ locationError }}</p>
          </ion-label>
          <ion-button slot="end" fill="outline" @click="loadLocations()">{{ translate("Retry") }}</ion-button>
        </ion-item>

        <template v-else>
          <ion-radio-group :value="draftLocationId" @ionChange="draftLocationId = $event.detail.value">
            <ion-item v-for="loc in locationChoices" :key="loc.shopifyLocationId">
              <ion-radio label-placement="end" justify="start" :value="loc.shopifyLocationId" :disabled="isSaving">
                {{ loc.name }}
                <p>{{ loc.shopifyLocationId }}</p>
              </ion-radio>
              <ion-badge v-if="loc.shopifyLocationId === channel?.shopifyLocationId" slot="end" color="medium">
                {{ translate("Current") }}
              </ion-badge>
            </ion-item>
          </ion-radio-group>

          <!-- Moving the target is an inventory operation, not a relabel. Say so before it happens
               rather than after, because the correction runs against a live storefront. -->
          <ion-item v-if="locationChanged" lines="none">
            <ion-label class="ion-text-wrap">
              <ion-note color="warning">
                {{ translate("Moving the location clears the stock this channel put at") }}
                {{ channel?.shopifyLocationId }}{{ translate(", then seeds the new one on the next full aggregate ATP reset.") }}
              </ion-note>
            </ion-label>
          </ion-item>
        </template>
      </ion-list>

      <ion-list lines="full">
        <ion-list-header>
          <ion-label>{{ translate("Stop using this channel") }}</ion-label>
        </ion-list-header>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">
            {{ translate("Expire channel") }}
            <p>{{ translate("Stops aggregating into this location and clears what this channel put there. The mapping is kept for history.") }}</p>
          </ion-label>
          <ion-button slot="end" fill="outline" color="danger" :disabled="isSaving || isExpired" @click="confirmExpire()">
            {{ isExpired ? translate("Expired") : translate("Expire") }}
          </ion-button>
        </ion-item>
      </ion-list>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button :disabled="!isDirty || isSaving" :aria-label="translate('Save')" @click="save()">
          <ion-spinner v-if="isSaving" name="crescent" />
          <ion-icon v-else :icon="saveOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonBadge, IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput,
  IonItem, IonLabel, IonList, IonListHeader, IonModal, IonNote, IonRadio, IonRadioGroup, IonSpinner,
  IonTitle, IonToolbar, alertController,
} from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import { commonUtil, logger, translate } from "@common";
import {
  fetchLocationsFromShopify,
  fetchShopifyShopLocations,
  updateInventoryChannel,
} from "@/composables/useShopify";

const props = defineProps<{ isOpen: boolean; channel: any }>();
const emit = defineEmits<{ close: []; updated: [] }>();

/** Locations parked here are unassigned rather than backing a real facility. */
const UNASSIGNED_FACILITY_ID = "_NA_";

const draftDescription = ref("");
const draftLocationId = ref("");
const isSaving = ref(false);
const loadingLocations = ref(false);
const locationError = ref("");
const shopifyLocations = ref<any[]>([]);
const omsMappings = ref<any[]>([]);

const isExpired = computed(() => {
  const thruDate = props.channel?.thruDate;
  return !!thruDate && Number(thruDate) <= Date.now();
});

const mappingByLocation = computed<Record<string, string>>(() =>
  omsMappings.value.reduce((map: Record<string, string>, row: any) => {
    map[String(row.shopifyLocationId)] = String(row.facilityId ?? "");
    return map;
  }, {}));

/**
 * Same eligibility rule as setup - a location backed by a real HotWax facility is a physical target
 * and cannot also be an aggregate one - plus this channel's own current location, which setup filters
 * out as "claimed" and an edit screen must obviously keep.
 */
const locationChoices = computed(() => shopifyLocations.value
  .filter((loc: any) => {
    if (loc.shopifyLocationId === props.channel?.shopifyLocationId) return true;
    const facilityId = mappingByLocation.value[loc.shopifyLocationId] ?? "";
    return !facilityId || facilityId === UNASSIGNED_FACILITY_ID;
  })
  .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name))));

const locationChanged = computed(() =>
  !!draftLocationId.value && draftLocationId.value !== String(props.channel?.shopifyLocationId ?? ""));
const isDirty = computed(() =>
  locationChanged.value || draftDescription.value !== String(props.channel?.description ?? ""));

watch(() => [props.isOpen, props.channel?.inventoryChannelId], ([open]) => {
  if (!open) return;
  draftDescription.value = String(props.channel?.description ?? "");
  draftLocationId.value = String(props.channel?.shopifyLocationId ?? "");
  void loadLocations();
});

async function loadLocations() {
  const shopId = props.channel?.shopId;
  if (!shopId || loadingLocations.value) return;
  loadingLocations.value = true;
  locationError.value = "";
  try {
    // Shopify is remote truth: the cached mapping table only knows what the OMS has already seen.
    const [nodes, mappings] = await Promise.all([
      fetchLocationsFromShopify(String(shopId)),
      fetchShopifyShopLocations(String(shopId), 200),
    ]);
    shopifyLocations.value = nodes.map((node: any) => ({
      shopifyLocationId: String(node.id).split("/").pop(),
      name: node.name || String(node.id).split("/").pop(),
    }));
    omsMappings.value = mappings;
  } catch (error: any) {
    logger.error("Failed to load Shopify locations for inventory channel edit", error);
    locationError.value = error?.message || translate("Shopify did not return its locations.");
  } finally {
    loadingLocations.value = false;
  }
}

function close() {
  emit("close");
}

async function save() {
  if (!isDirty.value) return;
  isSaving.value = true;
  try {
    await updateInventoryChannel({
      inventoryChannelId: String(props.channel.inventoryChannelId),
      description: draftDescription.value,
      ...(locationChanged.value ? { shopifyLocationId: draftLocationId.value } : {}),
    });
    commonUtil.showToast(locationChanged.value
      ? translate("Channel updated. Run a full aggregate ATP reset to seed the new location.")
      : translate("Channel updated."));
    emit("updated");
    close();
  } catch (error: any) {
    logger.error("updateInventoryChannel", error);
    commonUtil.showToast(error?.message || translate("Failed to update the inventory channel."));
  } finally {
    isSaving.value = false;
  }
}

async function confirmExpire() {
  const alert = await alertController.create({
    header: translate("Expire this channel?"),
    message: translate("Aggregate inventory stops flowing to this Shopify location, and the stock this channel put there is cleared. The mapping is kept so its history stays readable."),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Expire channel"), role: "confirm" },
    ],
  });
  await alert.present();
  if ((await alert.onDidDismiss()).role !== "confirm") return;

  isSaving.value = true;
  try {
    // fromDate is left to the OMS clock on create, because a browser timestamp that lands in the
    // future makes a channel silently inert for as long as the skew lasts. thruDate is sent from here
    // instead, for two reasons: there is no server-side "expire now" call to defer to, and the same
    // skew is bounded rather than silent - a fast clock keeps the channel alive a moment longer, a
    // slow one expires it a moment early, and either way it settles. ISO-8601 with Z so the instant
    // is unambiguous, which is the part that actually bit fromDate: a locale-formatted string read in
    // the server's own timezone.
    await updateInventoryChannel({
      inventoryChannelId: String(props.channel.inventoryChannelId),
      thruDate: new Date().toISOString(),
    });
    commonUtil.showToast(translate("Channel expired."));
    emit("updated");
    close();
  } catch (error: any) {
    logger.error("expireInventoryChannel", error);
    commonUtil.showToast(error?.message || translate("Failed to expire the inventory channel."));
  } finally {
    isSaving.value = false;
  }
}
</script>
