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
        <h1>{{ translate('Create a new product store') }}</h1>

        <ion-item lines="none" v-if="!productStores.length">
          <ion-input v-model="formData.companyName" label-placement="floating" :label="translate('Company name')" :helper-text="translate('The name of the parent organization that owns all brands deployed on the OMS')" :clear-input="true" />
        </ion-item>
        <ion-item lines="none">
          <ion-input
            ref="storeNameInput"
            name="storeName"
            v-model="formData.storeName"
            @ionBlur="formData.productStoreId ? null : setProductStoreId(formData.storeName)"
            label-placement="floating"
            :helper-text="translate('Product store represents a brand in OMS')"
            :clear-input="true"
          >
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

        <ion-button class="ion-margin-top" @click="manageConfigurations()">
          {{ translate("Manage configurations") }}
          <ion-icon slot="end" :icon="arrowForwardOutline"/>
        </ion-button>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonButton, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonPage, IonProgressBar, IonSelect, IonSelectOption, IonTitle, IonText, IonToolbar, onIonViewDidEnter, onIonViewWillEnter } from "@ionic/vue";
import { arrowForwardOutline } from "ionicons/icons";
import { commonUtil, emitter, logger, translate } from '@common'
import router from "@/router";
import { useProductStore } from '@/store/productStore';
import { useUtilStore } from '@/store/util';
import { computed, nextTick, ref } from "vue";
import { generateInternalId } from '@/utils';

const productStoreStore = useProductStore();
const utilStore = useUtilStore();

const formData = ref({
  companyName: "",
  storeName: "",
  productStoreId: "",
  defaultCurrencyUomId: ""
}) as any;
const storeNameInput = ref<any>(null);
const storeId = ref({}) as any;
const currencies = computed(() => utilStore.currencies)

const productStores = computed(() => productStoreStore.productStores)
const company = computed(() => productStoreStore.company)
const organizationPartyId = computed(() => utilStore.organizationPartyId)

onIonViewWillEnter(async () => {
  productStoreStore.fetchCompany();
  await utilStore.fetchCurrencies({ uomTypeEnumId: 'UT_CURRENCY_MEASURE', pageSize: 250 });
})

onIonViewDidEnter(async () => {
  const focusNativeInput = async (inputComponent: any) => {
    if (!inputComponent?.getInputElement) return;
    try {
      const nativeInput = await inputComponent.getInputElement();
      nativeInput?.focus();
    } catch (error) {
      // no-op: best-effort focus fallback
    }
  }

  const focusStoreName = async () => {
    const inputRef = storeNameInput.value as any;
    if (inputRef?.setFocus) {
      await inputRef.setFocus();
      await focusNativeInput(inputRef);
      return true;
    }

    const fallbackInput = document.querySelector('ion-input[name="storeName"]') as any;
    if (fallbackInput?.setFocus) {
      await fallbackInput.setFocus();
      await focusNativeInput(fallbackInput);
      return true;
    }

    return false;
  }

  await nextTick();
  await focusStoreName();

  // Some navigation timing scenarios require a second pass on initial render.
  setTimeout(() => {
    focusStoreName();
  }, 150);
})

async function manageConfigurations() {
  if (!formData.value.storeName?.trim() || !formData.value.defaultCurrencyUomId) {
    commonUtil.showToast(translate('Please fill all the required fields'))
    return;
  }

  if(!formData.value.productStoreId) {
    formData.value.productStoreId = generateInternalId(formData.value.storeName)
  }

  if (formData.value.productStoreId.length > 20) {
    commonUtil.showToast(translate("Product store ID cannot be more than 20 characters."))
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

    resp = await productStoreStore.createProductStore(payload);

    if(!commonUtil.hasError(resp)) {
      const productStoreId = resp.data.productStoreId;

      if(!productStores.value.length && formData.value.companyName) {
        await productStoreStore.updateCompany({ ...company.value, groupName: formData.value.companyName });
      }

      commonUtil.showToast(translate("Product store created successfully."))
      emitter.emit("dismissLoader");
      router.replace(`/add-configurations/${productStoreId}`);
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    commonUtil.showToast(translate(error.response?.data?.errors ? error.response.data.errors : "Failed to create product store."))
    logger.error(error);
  } 

  emitter.emit("dismissLoader");
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
