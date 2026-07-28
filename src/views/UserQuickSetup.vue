<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button default-href="/create-user" slot="start"></ion-back-button>
        <ion-title>{{ translate("Create user") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main>
        <ion-item class="ion-margin-bottom" v-if="!isFacilityLogin()">
          <ion-icon slot="start" :icon="documentTextOutline"/>
          <ion-select :label="translate('Select template')" interface="popover" v-model="userTemplateId" @ionChange="updateUserTemplate">
            <ion-select-option v-for="userTemplate in userTemplates" :key="userTemplate.templateId" :value="userTemplate.templateId">{{ userTemplate.templateName }}</ion-select-option>
          </ion-select>
        </ion-item>
        <template v-if="(selectedUserTemplate && selectedUserTemplate.isUserLoginRequired || isFacilityLogin())">
          <ion-item>
            <ion-input label-placement="floating" v-model="formData.userLoginId">
              <div slot="label">{{ translate('Username') }} <ion-text color="danger">*</ion-text></div>
            </ion-input>
          </ion-item>
          <ion-item lines="none">
            <ion-input
              ref="passwordRef"
              label-placement="floating"
              v-model="formData.currentPassword"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              @ionInput="validatePassword"
              @ionBlur="markPasswordTouched"
              :helper-text="translate('Password should be at least 5 characters long and contain at least one number, alphabet and special character.')"
              :error-text="translate('Password should be at least 5 characters long and contain at least one number, alphabet and special character.')"
            >
              <div slot="label">{{ translate("Password") }} <ion-text color="danger">*</ion-text></div>
              <ion-button size="default" @click="showPassword = !showPassword" slot="end" fill="clear">
                <ion-icon :icon="showPassword ? eyeOutline : eyeOffOutline" slot="icon-only" />
              </ion-button>
            </ion-input>
          </ion-item>
          <ion-item>
            <ion-input label-placement="floating" v-model="formData.emailAddress">
              <div slot="label">{{ isFacilityLogin() ? translate('Reset password email') : translate('Email') }} <ion-text color="danger">*</ion-text></div>
            </ion-input>
          </ion-item>
          <ion-item class="ion-margin-top">
            <ion-toggle :disabled="selectedUserTemplate.isPasswordChangeDisabled" :checked="formData.requirePasswordChange" label-placement="start" justify="space-between" @ionChange="toggleRequirePasswordChange">
              {{ translate("Require password reset on login") }}
            </ion-toggle>
          </ion-item>
        </template>
        <ion-item v-if="selectedUserTemplate && selectedUserTemplate.isEmployeeIdRequired && !isFacilityLogin()">
          <ion-input :label="translate('Employee ID')" label-placement="floating" v-model="formData.externalId"></ion-input>
        </ion-item>

        <ion-item v-if="selectedUserTemplate && selectedUserTemplate.isProductStoreRequired && !isFacilityLogin()">
          <ion-label>
            {{ translate("Product stores") }}
          </ion-label>
          <ion-button slot="end" @click="addProductStores()">
            {{ selectedProductStores ? selectedProductStores.length : 0 }} {{ translate("selected") }}
          </ion-button>
        </ion-item>

        <ion-list v-if="(selectedUserTemplate && selectedUserTemplate.isFacilityRequired) || isFacilityLogin()">
          <ion-list-header>
            <ion-label>{{ translate('Select Facilities') }}</ion-label>
            <ion-button fill="clear" @click="addFacilities()">
              {{ translate("Add") }}
              <ion-icon slot="end" :icon="addCircleOutline"></ion-icon>
            </ion-button>
          </ion-list-header>
          <ion-item v-for="facility in facilities" :key="facility.facilityId">
            <ion-checkbox v-if="!isFacilityLogin()" :checked="true" @ionChange="toggleFacilitySelection(facility)">
              <ion-label>
                {{ facility.facilityName || facility.facilityId }}
                <p>{{ facility.facilityId }}</p>
              </ion-label>
            </ion-checkbox>
            <ion-label v-else>
              {{ facility.facilityName || facility.facilityId }}
              <p>{{ facility.facilityId }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <div class="actions ion-margin-top">
          <ion-button @click="finishSetup()">
            {{ translate("Finish setup") }}
            <ion-icon slot="end" :icon="arrowForwardOutline"/>
          </ion-button>
          <ion-button class="ion-margin-top" fill="outline" size="small" @click="confirmSetupManually()">
            {{ translate("Setup manually") }}
          </ion-button>
          <ion-button color="medium" fill="outline" size="small" @click="finishAndCreateNewUser()">
            {{ translate("Finish and create new user") }}
          </ion-button>
        </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, type ComputedRef, type Ref } from "vue";
import { IonBackButton, IonButton, IonCheckbox, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonPage, IonSelect, IonSelectOption, IonText, IonTitle, IonToggle, IonToolbar, alertController, modalController, onIonViewWillEnter } from "@ionic/vue";
import router from "@/router";
import { useFacilities } from "@/composables/useFacilities";
import { useProductStores } from "@/composables/useProductStores";
import { useUserStore } from "@/store/user";
import { addCircleOutline, arrowForwardOutline, documentTextOutline, eyeOffOutline, eyeOutline } from "ionicons/icons";
import { commonUtil, translate, logger } from "@common";
import SelectFacilityModal from "@/components/facility/SelectFacilityModal.vue";
import SelectProductStoreModal from "@/components/product-store/SelectProductStoreModal.vue";
import { getResponseErrorMessage } from "@/utils";

const props = defineProps({
  partyId: {
    type: String,
    required: true
  }
});

const userStore = useUserStore();

const passwordRef = ref<any>(null);

const userTemplateId = ref("FULFILLMENT");
const selectedUserTemplate = ref<any>({});
const facilities = ref<any[]>([]);
const selectedFacilities = ref<any[]>([]);
const selectedProductStores = ref<any[]>([]);
const showPassword = ref(false);
const formData = ref({
  userLoginId: "",
  currentPassword: "",
  emailAddress: "",
  externalId: "",
  requirePasswordChange: false,
});

const userTemplates = [
  {
    "templateId": "ADMIN",
    "templateName": "Admin",
    "securityGroupId": "ADMIN",
    "roleTypeId": "",
    "isUserLoginRequired": true,
    "isFacilityRequired": false,
    "facilityRoleTypeId": "",
    "isProductStoreRequired": true,
    "productStoreRoleTypeId": "APPLICATION_USER",
  },
  {
    "templateId": "MERCHANDISING_MANAGER",
    "templateName": "Merchandising manager",
    "securityGroupId": "MERCHANDISE_MGR",
    "roleTypeId": "",
    "isUserLoginRequired": true,
    "isFacilityRequired": false,
    "facilityRoleTypeId": "",
    "isProductStoreRequired": true,
    "productStoreRoleTypeId": "APPLICATION_USER",
  },
  {
    "templateId": "CSR",
    "templateName": "CSR",
    "securityGroupId": "CSR",
    "roleTypeId": "",
    "isUserLoginRequired": true,
    "isFacilityRequired": false,
    "facilityRoleTypeId": "",
    "isProductStoreRequired": false,
    "productStoreRoleTypeId": "",
  },
  {
    "templateId": "FULFILLMENT_MANAGER",
    "templateName": "Fulfillment manager",
    "securityGroupId": "STORE_MANAGER",
    "roleTypeId": "WAREHOUSE_PICKER",
    "isUserLoginRequired": true,
    "isEmployeeIdRequired": true,
    "isFacilityRequired": true,
    "facilityRoleTypeId": "WAREHOUSE_PICKER",
    "isProductStoreRequired": false,
    "productStoreRoleTypeId": ""
  },
  {
    "templateId": "FULFILLMENT",
    "templateName": "Fulfillment",
    "securityGroupId": "",
    "roleTypeId": "WAREHOUSE_PICKER",
    "isEmployeeIdRequired": true,
    "isFacilityRequired": false,
    "facilityRoleTypeId": "",
    "isProductStoreRequired": false,
    "productStoreRoleTypeId": ""
  }
];

const selectedUser = computed(() => userStore.selectedUser);
// Cached, reactive — no fetch needed. Both tables hydrate asynchronously, so the view-enter
// defaults below wait on the `hydrated` flags instead of assuming the data is already present.
// The old store fetch excluded virtual (parking) facilities server-side; `excludeVirtual` keeps
// that rule.
const { productStores, hydrated: productStoresHydrated } = useProductStores();
const { facilities: allFacilities, hydrated: facilitiesHydrated } = useFacilities({ excludeVirtual: true });

onMounted(() => {
  if(!isFacilityLogin()) {
    // Set selectedUserTemplate to the default value "FULFILLMENT" on component creation
    selectedUserTemplate.value = userTemplates.find(template => template.templateId === userTemplateId.value);
  }
});

onIonViewWillEnter(async () => {
  clearFormData();
  await userStore.getSelectedUserDetails({ partyId: props.partyId });
  // Initially all product stores come selected, this must run once the cached table has hydrated
  // so the count on the "Product stores" button reflects the actual list, not an empty snapshot.
  whenHydrated(productStoresHydrated, () => {
    selectedProductStores.value = productStores.value;
  });
  whenHydrated(facilitiesHydrated, () => {
    if(isFacilityLogin()) {
      const addedFacilityIds = selectedUser.value.facilities?.map((facility: any) => facility.facilityId) || [];
      const addedFacilities = allFacilities.value.filter((facility: any) => addedFacilityIds.includes(facility.facilityId));
      facilities.value = addedFacilities;
      selectedFacilities.value = addedFacilities;
    }
  });
  await initializeFormData();
});

/**
 * Run `then` as soon as `source` is true — now if it already is, otherwise on the first flip.
 * Same helper as ShopifyProductSync.vue: the obvious inline `watch(..., { immediate: true })`
 * form is a TDZ trap on a warm cache, where the callback runs before `stop` is assigned.
 */
function whenHydrated(source: Ref<boolean> | ComputedRef<boolean>, then: () => unknown) {
  if(source.value) { void then(); return; }
  const stop = watch(source, (ready) => {
    if(!ready) return;
    stop();
    void then();
  });
}

const isFacilityLogin = () => {
  return selectedUser.value && selectedUser.value.partyTypeId === "PARTY_GROUP";
};

const initializeFormData = () => {
  if(selectedUser.value) {
    formData.value.externalId = selectedUser.value.externalId || "";
    if(isFacilityLogin()) {
      formData.value.requirePasswordChange = false;
      formData.value.userLoginId = selectedUser.value.facilities?.[0]?.facilityId || "";
    } else {
      formData.value.userLoginId = selectedUserTemplate.value.isUserLoginRequired ? `${selectedUser.value.firstName?.toLowerCase() || ""}.${selectedUser.value.lastName?.toLowerCase() || ""}` : "";
    }
    formData.value.emailAddress = selectedUser.value.emailDetails?.email || "";
  }
};

const clearFormData = () => {
  formData.value = {
    userLoginId: "",
    currentPassword: "",
    emailAddress: "",
    externalId: "",
    requirePasswordChange: false
  };
};

const updateUserTemplate = (event: CustomEvent) => {
  const selectedTemplateId = event.detail.value;
  selectedUserTemplate.value = userTemplates.find((userTemplate: any) => userTemplate.templateId === selectedTemplateId);
  clearFormData();
  initializeFormData();
};

const validatePassword = (event: any) => {
  const value = event.target.value;
  if(!passwordRef.value) return;
  passwordRef.value.$el.classList.remove("ion-valid");
  passwordRef.value.$el.classList.remove("ion-invalid");

  if(value === "") return;

  commonUtil.isValidPassword(value)
    ? passwordRef.value.$el.classList.add("ion-valid")
    : passwordRef.value.$el.classList.add("ion-invalid");
};

const markPasswordTouched = () => {
  if(passwordRef.value) {
    passwordRef.value.$el.classList.add("ion-touched");
  }
};

const validateUserDetail = (data: any) => {
  const validationErrors = [];
  if(selectedUserTemplate.value.isUserLoginRequired || isFacilityLogin()) {
    if(!data.userLoginId) {
      validationErrors.push(translate("Username is required."));
    }
    if(!data.currentPassword) {
      validationErrors.push(translate("Password is required."));
    }
    if(!data.emailAddress) {
      validationErrors.push(translate("Email is required."));
    }
  }
  if(data.emailAddress && !commonUtil.isValidEmail(data.emailAddress)) {
    validationErrors.push(translate("Invalid email address."));
  }
  if(data.currentPassword && !commonUtil.isValidPassword(data.currentPassword)) {
    validationErrors.push(translate("Invalid passowrd. Password should be at least 5 characters long and contain at least one number, alphabet and special character."));
  }
  return validationErrors;
};

const finishSetup = async () => {
  try {
    const validationErrors = validateUserDetail(formData.value);
    if(validationErrors.length > 0) {
      const errorMessages = validationErrors.join(" ");
      logger.error(errorMessages);
      commonUtil.showToast(translate(errorMessages));
      return;
    }
    await userStore.finishSetup({
      selectedUser: selectedUser.value,
      selectedTemplate: selectedUserTemplate.value,
      formData: formData.value,
      productStores: selectedProductStores.value,
      facilities: selectedFacilities.value
    });
    if(selectedUserTemplate.value.isUserLoginRequired) {
      await finishSetupAlert(formData.value.userLoginId);
    } else {
      router.replace({ path: `/user-details/${props.partyId}` });
    }
  } catch (err: any) {
    logger.error("error", err);
    commonUtil.showToast(getResponseErrorMessage(err, translate("Failed to quick setup user.")));
  }
};

const finishSetupAlert = async (userLoginId: any) => {
  const message = "is ready to login";
  const alert = await alertController.create({
    header: translate("Setup complete"),
    message: translate(message, { userLoginId: userLoginId }),
    backdropDismiss: false,
    buttons: [
      {
        text: translate("Proceed"),
        handler: (data: any) => {
          copyCredentials(data);
        }
      }
    ],
    inputs: [
      {
        name: "copyCredentials",
        label: "Copy credentials",
        type: "checkbox",
        value: "Y",
      }
    ]
  });
  return alert.present();
};

const copyCredentials = (data: any) => {
  if(data.length > 0) {
    const dataToCopy = `username: ${formData.value.userLoginId}, password: ${formData.value.currentPassword}`;
    commonUtil.copyToClipboard(dataToCopy, "Copied to clipboard");
  }
  router.replace({ path: `/user-details/${props.partyId}` });
};

const confirmSetupManually = async () => {
  const message = "Automatic user setup helps configure various settings to get them up and running with most frequently used settings. Are you sure you want to set up this user manually?";
  const alert = await alertController.create({
    header: translate("Setup manually"),
    message: translate(message),
    buttons: [
      {
        text: translate("Cancel"),
      },
      {
        text: translate("Setup manually"),
        handler: async () => {
          await setupManually();
        }
      }
    ],
  });
  return alert.present();
};

const setupManually = async () => {
  await router.replace({ path: `/user-details/${props.partyId}` });
};

const finishAndCreateNewUser = async () => {
  try {
    const validationErrors = validateUserDetail(formData.value);
    if(validationErrors.length > 0) {
      const errorMessages = validationErrors.join(" ");
      logger.error(errorMessages);
      commonUtil.showToast(translate(errorMessages));
      return;
    }
    await userStore.finishSetup({
      selectedUser: selectedUser.value,
      selectedTemplate: selectedUserTemplate.value,
      formData: formData.value,
      productStores: selectedProductStores.value,
      facilities: selectedFacilities.value
    });
    await userStore.clearSelectedUser();
    await router.replace({ path: "/create-user" });
  } catch (err: any) {
    logger.error("error", err);
    commonUtil.showToast(getResponseErrorMessage(err, translate("Failed to quick setup user.")));
  }
};

const addFacilities = async () => {
  const selectFacilityModal = await modalController.create({
    component: SelectFacilityModal,
    componentProps: { selectedFacilities: selectedFacilities.value, isFacilityLogin: isFacilityLogin() }
  });

  selectFacilityModal.onDidDismiss().then((result) => {
    if(result.data && result.data.value) {
      facilities.value = result.data.value.selectedFacilities;
      selectedFacilities.value = result.data.value.selectedFacilities;
    }
  });
  return selectFacilityModal.present();
};

const toggleFacilitySelection = (updatedFacility: any) => {
  const selectedFacility = selectedFacilities.value.find((facility: any) => facility.facilityId === updatedFacility.facilityId);
  if(selectedFacility) {
    selectedFacilities.value = selectedFacilities.value.filter((facility: any) => facility.facilityId !== updatedFacility.facilityId);
  } else {
    selectedFacilities.value.push(updatedFacility);
  }
};

const addProductStores = async () => {
  const selectProductStoreModal = await modalController.create({
    component: SelectProductStoreModal,
    componentProps: { selectedProductStores: selectedProductStores.value }
  });

  selectProductStoreModal.onDidDismiss().then((result) => {
    if(result.data && result.data.value) {
      selectedProductStores.value = result.data.value.selectedProductStores;
    }
  });
  return selectProductStoreModal.present();
};

const toggleRequirePasswordChange = () => {
  formData.value.requirePasswordChange = !formData.value.requirePasswordChange;
};
</script>

<style scoped>
  @media (min-width: 700px) {
    main {
      max-width: 375px;
      margin: auto;
    }
  }

  .actions {
    display: flex;
    flex-direction: column;
    align-items: start;
  }
</style>
