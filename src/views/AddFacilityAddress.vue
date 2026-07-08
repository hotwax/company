<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button :default-href="`/create-facility`" slot="start" />
        <ion-title>{{ translate("Add Store Address") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Address") }}</ion-card-title>
          </ion-card-header>
          <ion-list>
            <ion-item>
              <ion-input :label="translate('Shipping name')" label-placement="floating" v-model="formData.toName" />
            </ion-item>
            <ion-item>
              <ion-input label-placement="floating" v-model="formData.address1">
                <div slot="label">{{ translate("Address line 1") }} <ion-text color="danger">*</ion-text></div>
              </ion-input>
            </ion-item>
            <ion-item>
              <ion-input :label="translate('Address line 2')" label-placement="floating" v-model="formData.address2" />
            </ion-item>
            <ion-item>
              <ion-input :label="translate('Directions')" label-placement="floating" v-model="formData.directions" />
            </ion-item>
            <ion-item>
              <ion-input label-placement="floating" v-model="formData.city">
                <div slot="label">{{ translate("City") }} <ion-text color="danger">*</ion-text></div>
              </ion-input>
            </ion-item>
            <ion-item>
              <ion-input label-placement="floating" v-model="formData.postalCode">
                <div slot="label">{{ translate("Zipcode") }} <ion-text color="danger">*</ion-text></div>
              </ion-input>
            </ion-item>
            <ion-item>
              <ion-select
                :label="translate('Country')"
                label-placement="floating"
                interface="popover"
                :placeholder="translate('Select country')"
                @ionChange="onCountryChange($event)"
                v-model="formData.countryGeoId"
              >
                <ion-select-option v-for="country in countries" :key="country.geoId" :value="country.geoId">
                  {{ country.geoName }}
                </ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-select
                :label="translate('State')"
                label-placement="floating"
                interface="popover"
                :disabled="!formData.countryGeoId"
                :placeholder="translate('Select state')"
                v-model="formData.stateProvinceGeoId"
              >
                <ion-select-option v-for="state in statesForCountry" :key="state.geoId" :value="state.geoId">
                  {{ state.wellKnownText && state.wellKnownText !== state.geoName ? `${state.geoName} (${state.wellKnownText})` : state.geoName }}
                </ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-input
                :label="translate('Contact number')"
                :label-placement="countryCode ? 'stacked' : 'floating'"
                v-model="contactNumber"
                @keydown="inputValidation"
              >
                <ion-text slot="start" v-if="countryCode">{{ countryCode }}</ion-text>
              </ion-input>
            </ion-item>
            <ion-item lines="none">
              <ion-input :label="translate('Email address')" label-placement="floating" v-model="emailAddress" />
            </ion-item>
          </ion-list>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Latitude & Longitude") }}</ion-card-title>
          </ion-card-header>
          <ion-list>
            <ion-item>
              <ion-input v-model="formData.postalCode" :placeholder="translate('Zipcode')">
                <ion-button
                  :disabled="!formData.postalCode || !formData.address1 || !formData.city"
                  @click="generateLatLong()"
                  slot="end"
                  fill="outline"
                >
                  <ion-icon slot="end" :icon="colorWandOutline" />
                  {{ translate("Generate") }}
                </ion-button>
              </ion-input>
            </ion-item>
            <ion-item>
              <ion-input
                :label="translate('Latitude')"
                label-placement="floating"
                :disabled="!formData.address1 || !formData.city"
                v-model="formData.latitude"
              />
            </ion-item>
            <ion-item lines="none">
              <ion-input
                :label="translate('Longitude')"
                label-placement="floating"
                :disabled="!formData.address1 || !formData.city"
                v-model="formData.longitude"
              />
            </ion-item>
          </ion-list>
        </ion-card>

        <div class="ion-text-center ion-margin">
          <ion-button @click="addAddress()">
            <ion-icon slot="start" :icon="locationOutline" />
            {{ translate("Save address") }}
          </ion-button>
          <ion-button @click="router.replace(`/create-facility/config/${facilityId}`)" color="medium" fill="clear">
            {{ translate("Add address later") }}
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
import { colorWandOutline, locationOutline } from "ionicons/icons";
import { api, commonUtil, logger, translate } from "@common";
import { useUtilStore } from "@/store/util";
import { isValidEmail } from "@/utils";
import router from "@/router";

const props = defineProps<{ facilityId: string }>();

const utilStore = useUtilStore();

const formData = ref({
  toName: "",
  address1: "",
  address2: "",
  directions: "",
  city: "",
  postalCode: "",
  stateProvinceGeoId: "",
  countryGeoId: "",
  latitude: "",
  longitude: ""
});
const contactNumber = ref("");
const countryCode = ref("");
const emailAddress = ref("");

const countries = computed(() => utilStore.getOperatingCountries);
const statesForCountry = computed(() => utilStore.getStates[formData.value.countryGeoId] ?? []);

onIonViewWillEnter(async () => {
  await utilStore.fetchOperatingCountries();
});

function inputValidation(event: any) {
  if (/[^0-9-]/.test(event.key) && event.key !== "Backspace") event.preventDefault();
}

async function onCountryChange(event: CustomEvent) {
  const geoId = event.detail.value;
  await utilStore.fetchStates({ geoId });
  const country = countries.value.find((c: any) => c.geoId === geoId);
  countryCode.value = country ? (commonUtil.getTelecomCountryCode(country.geoCodeAlpha2) || commonUtil.getTelecomCountryCode(country.geoCode) || "") : "";
}

async function generateLatLong() {
  const postalCode = formData.value.postalCode;
  const query = postalCode.startsWith("0") ? `${postalCode} OR ${postalCode.substring(1)}` : postalCode;
  try {
    const resp = await utilStore.generateLatLong({ json: { params: { q: `postcode: ${query}` } } });
    if (resp?.response?.docs?.length > 0) {
      const result = resp.response.docs[0];
      formData.value.latitude = result.latitude;
      formData.value.longitude = result.longitude;
    } else {
      commonUtil.showToast(translate("Unable to find the latitude and longitude for the entered zip code."));
    }
  } catch (error) {
    commonUtil.showToast(translate("Unable to find the latitude and longitude for the entered zip code."));
    logger.error("Unable to generate lat/long.", error);
  }
}

async function addAddress() {
  if (!formData.value.address1 || !formData.value.city || !formData.value.postalCode) {
    commonUtil.showToast(translate("Please fill all the required fields."));
    return;
  }
  if (emailAddress.value && !isValidEmail(emailAddress.value)) {
    commonUtil.showToast(translate("Invalid email address"));
    return;
  }

  try {
    const resp = await api({
      url: "oms/facilityContactMechs/facilityAddress",
      method: "post",
      data: {
        facilityId: props.facilityId,
        contactMechPurposeTypeId: "PRIMARY_LOCATION",
        ...formData.value
      }
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Facility address created successfully."));
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate("Failed to create facility address."));
    logger.error("Failed to create facility address.", error);
    return;
  }

  if (contactNumber.value) {
    try {
      await api({
        url: "oms/facilityContactMechs/facilityPhone",
        method: "post",
        data: {
          facilityId: props.facilityId,
          contactMechPurposeTypeId: "PRIMARY_PHONE",
          contactNumber: contactNumber.value.trim(),
          countryCode: countryCode.value.replace("+", "")
        }
      });
    } catch (err) {
      logger.error("Failed to save phone.", err);
    }
  }

  if (emailAddress.value) {
    try {
      await api({
        url: "oms/facilityContactMechs/facilityEmail",
        method: "post",
        data: {
          facilityId: props.facilityId,
          contactMechPurposeTypeId: "PRIMARY_EMAIL",
          infoString: emailAddress.value
        }
      });
    } catch (err) {
      logger.error("Failed to save email.", err);
    }
  }

  router.replace(`/create-facility/config/${props.facilityId}`);
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
