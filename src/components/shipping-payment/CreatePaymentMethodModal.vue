<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Create payment method") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item>
        <ion-input
          v-model="description"
          :label="translate('Payment method name')"
          label-placement="stacked"
          :placeholder="translate('e.g. Store Credit')"
          :maxlength="60"
          @ionInput="resetState" />
      </ion-item>

      <ion-item lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translate("Hotwax ID") }}: <ion-text color="primary">{{ derivedId || "—" }}</ion-text></p>
        </ion-label>
      </ion-item>

      <ion-item lines="none" v-if="duplicateWarning">
        <ion-note color="warning">{{ translate("A payment method with this Hotwax ID already exists.") }}</ion-note>
      </ion-item>

      <ion-item>
        <ion-input
          v-model="shopifyId"
          :label="translate('Shopify ID')"
          label-placement="stacked"
          :placeholder="translate('Shopify payment method')" />
      </ion-item>
    </ion-list>
  </ion-content>

  <ion-fab slot="fixed" vertical="bottom" horizontal="end">
    <ion-fab-button :disabled="!canSave" @click="createPaymentMethod()">
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import { computed, onMounted, PropType, ref } from "vue"
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonNote, IonText, IonTitle, IonToolbar, modalController } from "@ionic/vue"
import { closeOutline, saveOutline } from "ionicons/icons"
import { commonUtil, emitter, logger, translate } from "@common"
import { useShopifyStore } from "@/store/shopify"
import { useUtilStore } from "@/store/util"

const props = defineProps({
  shopId: {
    type: String,
    required: true
  },
  existingTypes: {
    type: Array as PropType<any[]>,
    default: () => []
  }
})

const utilStore = useUtilStore()
const shopifyStore = useShopifyStore()

const description = ref("")
const shopifyId = ref("")
const trimmedDescription = computed(() => description.value.trim())
const createdTypeIds = ref(new Set<string>())

const derivedId = computed(() => description.value
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
)

const existingTypeIds = computed(() => {
  const ids = new Set<string>()
  const addTypeId = (rawId: any) => {
    const normalized = String(rawId || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    if (normalized) {
      ids.add(normalized)
    }
  }

  ;(props.existingTypes || []).forEach((type: any) => {
    addTypeId(type?.paymentMethodTypeId)
  })
  ;(utilStore.paymentMethodTypes || []).forEach((type: any) => {
    addTypeId(type?.paymentMethodTypeId)
  })

  return ids
})

const duplicateWarning = computed(() => {
  return Boolean(
    derivedId.value &&
    existingTypeIds.value.has(derivedId.value) &&
    !createdTypeIds.value.has(derivedId.value)
  )
})

const canSave = computed(() => {
  return Boolean(derivedId.value && shopifyId.value.trim()) && !duplicateWarning.value
})

function closeModal() {
  modalController.dismiss()
}

onMounted(() => {
  if (!utilStore.paymentMethodTypes.length) {
    void utilStore.fetchPaymentMethodTypes()
  }
})

function resetState() {
  const trimmed = description.value.trim()
  if (trimmed) {
    return
  }
  shopifyId.value = ""
}

async function createPaymentMethod() {
  if(!canSave.value) {return}

  const paymentMethodTypeId = derivedId.value
  emitter.emit("presentLoader")

  try {
    if (!existingTypeIds.value.has(paymentMethodTypeId)) {
      const typeResp = await utilStore.createPaymentMethodType({
        paymentMethodTypeId,
        description: trimmedDescription.value
      })
      if (commonUtil.hasError(typeResp)) {
        throw typeResp.data
      }
      utilStore.upsertPaymentMethodType({
        paymentMethodTypeId,
        description: trimmedDescription.value
      })
      createdTypeIds.value = new Set([...createdTypeIds.value, paymentMethodTypeId])
    }

    const mappingResp = await shopifyStore.createShopifyShopTypeMapping({
      shopId: props.shopId,
      mappedTypeId: "SHOPIFY_PAYMENT_TYPE",
      mappedKey: shopifyId.value.trim(),
      mappedValue: paymentMethodTypeId
    })
    if (commonUtil.hasError(mappingResp)) {
      throw mappingResp.data
    }

    commonUtil.showToast(translate("Payment method created successfully"))
    modalController.dismiss({ created: true })
  } catch (error) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to create payment method"))
  } finally {
    emitter.emit("dismissLoader")
  }
}
</script>
