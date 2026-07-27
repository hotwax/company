<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button default-href="/facilities/find" slot="start" />
        <ion-title>{{ translate("Add Store") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Setup Store") }}</ion-card-title>
          </ion-card-header>
          <ion-list>
            <ion-item>
              <ion-select :label="translate('Type')" interface="popover" v-model="selectedFacilityTypeId">
                <ion-select-option
                  v-for="type in facilityTypeOptions"
                  :key="type.facilityTypeId"
                  :value="type.facilityTypeId"
                >
                  {{ type.description || type.facilityTypeId }}
                </ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-input label-placement="floating" @ionBlur="setFacilityId($event)" v-model="formData.facilityName">
                <div slot="label">{{ translate("Name") }} <ion-text color="danger">*</ion-text></div>
              </ion-input>
            </ion-item>
            <ion-item lines="none">
              <ion-input
                :label="translate('Internal ID')"
                label-placement="floating"
                ref="facilityIdRef"
                v-model="formData.facilityId"
                @ionInput="validateFacilityId"
                @ionBlur="markFacilityIdTouched"
                :error-text="translate('Internal ID cannot be more than 20 characters.')"
              />
            </ion-item>
            <ion-item>
              <ion-input :label="translate('External ID')" label-placement="floating" v-model="formData.externalId" />
            </ion-item>
          </ion-list>
        </ion-card>

        <div class="ion-text-center ion-margin">
          <ion-button @click="createFacility()">
            <ion-icon slot="start" :icon="addOutline" />
            {{ selectedFacilityTypeId
              ? translate(`Create ${facilityTypeMap[selectedFacilityTypeId]?.description || selectedFacilityTypeId}`)
              : translate("Create facility") }}
          </ion-button>
        </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter
} from "@ionic/vue";
import { computed, ref } from "vue";
import { addOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { useFacilityCreation, useFacilityMutations, useFacilityTypes } from "@/composables/useFacilities";
import { useOrganization } from "@/composables/useSeed";
import { generateInternalId } from "@/utils";
import router from "@/router";

const { createFacility: createFacilityRecord } = useFacilityCreation();

const facilityIdRef = ref<any>(null);
const isAutoGenerateId = ref(true);
const selectedFacilityTypeId = ref("");
const formData = ref({ facilityName: "", facilityId: "", externalId: "" });

// Facility types are cached at login; the org partyId is memoised on first use.
const { facilityTypes } = useFacilityTypes();
const { organizationPartyId, loadOrganizationPartyId } = useOrganization();

const facilityTypeMap = computed<Record<string, any>>(() =>
  Object.fromEntries(facilityTypes.value.map((facilityType: any) => [facilityType.facilityTypeId, facilityType]))
);

const facilityTypeOptions = computed(() => facilityTypes.value);

onIonViewWillEnter(async () => {
  formData.value = { facilityName: "", facilityId: "", externalId: "" };
  isAutoGenerateId.value = true;
  void loadOrganizationPartyId();
  const types = facilityTypes.value;
  const queryType = router.currentRoute.value.query.type as string | undefined;
  selectedFacilityTypeId.value = (queryType && types.find((facilityType: any) => facilityType.facilityTypeId === queryType)?.facilityTypeId)
    ?? types.find((facilityType: any) => facilityType.facilityTypeId === "RETAIL_STORE")?.facilityTypeId
    ?? types.find((facilityType: any) => facilityType.facilityTypeId === "WAREHOUSE")?.facilityTypeId
    ?? types[0]?.facilityTypeId
    ?? "";
});

function setFacilityId(event: any) {
  if (isAutoGenerateId.value) {
    formData.value.facilityId = generateInternalId(event.target.value);
  }
}

function validateFacilityId(event: any) {
  const value = event.target.value;
  const el = facilityIdRef.value?.$el;
  if (!el) return;
  el.classList.remove("ion-valid", "ion-invalid");
  if (value === "") return;
  formData.value.facilityId.length <= 20
    ? el.classList.add("ion-valid")
    : el.classList.add("ion-invalid");
  isAutoGenerateId.value = false;
}

function markFacilityIdTouched() {
  facilityIdRef.value?.$el.classList.add("ion-touched");
}

async function createFacility() {
  if (!formData.value.facilityName?.trim()) {
    commonUtil.showToast(translate("Facility name is required."));
    return;
  }
  if (formData.value.facilityId.length > 20) {
    commonUtil.showToast(translate("Internal ID cannot be more than 20 characters."));
    return;
  }
  if (!formData.value.facilityId) {
    formData.value.facilityId = generateInternalId(formData.value.facilityName);
  }

  try {
    const payload = {
      ...formData.value,
      facilityTypeId: selectedFacilityTypeId.value,
      ownerPartyId: organizationPartyId.value
    };
    // Goes through the composable so the new facility lands in the cache the list pages read; a
    // bare POST here left every facility list stale until the next login sync.
    const resp = await createFacilityRecord(payload);
    if (!commonUtil.hasError(resp)) {
      const facilityId = resp.data?.facilityId || formData.value.facilityId;
      commonUtil.showToast(translate("Facility created successfully."));

      // create default pick location (locations are live-read, so no cache consequence)
      await useFacilityMutations(facilityId).saveLocation({
        locationTypeEnumId: "FLT_PICKLOC",
        areaId: "TL",
        aisleId: "TL",
        sectionId: "TL",
        levelId: "LL",
        positionId: "01"
      });

      router.replace(`/create-facility/address/${facilityId}`);
    } else {
      throw resp.data;
    }
  } catch (error: any) {
    logger.error(error);
    if (error?.response?.data?.error?.message) {
      commonUtil.showToast(error.response.data.error.message);
    } else {
      commonUtil.showToast(translate("Failed to create facility."));
    }
  }
}
</script>

<style scoped>
@media (min-width: 700px) {
  main {
    max-width: 375px;
    margin: auto;
  }
}
</style>
