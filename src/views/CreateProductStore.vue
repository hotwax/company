<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button default-href="/product-store" slot="start"></ion-back-button>
        <ion-title>{{ translate("Create product store") }}</ion-title>
        <ion-progress-bar value="0.25" />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main>
        <h1 class="ion-margin-start">{{ translate('Create a new product store') }}</h1>

        <ion-item lines="none" v-if="!productStores.length">
          <ion-input v-model="formData.companyName" label-placement="floating" :label="translate('Company name')" :helper-text="translate('The name of the parent organization that owns all brands deployed on the OMS')" :clear-input="true" />
        </ion-item>
        <ion-item lines="none">
          <ion-input v-model="formData.storeName" @ionBlur="formData.productStoreId ? null : setProductStoreId(formData.storeName)" label-placement="floating" :helper-text="translate('Product store represents a brand in OMS')" :clear-input="true">
            <div slot="label">{{ translate("Name") }} <ion-text color="danger">*</ion-text></div>
          </ion-input>
        </ion-item>
        <ion-item lines="none">
          <ion-input ref="storeId" v-model="formData.productStoreId" @ionChange="validateGroupId($event.detail.value)" @ionBlur="markGroupIdTouched" label-placement="floating" :label="translate('ID')" :errorText="translate('Product store ID cannot be more than 20 characters.')" :helper-text="translate('Product store ID represents an unique ID for your product store')" :clear-input="true" />
        </ion-item>
        <ion-item lines="none">
          <ion-select interface="popover" :placeholder="translate('Select')" v-model="formData.defaultCurrencyUomId">
            <div slot="label">{{ translate("Currency") }} <ion-text color="danger">*</ion-text></div>
            <ion-select-option v-for="currency in currencies" :key="currency.uomId" :value="currency.uomId">{{ currency.description}} ({{ currency.abbreviation }})</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item  v-if="!dbicCountriesCount">
          <ion-icon slot="start" :icon="mapOutline"/>
          <ion-label>{{ translate("Operating countries") }}</ion-label>
          <ion-button fill="outline" slot="end" @click="openSelectOperatingCountriesModal()">{{ translate("Add") }}</ion-button>
        </ion-item>

        <ion-item lines="none" v-if="!dbicCountriesCount">
          <ion-chip outline v-for="country in selectedCountries" :key="country.geoId">
            {{ country.geoName }}
            <ion-icon :icon="closeCircleOutline" @click="removeCountry(country.geoId)" />
          </ion-chip>
        </ion-item>

        <ion-button class="ion-margin-top" @click="manageConfigurations()">
          {{ translate("Manage configurations") }}
          <ion-icon slot="end" :icon="arrowForwardOutline"/>
        </ion-button>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonButton, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonProgressBar, IonSelect, IonSelectOption, IonTitle, IonText, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
import { arrowForwardOutline, closeCircleOutline, mapOutline } from "ionicons/icons";
import { translate } from '@common';
import router from "@/router";
import { useProductStoreStore } from '@/store/productStore';
import { useUtilStore } from '@/store/util';
import { computed, ref } from "vue";
import SelectOperatingCountriesModal from "@/components/SelectOperatingCountriesModal.vue";
import { commonUtil, hasError } from '@common'
import { generateInternalId } from '@/utils';
import { logger } from '@common';
import { ProductStoreService } from "@/services/ProductStoreService";
import { emitter } from '@common';

const productStoreStore = useProductStoreStore();
const utilStore = useUtilStore();

const formData = ref({
  companyName: "",
  storeName: "",
  productStoreId: "",
  defaultCurrencyUomId: ""
}) as any;
const selectedCountries = ref([]) as any;
const storeId = ref({}) as any;
const currencies = computed(() => utilStore.currencies)

const productStores = computed(() => productStoreStore.productStores)
const dbicCountriesCount = computed(() => utilStore.dbicCountriesCount)
const company = computed(() => productStoreStore.company)
const organizationPartyId = computed(() => utilStore.organizationPartyId)

onIonViewWillEnter(async () => {
  await utilStore.fetchDBICCountries();
  productStoreStore.fetchCompany();
  if(!dbicCountriesCount.value) await utilStore.fetchOperatingCountries();
  await utilStore.fetchCurrencies({ uomTypeEnumId: 'UT_CURRENCY_MEASURE', pageSize: 250 });
})

async function manageConfigurations() {
  if (!formData.value.storeName?.trim() || !formData.value.defaultCurrencyUomId) {
    commonUtil.commonUtil.showToast(translate('Please fill all the required fields'))
    return;
  }

  if(!formData.value.productStoreId) {
    formData.value.productStoreId = generateInternalId(formData.value.storeName)
  }

  if (formData.value.productStoreId.length > 20) {
    commonUtil.commonUtil.showToast(translate("Product store ID cannot be more than 20 characters."))
    return
  }

  let resp;

  emitter.emit("presentLoader");

  try {
    const payload = {
      storeName: formData.value.storeName,
      productStoreId: formData.value.productStoreId,
      companyName: company.value.companyName,
      payToPartyId: organizationPartyId.value,
      defaultCurrencyUomId: formData.value.defaultCurrencyUomId
    } as any;

    if(!productStores.value.length) {
      payload["companyName"] = formData.value.companyName
    }

    resp = await ProductStoreService.createProductStore(payload);

    if(!commonUtil.hasError(resp)) {
      const productStoreId = resp.data.productStoreId;
      
      if(!dbicCountriesCount.value) {
        const responses = await Promise.allSettled(selectedCountries.value.map((country: any) => ProductStoreService.addDBICCountries({
            geoId: country.geoId,
            toGeoId: "DBIC",
            geoAssocTypeEnumId: "GROUP_MEMBER"
          }))
        )
        
        const hasFailedResponse = responses.some((response: any) => response.status === 'rejected')
        if(hasFailedResponse) {
          logger.error("Failed to associate update some DBIC countries.")
        }
      }
      
      if(!productStores.value.length && formData.value.companyName) {
        await ProductStoreService.updateCompany({ ...company.value, groupName: formData.value.companyName });
      }

      commonUtil.commonUtil.showToast(translate("Product store created successfully."))
      emitter.emit("dismissLoader");
      router.replace(`add-configurations/${productStoreId}`);
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    commonUtil.commonUtil.showToast(translate(error.response?.data?.errors ? error.response.data.errors : "Failed to create product store."))
    logger.error(error);
  } 

  emitter.emit("dismissLoader");
}

async function openSelectOperatingCountriesModal() {
  const modal = await modalController.create({
    component: SelectOperatingCountriesModal,
    componentProps: {
      selectedCountries: selectedCountries.value
    }
  })

  modal.onDidDismiss().then((result: any) => {
    if(result.data?.selectedCountries) {
      selectedCountries.value = result.data?.selectedCountries
    }
  })

  modal.present()
}

function removeCountry(geoId: string) {
  selectedCountries.value = selectedCountries.value.filter((country: any) => country.geoId !== geoId);
}

function setProductStoreId(storeName: string) {
  formData.value.productStoreId = generateInternalId(storeName)
  validateGroupId(formData.productStoreId);
}

function validateGroupId(value: any) {
  storeId.value.$el.classList.remove('ion-valid');
  storeId.value.$el.classList.remove('ion-invalid');

  if (value === '') return;

  formData.value.productStoreId.length <= 20
    ? storeId.value.$el.classList.add('ion-valid')
    : storeId.value.$el.classList.add('ion-invalid');
}

function markGroupIdTouched() {
  storeId.value.$el.classList.add('ion-touched');
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