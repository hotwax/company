<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="dismiss()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ isEdit ? translate("Edit carrier mapping") : translate("Add carrier mapping") }}</ion-title>
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
            :disabled="isEdit || Boolean(defaultCarrierPartyId)"
            required
            data-testid="carrier-party-select"
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
            data-testid="carrier-product-store-select"
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

        <!-- Gateway Auth -->
        <ion-item>
          <ion-select
            v-model="formData.gatewayAuthId"
            :label="translate('Gateway auth / Credentials')"
            label-placement="floating"
            required
            data-testid="carrier-gateway-auth-select"
          >
            <ion-select-option
              v-for="auth in shippingGatewayAuths"
              :key="auth.shippingGatewayAuthId"
              :value="auth.shippingGatewayAuthId"
            >
              {{ auth.description || auth.shippingGatewayAuthId }} ({{ auth.shippingGatewayConfigId }})
            </ion-select-option>
          </ion-select>
        </ion-item>

        <!-- Facility (Optional) -->
        <ion-item>
          <ion-select
            v-model="formData.facilityId"
            :label="translate('Facility (optional)')"
            label-placement="floating"
            data-testid="carrier-facility-select"
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

        <!-- Carrier Account Number -->
        <ion-item>
          <ion-input
            v-model="formData.carrierAccountId"
            :label="translate('Carrier account number')"
            label-placement="floating"
            placeholder="e.g. 510087780"
            data-testid="carrier-account-id-input"
          />
        </ion-item>

        <!-- Customer Number -->
        <ion-item>
          <ion-input
            v-model="formData.customerNumber"
            :label="translate('Customer number')"
            label-placement="floating"
            placeholder="e.g. 00012345"
            data-testid="carrier-customer-number-input"
          />
        </ion-item>

        <!-- Packaging Type -->
        <ion-item>
          <ion-select
            v-model="formData.packagingType"
            :label="translate('Packaging type')"
            label-placement="floating"
            data-testid="carrier-packaging-type-select"
          >
            <ion-select-option value="YOUR_PACKAGING">{{ translate("Your Packaging") }}</ion-select-option>
            <ion-select-option value="FEDEX_BOX">{{ translate("FedEx Box") }}</ion-select-option>
            <ion-select-option value="FEDEX_ENVELOPE">{{ translate("FedEx Envelope") }}</ion-select-option>
            <ion-select-option value="FEDEX_PAK">{{ translate("FedEx Pak") }}</ion-select-option>
            <ion-select-option value="UPS_LETTER">{{ translate("UPS Letter") }}</ion-select-option>
            <ion-select-option value="UPS_PACKAGE">{{ translate("UPS Package / Customer Supplied") }}</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- Dropoff Type -->
        <ion-item>
          <ion-select
            v-model="formData.dropoffType"
            :label="translate('Dropoff type')"
            label-placement="floating"
          >
            <ion-select-option value="REGULAR_PICKUP">{{ translate("Regular Pickup") }}</ion-select-option>
            <ion-select-option value="BUSINESS_SERVICE_CENTER">{{ translate("Business Service Center") }}</ion-select-option>
            <ion-select-option value="DROP_BOX">{{ translate("Drop Box") }}</ion-select-option>
            <ion-select-option value="REQUEST_COURIER">{{ translate("Request Courier") }}</ion-select-option>
            <ion-select-option value="STATION">{{ translate("Station") }}</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- Label Size -->
        <ion-item>
          <ion-select
            v-model="formData.labelSize"
            :label="translate('Label size')"
            label-placement="floating"
            data-testid="carrier-label-size-select"
          >
            <ion-select-option value="4X6">4 x 6 inches</ion-select-option>
            <ion-select-option value="4X8">4 x 8 inches</ion-select-option>
            <ion-select-option value="4X9">4 x 9 inches</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- Label Image Type -->
        <ion-item>
          <ion-select
            v-model="formData.labelImageType"
            :label="translate('Label image type')"
            label-placement="floating"
          >
            <ion-select-option value="PDF">PDF</ion-select-option>
            <ion-select-option value="PNG">PNG</ion-select-option>
            <ion-select-option value="ZPL">ZPL</ion-select-option>
            <ion-select-option value="EPL2">EPL2</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- Weight UOM -->
        <ion-item>
          <ion-select
            v-model="formData.weightUomId"
            :label="translate('Weight unit of measure')"
            label-placement="floating"
          >
            <ion-select-option value="WT_lb">{{ translate("Pounds (LB)") }}</ion-select-option>
            <ion-select-option value="WT_kg">{{ translate("Kilograms (KG)") }}</ion-select-option>
            <ion-select-option value="WT_oz">{{ translate("Ounces (OZ)") }}</ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>

      <div class="ion-padding-top">
        <ion-button
          expand="block"
          type="submit"
          :disabled="isSaving || !isValid"
          data-testid="save-carrier-config-btn"
        >
          <ion-spinner v-if="isSaving" slot="start" />
          {{ isEdit ? translate("Update mapping") : translate("Save mapping") }}
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
  fetchShippingGatewayAuths,
  saveShippingCarrierConfig,
  type ShippingCarrierConfig,
  useUnigate,
} from "@/composables/useUnigate";
import { useCarriers } from "@/composables/useCarriers";
import { useProductStores } from "@/composables/useProductStores";
import { useFacilities } from "@/composables/useFacilities";

