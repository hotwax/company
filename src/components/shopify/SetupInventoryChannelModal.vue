<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Set up inventory channel") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <!-- ---------------------------------------------------------------- step 1 -->
    <template v-if="step === 1">
      <ion-item lines="none">
        <ion-label>
          <h2>{{ translate("Choose a facility group") }}</h2>
          <p>{{ translate("Inventory across every facility in this group is aggregated into one Shopify location") }}</p>
        </ion-label>
      </ion-item>

      <ion-item v-if="!facilityDataReady" lines="none">
        <ion-spinner name="crescent" slot="start" />
        <ion-label>{{ translate("Loading facility groups") }}</ion-label>
      </ion-item>

      <ion-item v-else-if="!channelGroups.length" lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translate("No facility groups of type CHANNEL_FAC_GROUP exist on this OMS. Create one before mapping an inventory channel.") }}</p>
        </ion-label>
      </ion-item>

      <ion-radio-group v-else v-model="selectedGroupId">
        <ion-item v-for="group in channelGroups" :key="group.facilityGroupId" :disabled="!!group.mappedChannelId">
          <ion-radio :value="group.facilityGroupId" label-placement="end" justify="start">
            <ion-label class="ion-text-wrap">
              {{ group.facilityGroupName || group.facilityGroupId }}
              <p>{{ group.facilityGroupId }}</p>
              <p v-if="group.mappedChannelId" class="already-mapped">
                {{ translate("Already mapped to a Shopify location for this connection") }}
              </p>
            </ion-label>
          </ion-radio>
          <div slot="end" class="group-stats">
            <ion-chip outline :color="group.storeCount ? 'primary' : 'medium'">
              {{ group.storeCount }} {{ group.storeCount === 1 ? translate("store") : translate("stores") }}
            </ion-chip>
            <ion-chip outline :color="group.warehouseCount ? 'primary' : 'medium'">
              {{ group.warehouseCount }} {{ group.warehouseCount === 1 ? translate("warehouse") : translate("warehouses") }}
            </ion-chip>
            <ion-chip outline :color="group.configCount ? 'warning' : 'medium'">
              {{ group.configCount }} {{ translate("config") }}
            </ion-chip>
            <ion-chip v-if="group.otherCount" outline color="medium">
              {{ group.otherCount }} {{ translate("other") }}
            </ion-chip>
          </div>
        </ion-item>
      </ion-radio-group>
    </template>

    <!-- ---------------------------------------------------------------- step 2 -->
    <template v-else>
      <ion-item lines="none">
        <ion-label>
          <h2>{{ translate("Choose a Shopify location") }}</h2>
          <p>
            {{ translate("Aggregate inventory for") }}
            <strong>{{ selectedGroup?.facilityGroupName || selectedGroupId }}</strong>
            {{ translate("is pushed to this location") }}
          </p>
        </ion-label>
      </ion-item>

      <ion-item v-if="loadingLocations" lines="none">
        <ion-spinner name="crescent" slot="start" />
        <ion-label>{{ translate("Fetching locations from Shopify") }}</ion-label>
      </ion-item>

      <ion-item v-else-if="locationError" lines="none">
        <ion-icon :icon="warningOutline" slot="start" color="danger" />
        <ion-label class="ion-text-wrap">
          <h3>{{ translate("Could not reach Shopify") }}</h3>
          <p>{{ locationError }}</p>
        </ion-label>
      </ion-item>

      <template v-else>
        <ion-item v-if="!selectableLocations.length" lines="none">
          <ion-label class="ion-text-wrap">
            <p>{{ translate("Every Shopify location for this shop is already mapped to a HotWax facility, so none can be used as an aggregate target.") }}</p>
          </ion-label>
        </ion-item>

        <ion-radio-group v-else v-model="selectedLocationId">
          <ion-item v-for="loc in selectableLocations" :key="loc.shopifyLocationId">
            <ion-radio :value="loc.shopifyLocationId" label-placement="end" justify="start">
              <ion-label class="ion-text-wrap">
                {{ loc.name }}
                <p>{{ loc.shopifyLocationId }}</p>
              </ion-label>
            </ion-radio>
            <ion-badge v-if="loc.suggested" slot="end" color="success">{{ translate("Suggested") }}</ion-badge>
          </ion-item>
        </ion-radio-group>

        <ion-item v-if="excludedByFacility || excludedByChannel" lines="none">
          <ion-label class="ion-text-wrap">
            <p v-if="excludedByFacility">
              {{ excludedByFacility }}
              {{ excludedByFacility === 1 ? translate("location is hidden: it backs a HotWax facility")
                                          : translate("locations are hidden: they back HotWax facilities") }}
            </p>
            <p v-if="excludedByChannel">
              {{ excludedByChannel }}
              {{ excludedByChannel === 1 ? translate("location is hidden: it is already the target of another inventory channel")
                                         : translate("locations are hidden: they are already targets of other inventory channels") }}
            </p>
          </ion-label>
        </ion-item>
      </template>
    </template>
  </ion-content>

  <ion-footer>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button v-if="step === 2" @click="step = 1" :disabled="saving">
          {{ translate("Back") }}
        </ion-button>
      </ion-buttons>
      <ion-buttons slot="end">
        <ion-button
          v-if="step === 1"
          fill="solid"
          :disabled="!selectedGroupId"
          @click="goToLocationStep()"
        >
          {{ translate("Next") }}
        </ion-button>
        <ion-button
          v-else
          fill="solid"
          :disabled="!selectedLocationId || saving"
          @click="createChannel()"
        >
          <ion-spinner v-if="saving" name="crescent" />
          <template v-else>{{ translate("Create channel") }}</template>
        </ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-footer>
