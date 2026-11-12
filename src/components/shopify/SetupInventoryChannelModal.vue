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
    <!-- ---------------------------------------------------------------- step 0 -->
    <template v-if="step === 0">
      <ion-item lines="none">
        <ion-label>
          {{ translate("Choose a channel type") }}
        </ion-label>
      </ion-item>
      <ion-radio-group v-model="channelType">
        <ion-item v-for="option in channelTypeOptions" :key="option.id" :disabled="!!option.blockedBy">
          <ion-radio :value="option.id" label-placement="end" justify="start">
            <ion-label class="ion-text-wrap">
              {{ option.label }}
              <p>{{ option.description }}</p>
              <p v-if="option.blockedBy" class="already-mapped">
                {{ translate("This shop already has an active channel of this type: {channel}", { channel: option.blockedBy }) }}
              </p>
            </ion-label>
          </ion-radio>
        </ion-item>
      </ion-radio-group>
    </template>

    <!-- ---------------------------------------------------------------- step 1 -->
    <template v-else-if="step === 1">
      <ion-item lines="none">
        <ion-label>
          {{ translate("Choose a facility group") }}
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

      <template v-else>
        <ion-searchbar
          v-if="channelGroups.length > 3"
          v-model="groupSearchQuery"
          :placeholder="translate('Search facility groups')"
        />

        <ion-item v-if="!filteredChannelGroups.length" lines="none">
          <ion-label class="ion-text-wrap ion-text-center">
            <p>{{ translate('No facility groups found for "{query}"', { query: groupSearchQuery }) }}</p>
          </ion-label>
        </ion-item>

        <ion-radio-group v-else v-model="selectedGroupId">
          <ion-item v-for="group in filteredChannelGroups" :key="group.facilityGroupId" :disabled="!!group.mappedChannelId">
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
    </template>

    <!-- ---------------------------------------------------------------- step 2 -->
    <template v-else>
      <ion-item lines="none">
        <ion-label>
          {{ translate("Choose a Shopify location") }}
          <p>
            {{ translate("Target location for") }}
            <strong>{{ selectedGroup?.facilityGroupName || selectedGroupId }}</strong>
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
          {{ translate("Could not reach Shopify") }}
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

        <template v-if="parkingSetup && selectedLocationId">
          <ion-list inset>
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">
                <h3>{{ translate("Store parking facility") }}</h3>
                <p>{{ translate("Orders route to the selected parking facility") }}</p>
              </ion-label>
            </ion-item>
            <ion-item v-if="!parkingCandidates.length" lines="none">
              <ion-icon :icon="warningOutline" slot="start" color="warning" />
              <ion-label class="ion-text-wrap">
                {{ translate("No {type} facility exists. Create a parking facility first.", { type: parkingSetup.facilityTypeId }) }}
              </ion-label>
            </ion-item>
            <ion-radio-group v-else v-model="selectedParkingFacilityId">
              <ion-item v-for="facility in parkingCandidates" :key="facility.facilityId">
                <ion-radio :value="facility.facilityId" label-placement="end" justify="start">
                  <ion-label class="ion-text-wrap">
                    {{ facility.facilityName || facility.facilityId }}
                    <p>{{ facility.facilityId }}</p>
                    <p v-if="facility.current">{{ translate("Current store parking") }}</p>
                  </ion-label>
                </ion-radio>
              </ion-item>
            </ion-radio-group>
          </ion-list>
        </template>

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
        <ion-button v-if="step > 0" @click="step = step === 2 ? 1 : 0" :disabled="saving">
          {{ translate("Back") }}
        </ion-button>
      </ion-buttons>
      <ion-note
        v-if="step === 2 && parkingSetup && selectedLocationId && !selectedParkingFacilityId"
        color="warning"
        class="parking-hint"
      >
        {{ translate("Select a parking facility") }}
      </ion-note>
      <ion-buttons slot="end">
        <ion-button
          v-if="step === 0"
          fill="solid"
          :disabled="!channelType || !channelDataReady"
          @click="step = 1"
        >
          {{ translate("Next") }}
        </ion-button>
        <ion-button
          v-else-if="step === 1"
          fill="solid"
          :disabled="!selectedGroupId"
          @click="goToLocationStep()"
        >
          {{ translate("Next") }}
        </ion-button>
        <ion-button
          v-else
          fill="solid"
          :disabled="!selectedLocationId || saving || !channelDataReady || (!!parkingSetup && !selectedParkingFacilityId)"
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
  IonLabel, IonList, IonNote, IonRadio, IonRadioGroup, IonSearchbar, IonSpinner, IonTitle, IonToolbar, modalController,
} from "@ionic/vue";
import { closeOutline, warningOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import { commonUtil, logger, translate } from "@common";
import { useEffectiveNow } from "@/composables/useEffectiveNow";
import { useFacilities, useFacilityGroups, useGroupFacilities } from "@/composables/useFacilities";
import {
  CHANNEL_TYPE,
  FUTURE_CHANNEL_PARKING,
  channelTypeOf,
  configureFutureChannelParking,
  createInventoryChannel,
  ensureChannelEventPublisherJob,
  ensureChannelResetJob,
  ensureShopPhysicalInventoryResetJob,
  fetchLocationsFromShopify,
  fetchShopifyShopLocations,
  useInventoryChannels,
  useProductStoreFacilityPurposes,
  useShopifyShop,
  useShopifySyncContext,
} from "@/composables/useShopify";
import { isEffectiveNow } from "@common/db";

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

const step = ref<0 | 1 | 2>(0);
const channelType = ref<string>(CHANNEL_TYPE.physical);
const selectedParkingFacilityId = ref("");
const selectedGroupId = ref("");
const selectedLocationId = ref("");
const saving = ref(false);
const loadingLocations = ref(false);
const locationError = ref("");
const shopifyLocations = ref<any[]>([]);
const omsMappings = ref<any[]>([]);

const { records: facilityGroups, hydrated: groupsHydrated } = useFacilityGroups();
const { members: groupMembers, hydrated: membersHydrated } = useGroupFacilities();
const { channels: inventoryChannels, hydrated: channelsHydrated } = useInventoryChannels();

const facilityDataReady = computed(() => groupsHydrated.value && membersHydrated.value);
// The type blocks and the parking write both read these tables: an unhydrated read would show nothing blocked and POST a duplicate purpose.
const channelDataReady = computed(() => channelsHydrated.value && purposesHydrated.value);
const { record: shop } = useShopifyShop(() => props.shopId);
const { purposes, hydrated: purposesHydrated } = useProductStoreFacilityPurposes();
// Date-effective projections re-evaluate at the next fromDate / thruDate boundary, not on a poll.
const effectiveNow = useEffectiveNow(() => [...inventoryChannels.value, ...purposes.value, ...groupMembers.value]);
const { facilities } = useFacilities();

/** A pre-order or back-order channel must be the shop's only active one of its type. */
const channelTypeOptions = computed(() => [
  { id: CHANNEL_TYPE.physical, label: translate("Physical"), description: translate("The group's available to promise inventory") },
  { id: CHANNEL_TYPE.preOrder, label: translate("Pre-order"), description: translate("Pre-order future inventory at the group's facilities") },
  { id: CHANNEL_TYPE.backOrder, label: translate("Back-order"), description: translate("Back-order future inventory at the group's facilities") },
].map((option) => {
  const existing = option.id === CHANNEL_TYPE.physical ? undefined : inventoryChannels.value.find((channel: any) =>
    String(channel.shopId) === String(props.shopId) && isEffectiveNow(channel, effectiveNow.value) && channelTypeOf(channel) === option.id);

  return { ...option, blockedBy: existing ? String(existing.inventoryChannelId) : "" };
}));

const parkingSetup = computed(() => FUTURE_CHANNEL_PARKING[channelType.value]);
const activeStorePurposes = computed(() => purposes.value.filter((row: any) =>
  String(row.productStoreId) === String(shop.value?.productStoreId ?? "") && isEffectiveNow(row, effectiveNow.value)));

/** Channels of the chosen type already mapped for THIS shop, by facility group. */
const mappedGroupIds = computed(() => {
  const map: Record<string, string> = {};
  inventoryChannels.value.forEach((channel: any) => {
    if (String(channel.shopId) !== String(props.shopId)) return;
    if (!isEffectiveNow(channel, effectiveNow.value)) return;
    // Per type: a group's physical channel and its pre-order channel publish different inventory.
    if (channelTypeOf(channel) !== channelType.value) return;
    map[String(channel.facilityGroupId)] = String(channel.inventoryChannelId);
  });
  return map;
});

const channelGroups = computed(() => facilityGroups.value
  .filter((group: any) => group.facilityGroupTypeId === CHANNEL_GROUP_TYPE)
  .map((group: any) => {
    const members = groupMembers.value.filter((member: any) =>
      String(member.facilityGroupId) === String(group.facilityGroupId) &&
      isEffectiveNow(member, effectiveNow.value));
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

const groupSearchQuery = ref("");
const filteredChannelGroups = computed(() => {
  const query = groupSearchQuery.value.trim().toLowerCase();
  if(!query) return channelGroups.value;
  return channelGroups.value.filter((group: any) =>
    String(group.facilityGroupName || "").toLowerCase().includes(query) ||
    String(group.facilityGroupId || "").toLowerCase().includes(query)
  );
});

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
  .filter((c: any) => String(c.shopId) === String(props.shopId) && isEffectiveNow(c, effectiveNow.value))
  .map((c: any) => String(c.shopifyLocationId))));

/**
 * A location is selectable when it is NOT backed by a real HotWax facility. Locations parked
 * against the placeholder facility (or with no mapping at all) are free to become an aggregate
 * target; the one already sitting on the placeholder is the intended choice, so it is suggested.
 */
const facilityTypeById = computed(() => new Map(facilities.value.map((facility: any) => [String(facility.facilityId), String(facility.facilityTypeId ?? "")])));

/**
 * A future channel's location is where its parking facility is mapped, so a location backing a facility
 * of the type's parking facility type is selectable for it, and the store's current parking location is
 * the suggestion.
 */
function isParkingFacility(facilityId: string): boolean {
  return !!parkingSetup.value && facilityTypeById.value.get(facilityId) === parkingSetup.value.facilityTypeId;
}

const currentParkingFacilityIds = computed(() => parkingSetup.value
  ? activeStorePurposes.value.filter((row: any) => row.facilityPurposeEnumId === parkingSetup.value?.purposeEnumId).map((row: any) => String(row.facilityId))
  : []);

const selectableLocations = computed(() => shopifyLocations.value
  .map((loc: any) => {
    const mappedFacilityId = mappingByLocation.value[loc.shopifyLocationId] ?? "";
    return {
      ...loc,
      mappedFacilityId,
      suggested: parkingSetup.value
        ? currentParkingFacilityIds.value.includes(mappedFacilityId)
        : mappedFacilityId === UNASSIGNED_FACILITY_ID,
    };
  })
  .filter((loc: any) =>
    (!loc.mappedFacilityId || loc.mappedFacilityId === UNASSIGNED_FACILITY_ID || isParkingFacility(loc.mappedFacilityId)) &&
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
  return facilityId && facilityId !== UNASSIGNED_FACILITY_ID && !isParkingFacility(facilityId);
}).length);

/** facilityId -> Shopify location, from the same mapping rows. */
const locationByFacility = computed(() => omsMappings.value.reduce((map: Record<string, string>, row: any) => {
  if(row?.facilityId) {map[String(row.facilityId)] = String(row.shopifyLocationId ?? "");}
  return map;
}, {}));

/** Facilities of the parking facility type, plus any facility already holding the store's parking purpose. */
const parkingCandidates = computed(() => {
  if(!parkingSetup.value) return [];
  const ids = new Set<string>([
    ...facilities.value.filter((facility: any) => facility.facilityTypeId === parkingSetup.value?.facilityTypeId).map((facility: any) => String(facility.facilityId)),
    ...currentParkingFacilityIds.value,
  ]);
  return [...ids].sort().map((facilityId) => ({
    facilityId,
    facilityName: facilities.value.find((facility: any) => facility.facilityId === facilityId)?.facilityName || "",
    current: currentParkingFacilityIds.value.includes(facilityId),
  }));
});

/** Default: the parking facility already at the chosen location, else the store's current one. */
watch([selectedLocationId, parkingCandidates], () => {
  if(!parkingSetup.value) return;
  const atLocation = parkingCandidates.value.find((facility) => locationByFacility.value[facility.facilityId] === selectedLocationId.value);
  const current = parkingCandidates.value.find((facility) => facility.current);
  if(!selectedParkingFacilityId.value || !parkingCandidates.value.some((facility) => facility.facilityId === selectedParkingFacilityId.value)) {
    selectedParkingFacilityId.value = atLocation?.facilityId || current?.facilityId || "";
  }
}, { immediate: true });

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
    const typeLabel = channelTypeOptions.value.find((option) => option.id === channelType.value)?.label || "";
    inventoryChannelId = await createInventoryChannel({
      shopId: props.shopId,
      facilityGroupId: selectedGroupId.value,
      shopifyLocationId: selectedLocationId.value,
      channelTypeEnumId: channelType.value as any,
      description: parkingSetup.value
        ? `${selectedGroup.value?.facilityGroupName || selectedGroupId.value} ${typeLabel.toLowerCase()} inventory`
        : `${selectedGroup.value?.facilityGroupName || selectedGroupId.value} aggregate inventory`,
      fromDate: Date.now(),
    });
  } catch (error: any) {
    const serverError = commonUtil.getErrorMessage(error);
    logger.error("Failed to create inventory channel", error);
    commonUtil.showToast(`${translate("Failed to create the inventory channel.")} ${serverError}`);
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
    if (parkingSetup.value) {
      try {
        await configureFutureChannelParking({
          shopId: props.shopId,
          productStoreId: String(shop.value?.productStoreId ?? ""),
          channelTypeEnumId: channelType.value,
          shopifyLocationId: selectedLocationId.value,
          facilityId: selectedParkingFacilityId.value,
          locationByFacility: locationByFacility.value,
          activePurposes: activeStorePurposes.value,
        });
      } catch (error: any) {
        logger.error("Channel created but its parking facility was not configured", error);
        jobFailures.push(translate("store parking facility"));
      }
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
  groupSearchQuery.value = "";
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

.parking-hint {
  padding-inline-end: var(--spacer-sm);
}
</style>
