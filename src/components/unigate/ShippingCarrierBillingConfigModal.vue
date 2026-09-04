<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="dismiss()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ isEdit ? translate("Edit billing config") : translate("Add billing config") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content class="ion-padding">
    <form @submit.prevent="save">
      <ion-list>
        <!-- Carrier Party -->
        <ion-item>
          <ion-select
            v-model="formData.carrierPartyId"
            :label="translate('Carrier')"
            label-placement="floating"
            :disabled="isEdit"
            required
            data-testid="billing-carrier-party-select"
          >
            <ion-select-option
              v-for="c in carriers"
              :key="c.partyId"
              :value="c.partyId"
            >
              {{ c.groupName || c.partyId }} ({{ c.partyId }})
            </ion-select-option>
          </ion-select>
        </ion-item>

        <!-- Product Store -->
        <ion-item>
          <ion-select
            v-model="formData.productStoreId"
            :label="translate('Product store')"
            label-placement="floating"
            :disabled="isEdit"
            required
            data-testid="billing-product-store-select"
          >
            <ion-select-option
              v-for="store in productStores"
              :key="store.productStoreId"
              :value="store.productStoreId"
            >
              {{ store.storeName || store.productStoreId }} ({{ store.productStoreId }})
            </ion-select-option>
          </ion-select>
        </ion-item>

        <!-- Sales Channel (Optional) -->
        <ion-item>
          <ion-input
            v-model="formData.salesChannelEnumId"
            :label="translate('Sales channel (e.g. SHOPIFY_CHANNEL)')"
            label-placement="floating"
            placeholder="SHOPIFY_CHANNEL"
            data-testid="billing-sales-channel-input"
          />
        </ion-item>

        <!-- Facility (Optional) -->
        <ion-item>
          <ion-select
            v-model="formData.facilityId"
            :label="translate('Facility (optional)')"
            label-placement="floating"
            data-testid="billing-facility-select"
          >
            <ion-select-option value="">
              {{ translate("All facilities (Store default)") }}
            </ion-select-option>
            <ion-select-option
              v-for="f in facilities"
              :key="f.facilityId"
              :value="f.facilityId"
            >
              {{ f.facilityName || f.facilityId }} ({{ f.facilityId }})
            </ion-select-option>
          </ion-select>
        </ion-item>

        <!-- Billing Account Number -->
        <ion-item>
          <ion-input
            v-model="formData.billingAccountNumber"
            :label="translate('Billing account number')"
            label-placement="floating"
            placeholder="e.g. 987654321"
            required
            data-testid="billing-account-number-input"
          />
        </ion-item>
      </ion-list>

      <div class="ion-padding-top">
        <ion-button
          expand="block"
          type="submit"
          :disabled="isSaving || !isValid"
          data-testid="save-billing-config-btn"
        >
          <ion-spinner v-if="isSaving" slot="start" />
          {{ isEdit ? translate("Update billing config") : translate("Save billing config") }}
        </ion-button>
      </div>
    </form>
  </ion-content>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController,
} from "@ionic/vue";
import { closeOutline } from "ionicons/icons";
import { commonUtil, translate } from "@common";
import {
  saveShippingCarrierBillingConfig,
  type ShippingCarrierBillingConfig,
} from "@/composables/useUnigate";
import { useCarriers } from "@/composables/useCarriers";
import { useProductStores } from "@/composables/useProductStores";
import { useFacilities } from "@/composables/useFacilities";

const props = defineProps<{
  config?: ShippingCarrierBillingConfig | null;
}>();

const { carriers } = useCarriers();
const { productStores } = useProductStores();
const { facilities } = useFacilities();

const isEdit = computed(() => Boolean(props.config?.carrierBillingConfigId));

const formData = reactive<ShippingCarrierBillingConfig>({
  carrierBillingConfigId: props.config?.carrierBillingConfigId || undefined,
  carrierPartyId: props.config?.carrierPartyId || "",
  productStoreId: props.config?.productStoreId || "",
  facilityId: props.config?.facilityId || "",
  salesChannelEnumId: props.config?.salesChannelEnumId || "",
  billingAccountNumber: props.config?.billingAccountNumber || "",
});

const isSaving = ref(false);

const isValid = computed(() => {
  return Boolean(
    formData.carrierPartyId &&
    formData.productStoreId &&
    formData.billingAccountNumber?.trim()
  );
});

onMounted(() => {
  if (!formData.carrierPartyId && carriers.value.length > 0) {
    formData.carrierPartyId = carriers.value[0].partyId;
  }
  if (!formData.productStoreId && productStores.value.length > 0) {
    formData.productStoreId = productStores.value[0].productStoreId;
  }
});

function dismiss(saved = false) {
  modalController.dismiss({ saved });
}

async function save() {
  if (!isValid.value) return;
  isSaving.value = true;
  try {
    const payload: ShippingCarrierBillingConfig = {
      carrierPartyId: formData.carrierPartyId,
      productStoreId: formData.productStoreId,
      billingAccountNumber: formData.billingAccountNumber?.trim(),
      salesChannelEnumId: formData.salesChannelEnumId?.trim() || undefined,
    };
    if (formData.carrierBillingConfigId) payload.carrierBillingConfigId = formData.carrierBillingConfigId;
    if (formData.facilityId?.trim()) payload.facilityId = formData.facilityId.trim();

    await saveShippingCarrierBillingConfig(payload);
    commonUtil.showToast(translate("Billing configuration saved successfully."));
    dismiss(true);
  } catch (err: any) {
    commonUtil.showToast(translate(err?.message || "Failed to save billing configuration."));
  } finally {
    isSaving.value = false;
  }
}
</script>