const props = defineProps<{
  config?: ShippingCarrierConfig | null;
  defaultCarrierPartyId?: string;
}>();

const { shippingGatewayAuths } = useUnigate();
const { carriers } = useCarriers();
const { productStores } = useProductStores();
const { facilities } = useFacilities();

const isEdit = computed(() => Boolean(props.config?.carrierConfigId));

const formData = reactive<ShippingCarrierConfig>({
  carrierConfigId: props.config?.carrierConfigId || undefined,
  carrierPartyId: props.config?.carrierPartyId || props.defaultCarrierPartyId || "",
  productStoreId: props.config?.productStoreId || "",
  facilityId: props.config?.facilityId || "",
  gatewayAuthId: props.config?.gatewayAuthId || "",
  carrierAccountId: props.config?.carrierAccountId || "",
  customerNumber: props.config?.customerNumber || "",
  packagingType: props.config?.packagingType || "YOUR_PACKAGING",
  dropoffType: props.config?.dropoffType || "REGULAR_PICKUP",
  labelSize: props.config?.labelSize || "4X6",
  labelImageType: props.config?.labelImageType || "PDF",
  weightUomId: props.config?.weightUomId || "WT_lb",
});

const isSaving = ref(false);

const isValid = computed(() => {
  return Boolean(
    formData.carrierPartyId &&
    formData.productStoreId &&
    formData.gatewayAuthId
  );
});

onMounted(async () => {
  await fetchShippingGatewayAuths();
  if (!formData.carrierPartyId && carriers.value.length > 0) {
    formData.carrierPartyId = carriers.value[0].partyId;
  }
  if (!formData.productStoreId && productStores.value.length > 0) {
    formData.productStoreId = productStores.value[0].productStoreId;
  }
  if (!formData.gatewayAuthId && shippingGatewayAuths.value.length > 0) {
    formData.gatewayAuthId = shippingGatewayAuths.value[0].shippingGatewayAuthId;
  }
});

function dismiss(saved = false) {
  modalController.dismiss({ saved });
}

async function save() {
  if (!isValid.value) return;
  isSaving.value = true;
  try {
    const payload: ShippingCarrierConfig = {
      carrierPartyId: formData.carrierPartyId,
      productStoreId: formData.productStoreId,
      gatewayAuthId: formData.gatewayAuthId,
      carrierAccountId: formData.carrierAccountId?.trim() || undefined,
      customerNumber: formData.customerNumber?.trim() || undefined,
      packagingType: formData.packagingType || undefined,
      dropoffType: formData.dropoffType || undefined,
      labelSize: formData.labelSize || undefined,
      labelImageType: formData.labelImageType || undefined,
      weightUomId: formData.weightUomId || undefined,
    };
    if (formData.carrierConfigId) payload.carrierConfigId = formData.carrierConfigId;
    if (formData.facilityId?.trim()) payload.facilityId = formData.facilityId.trim();

    await saveShippingCarrierConfig(payload);
    commonUtil.showToast(translate("Carrier mapping saved successfully."));
    dismiss(true);
  } catch (err: any) {
    commonUtil.showToast(translate(err?.message || "Failed to save carrier mapping."));
  } finally {
    isSaving.value = false;
  }
}
</script>
