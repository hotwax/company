<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button default-href="/users" slot="start"></ion-back-button>
        <ion-title>{{ translate("Create user") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main>
        <h1 class="ion-margin-start">{{ translate('Create a new user') }}</h1>
        <ion-item>
          <ion-icon slot="start" :icon="desktopOutline"/>
          <ion-toggle :checked="isFacilityLogin" @ionChange="updateFacilityLogin" label-placement="start" justify="space-between">{{ translate("Facility login") }}</ion-toggle>
        </ion-item>
        <template v-if="isFacilityLogin">
          <ion-item>
            <ion-icon slot="start" :icon="businessOutline"/>
            <ion-select interface="popover" v-model="formData.facilityId" @ionChange="updateGroupName">
              <div slot="label">{{ translate("Select facility") }} <ion-text color="danger">*</ion-text></div>
              <ion-select-option v-for="facility in (facilities ? facilities : [])" :key="facility.facilityId" :value="facility.facilityId">{{ facility.facilityName || facility.facilityId }}</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input label-placement="floating" v-model="formData.groupName">
              <div slot="label">{{ translate('Name') }} <ion-text color="danger">*</ion-text></div>
            </ion-input>
          </ion-item>
          <ion-item>
            <ion-input :label="translate('Reset password email')" label-placement="floating" v-model="formData.emailAddress" type="email"></ion-input>
          </ion-item>
          <ion-item>
            <ion-input :label="translate('Facility contact number')" label-placement="floating" v-model="formData.contactNumber" type="tel"></ion-input>
          </ion-item>
        </template>
        <template v-else>
          <ion-item>
            <ion-input label-placement="floating" v-model="formData.firstName" autofocus>
              <div slot="label">{{ translate('First name') }} <ion-text color="danger">*</ion-text></div>
            </ion-input>
          </ion-item>
          <ion-item>
            <ion-input label-placement="floating" v-model="formData.lastName">
              <div slot="label">{{ translate('Last name') }} <ion-text color="danger">*</ion-text></div>
            </ion-input>
          </ion-item>

          <ion-item class="ion-margin-top">
            <ion-input :label="translate('Employee ID')" label-placement="floating" v-model="formData.externalId"></ion-input>
          </ion-item>
          <ion-item>
            <ion-input :label="translate('Email')" label-placement="floating" v-model="formData.emailAddress" type="email"></ion-input>
          </ion-item>
          <ion-item>
            <ion-input :label="translate('Phone number')" label-placement="floating" v-model="formData.contactNumber" type="tel"></ion-input>
          </ion-item>
        </template>
        <ion-button class="ion-margin-top" @click="createUser()">
          {{ translate("Create User") }}
          <ion-icon slot="end" :icon="arrowForwardOutline"/>
        </ion-button>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IonBackButton, IonButton, IonContent, IonHeader, IonIcon, IonItem, IonPage, IonText, IonTitle, IonToolbar, IonToggle, IonInput, IonSelect, IonSelectOption, onIonViewWillEnter } from "@ionic/vue";
import router from "@/router";
import { useFacilities } from "@/composables/useFacilities";
import { useUserStore } from "@/store/user";
import { businessOutline, desktopOutline, arrowForwardOutline } from "ionicons/icons";
import { commonUtil, translate, logger } from "@common";

const userStore = useUserStore();

const isFacilityLogin = ref(false);
const formData = ref({
  firstName: "",
  lastName: "",
  groupName: "",
  facilityId: "",
  externalId: "",
  emailAddress: "",
  contactNumber: "",
});

// Cached, reactive — the select fills as the facility table hydrates, no fetch needed. The old
// store fetch excluded virtual (parking) facilities server-side; `excludeVirtual` keeps that rule.
const { facilities } = useFacilities({ excludeVirtual: true });

onIonViewWillEnter(() => {
  clearFormData();
});

const clearFormData = () => {
  formData.value = {
    firstName: "",
    lastName: "",
    groupName: "",
    facilityId: "",
    externalId: "",
    emailAddress: "",
    contactNumber: "",
  };
};

const updateFacilityLogin = (event: CustomEvent) => {
  clearFormData();
  isFacilityLogin.value = event.detail.checked;
};

const updateGroupName = (event: CustomEvent) => {
  const selectedFacilityId = event.detail.value;
  const selectedFacility = facilities.value.find((facility: any) => facility.facilityId === selectedFacilityId);
  formData.value.groupName = selectedFacility?.facilityName ? selectedFacility?.facilityName : selectedFacilityId;
};

const validateCreateUserDetail = (data: any) => {
  const validationErrors = [];
  if(data.partyTypeId === "PARTY_GROUP") {
    if(!data.groupName) {
      validationErrors.push(translate("Name is required."));
    }
    if(isFacilityLogin.value && !data.facilityId) {
      validationErrors.push(translate("Facility is required."));
    }
  } else {
    if(!data.firstName) {
      validationErrors.push(translate("First name is required."));
    }
    if(!data.lastName) {
      validationErrors.push(translate("Last name is required."));
    }
  }
  if(data.emailAddress && !commonUtil.isValidEmail(data.emailAddress)) {
    validationErrors.push(translate("Invalid email address."));
  }
  return validationErrors;
};

const createUser = async () => {
  const partyTypeId = isFacilityLogin.value ? "PARTY_GROUP" : "PERSON";

  try {
    const validationErrors = validateCreateUserDetail({ ...formData.value, partyTypeId });
    if(validationErrors.length > 0) {
      const errorMessages = validationErrors.join(" ");
      logger.error(errorMessages);
      commonUtil.showToast(translate(errorMessages));
      return;
    }

    const payload: any = {
      partyTypeId,
      createdByUserLogin: userStore.current.username
    };
    if(partyTypeId === "PARTY_GROUP") {
      payload.partyGroup = { groupName: formData.value.groupName };
    } else {
      payload.person = { firstName: formData.value.firstName, lastName: formData.value.lastName };
    }
    if(formData.value.externalId) {
      payload.externalId = formData.value.externalId;
    }

    const resp = await userStore.createUser(payload);
    if(resp.status === 200 && !commonUtil.hasError(resp) && resp.data.partyId) {
      const partyId = resp.data.partyId;

      await userStore.ensurePartyRole({ partyId, roleTypeId: "APPLICATION_USER" });

      if(partyTypeId === "PARTY_GROUP") {
        await userStore.addPartyToFacility({ partyId, facilityId: formData.value.facilityId, roleTypeId: "WAREHOUSE_PICKER" });
      }
      if(formData.value.emailAddress) {
        await userStore.createUpdatePartyEmailAddress({ partyId, emailAddress: formData.value.emailAddress, contactMechPurposeTypeId: "PRIMARY_EMAIL" });
      }
      if(formData.value.contactNumber) {
        await userStore.createUpdatePartyTelecomNumber({ partyId, contactNumber: formData.value.contactNumber, contactMechPurposeTypeId: "PRIMARY_PHONE" });
      }

      await userStore.indexEmployee(partyId);

      commonUtil.showToast(translate("User created successfully"));
      router.replace({ path: `/user-confirmation/${partyId}` });
    } else {
      throw resp.data;
    }
  } catch (err: any) {
    let errorMessage = translate("Failed to create user.");
    if(err?.response?.data?.error?.message) {
      errorMessage = err.response.data.error.message;
    }
    logger.error("error", err);
    commonUtil.showToast(errorMessage);
  }
};
</script>

<style scoped>
  @media (min-width: 700px) {
    main {
      max-width: 375px;
      margin: auto;
    }
  }
</style>