</template>

<script setup lang="ts">
import {
  IonBadge, IonButton, IonButtons, IonChip, IonContent, IonFooter, IonHeader, IonIcon, IonItem,
  IonLabel, IonRadio, IonRadioGroup, IonSpinner, IonTitle, IonToolbar, modalController,
} from "@ionic/vue";
import { closeOutline, warningOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import { commonUtil, logger, translate } from "@common";
import { useCachedList } from "@/composables/useCachedList";
import { useFacilityGroups, useGroupFacilities } from "@/composables/useFacilities";
import {
  createInventoryChannel,
  ensureChannelEventPublisherJob,
  ensureChannelResetJob,
  ensureShopPhysicalInventoryResetJob,
  fetchLocationsFromShopify,
  fetchShopifyShopLocations,
  useShopifySyncContext,
} from "@/composables/useShopify";
import { inventoryChannelCache } from "@/utils/cacheEntities";
import { isEffectiveNow } from "@/utils/cacheProjection";

const props = defineProps<{ shopId: string }>();

// The physical-location QOH reset job belongs to the shop REMOTE, not the shop id, because
// that is the parameter the sync panel matches on.
const syncContext = useShopifySyncContext(() => props.shopId);

/** The placeholder facility every unassigned Shopify location is parked against. */
const UNASSIGNED_FACILITY_ID = "_NA_";
const CHANNEL_GROUP_TYPE = "CHANNEL_FAC_GROUP";
const STORE_TYPES = ["RETAIL_STORE", "OUTLET_STORE"];
const WAREHOUSE_TYPES = ["WAREHOUSE"];
const CONFIG_TYPES = ["CONFIGURATION"];

const step = ref<1 | 2>(1);
const selectedGroupId = ref("");
const selectedLocationId = ref("");
const saving = ref(false);
const loadingLocations = ref(false);
const locationError = ref("");
const shopifyLocations = ref<any[]>([]);
const omsMappings = ref<any[]>([]);

const { records: facilityGroups, hydrated: groupsHydrated } = useFacilityGroups();
const { members: groupMembers, hydrated: membersHydrated } = useGroupFacilities();
const { records: inventoryChannels } = useCachedList<any>(inventoryChannelCache);

const facilityDataReady = computed(() => groupsHydrated.value && membersHydrated.value);

/** Channels already mapped for THIS shop, by facility group. */
const mappedGroupIds = computed(() => {
  const map: Record<string, string> = {};
  inventoryChannels.value.forEach((channel: any) => {
    if (String(channel.shopId) !== String(props.shopId)) return;
    if (!isEffectiveNow(channel, Date.now())) return;
    map[String(channel.facilityGroupId)] = String(channel.inventoryChannelId);
  });
  return map;
});

const channelGroups = computed(() => facilityGroups.value
  .filter((group: any) => group.facilityGroupTypeId === CHANNEL_GROUP_TYPE)
  .map((group: any) => {
    const members = groupMembers.value.filter((member: any) =>
      String(member.facilityGroupId) === String(group.facilityGroupId) &&
      isEffectiveNow(member, Date.now()));
    const countOf = (types: string[]) =>
      members.filter((m: any) => types.includes(String(m.facilityTypeId))).length;
    const storeCount = countOf(STORE_TYPES);
    const warehouseCount = countOf(WAREHOUSE_TYPES);
    const configCount = countOf(CONFIG_TYPES);
    return {
      ...group,
      storeCount,
      warehouseCount,
      configCount,
      // Every member must appear in some count. A facility type outside the three buckets still
      // contributes its inventory to the aggregate, so silently omitting it would let a group read
      // "0 stores" while holding stock - the operator would pick it believing it is empty.
      otherCount: Math.max(0, members.length - storeCount - warehouseCount - configCount),
      memberCount: members.length,
      mappedChannelId: mappedGroupIds.value[String(group.facilityGroupId)] || "",
    };
  })
  .sort((a: any, b: any) => String(a.facilityGroupName || a.facilityGroupId)
    .localeCompare(String(b.facilityGroupName || b.facilityGroupId))));

const selectedGroup = computed(() =>
  channelGroups.value.find((g: any) => g.facilityGroupId === selectedGroupId.value));

/** shopifyLocationId -> facilityId, from the OMS mapping table. */
const mappingByLocation = computed(() => {
  const map: Record<string, string> = {};
  omsMappings.value.forEach((row: any) => {
    if (row?.shopifyLocationId) map[String(row.shopifyLocationId)] = String(row.facilityId ?? "");
  });
  return map;
});

/** Shopify locations already claimed by another inventory channel on this shop. */
const channelLocationIds = computed(() => new Set(inventoryChannels.value
  .filter((c: any) => String(c.shopId) === String(props.shopId) && isEffectiveNow(c, Date.now()))
  .map((c: any) => String(c.shopifyLocationId))));

/**
 * A location is selectable when it is NOT backed by a real HotWax facility. Locations parked
 * against the placeholder facility (or with no mapping at all) are free to become an aggregate
 * target; the one already sitting on the placeholder is the intended choice, so it is suggested.
 */
const selectableLocations = computed(() => shopifyLocations.value
  .map((loc: any) => {
    const mappedFacilityId = mappingByLocation.value[loc.shopifyLocationId] ?? "";
    return {
      ...loc,
      mappedFacilityId,
      suggested: mappedFacilityId === UNASSIGNED_FACILITY_ID,
    };
  })
  .filter((loc: any) =>
    (!loc.mappedFacilityId || loc.mappedFacilityId === UNASSIGNED_FACILITY_ID) &&
    !channelLocationIds.value.has(loc.shopifyLocationId))
  .sort((a: any, b: any) => (b.suggested ? 1 : 0) - (a.suggested ? 1 : 0) ||
    String(a.name).localeCompare(String(b.name))));

/**
 * The two exclusion reasons are reported separately on purpose. An aggregate target IS a real
 * Shopify location - "Retail Agg" and "Warehouse Agg" are ordinary active locations someone created
 * for this - so "already mapped to a HotWax facility" is the wrong explanation for one already
 * claimed by a channel, and reading it as such makes a correct setup look like a data problem.
 */
const excludedByFacility = computed(() => shopifyLocations.value.filter((loc: any) => {
  const facilityId = mappingByLocation.value[loc.shopifyLocationId] ?? "";
  return facilityId && facilityId !== UNASSIGNED_FACILITY_ID;
}).length);

const excludedByChannel = computed(() => shopifyLocations.value.filter((loc: any) => {
  const facilityId = mappingByLocation.value[loc.shopifyLocationId] ?? "";
  const backsFacility = facilityId && facilityId !== UNASSIGNED_FACILITY_ID;
  return !backsFacility && channelLocationIds.value.has(loc.shopifyLocationId);
}).length);

async function goToLocationStep() {
  step.value = 2;
  if (shopifyLocations.value.length || loadingLocations.value) return;
  loadingLocations.value = true;
  locationError.value = "";
  try {
    // Shopify is remote truth here - the cached mapping table only knows what the OMS has seen.
    const [nodes, mappings] = await Promise.all([
      fetchLocationsFromShopify(props.shopId),
      fetchShopifyShopLocations(props.shopId, 200),
    ]);
    shopifyLocations.value = nodes.map((node: any) => ({
      shopifyLocationId: String(node.id).split("/").pop(),
      name: node.name || String(node.id).split("/").pop(),
    }));
    omsMappings.value = mappings;
    const suggestion = selectableLocations.value.find((l: any) => l.suggested);
    if (suggestion) selectedLocationId.value = suggestion.shopifyLocationId;
  } catch (error: any) {
    logger.error("Failed to load Shopify locations for inventory channel setup", error);
    locationError.value = error?.message || translate("Shopify did not return its locations.");
  } finally {
    loadingLocations.value = false;
  }
}

/**
 * Three records, in dependency order: the channel, its absolute reconciliation job, and the shop's
 * event publisher clone. The jobs are reported separately on failure BECAUSE the channel is already
 * committed by then - telling the operator "failed" outright would invite a retry that creates a
 * duplicate channel. Both jobs are created paused; activation is a separate reviewed step.
 */
async function createChannel() {
  saving.value = true;
  let inventoryChannelId: string | undefined;
  try {
    inventoryChannelId = await createInventoryChannel({
      shopId: props.shopId,
      facilityGroupId: selectedGroupId.value,
      shopifyLocationId: selectedLocationId.value,
      description: `${selectedGroup.value?.facilityGroupName || selectedGroupId.value} aggregate inventory`,
    });
  } catch (error: any) {
    logger.error("Failed to create inventory channel", error);
    commonUtil.showToast(error?.message || translate("Failed to create the inventory channel."));
    saving.value = false;
    return;
  }

  const jobFailures: string[] = [];
  if (inventoryChannelId) {
    try {
      await ensureChannelResetJob({
        inventoryChannelId,
        description: `Full aggregate ATP reset for ${selectedGroup.value?.facilityGroupName || selectedGroupId.value}`,
      });
    } catch (error: any) {
      logger.error("Channel created but its aggregate reset job was not", error);
      jobFailures.push(translate("aggregate ATP reset job"));
    }
    try {
      // Per channel, not per shop: publish#PendingShopifyInventoryAdjustments requires
      // inventoryChannelId and holds its semaphore on it, so two channels on one shop each need
      // their own publisher clone.
      await ensureChannelEventPublisherJob(inventoryChannelId);
    } catch (error: any) {
      logger.error("Channel created but its event publisher job was not", error);
      jobFailures.push(translate("event publisher job"));
    }
    try {
      const remoteId = String(syncContext.remoteId?.value ?? "");
      if (!remoteId) throw new Error("No Shopify remote resolved for this shop");
      await ensureShopPhysicalInventoryResetJob({ systemMessageRemoteId: remoteId });
    } catch (error: any) {
      logger.error("Channel created but the physical location QOH reset job was not", error);
      jobFailures.push(translate("physical location QOH reset job"));
    }
  }

  commonUtil.showToast(jobFailures.length
    ? `${translate("Inventory channel created, but these could not be set up:")} ${jobFailures.join(", ")}. ${translate("The channel exists - do not create it again.")}`
    : translate("Inventory channel created with its reset and publisher jobs, both paused. Run a full aggregate ATP reset before relying on incremental updates."));

  saving.value = false;
  await modalController.dismiss({ created: true, inventoryChannelId, jobFailures });
}

function closeModal() {
  modalController.dismiss({ dismissed: true });
}
</script>

<style scoped>
.group-stats {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.already-mapped {
  color: var(--ion-color-medium);
}
</style>
