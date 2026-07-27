<template>
  <ion-content>
    <ion-list>
      <ion-list-header>{{ translate(placeholder) }}</ion-list-header>
      <ion-item button @click="copyInfo()">
        {{ translate("Copy") }}
      </ion-item>
      <ion-item button :disabled="!userStore.hasPermission('PARTYMGR_PCM_UPDATE OR PARTYMGR_UPDATE OR PARTYMGR_ADMIN')" @click="updateContactField()">
        {{ translate("Edit") }}
      </ion-item>
      <ion-item button lines="none" :disabled="!userStore.hasPermission('PARTYMGR_PCM_DELETE OR PARTYMGR_ADMIN')" @click="deleteContactField()">
        {{ translate("Remove") }}
      </ion-item>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonContent, IonItem, IonList, IonListHeader, alertController, popoverController } from "@ionic/vue";
import { commonUtil, logger, translate } from "@common";
import { useUserStore } from "@/store/user";

const props = defineProps<{
  type: string;
  placeholder: string;
  value: string;
  contactMechId?: string;
}>();

const userStore = useUserStore();

const selectedUser = computed(() => userStore.getSelectedUser);

const OPTIONS = {
  email: {
    removeHeader: "Remove email",
    editHeader: "Edit email",
    placeholder: "Email"
  },
  phoneNumber: {
    removeHeader: "Remove phone number",
    editHeader: "Edit phone number",
    placeholder: "Phone number"
  },
  externalId: {
    removeHeader: "Remove external ID",
    editHeader: "Edit external ID",
    placeholder: "External ID"
  }
} as any;

const closePopover = () => {
  popoverController.dismiss();
};

const copyInfo = () => {
  commonUtil.copyToClipboard(props.value, "Copied to clipboard");
  closePopover();
};

const updateContactField = async () => {
  const contactUpdateAlert = await alertController.create({
    header: translate(OPTIONS[props.type].editHeader),
    inputs:  [{
      // TODO add validation for phone
      name: "input",
      placeholder: translate(OPTIONS[props.type].placeholder),
      value: props.value
    }],
    buttons: [{
      text: translate("Cancel"),
      role: "cancel"
    },
    {
      text: translate("Save"),
      handler: async (result) => {
        const input = result.input.trim();
        // if initial and new value are same, return
        if(!input || input === props.value) {
          if(!input) {
            commonUtil.showToast(translate("Please enter a value"));

            return false;
          }

          return true;
        }

        let updatedSelectedUser = JSON.parse(JSON.stringify(selectedUser.value));
        try {
          if(props.type === "email") {
            if(!commonUtil.isValidEmail(input)) {
              commonUtil.showToast(translate("Invalid email address."));

              return false;
            }

            const resp = await userStore.createUpdatePartyEmailAddress({
              contactMechId: props.contactMechId,
              emailAddress: input,
              partyId: selectedUser.value.partyId,
              contactMechPurposeTypeId: "PRIMARY_EMAIL"
            });
            if(commonUtil.hasError(resp)) {throw resp.data;}
            updatedSelectedUser = {
              ...updatedSelectedUser,
              emailDetails: {
                email: input,
                contactMechId: resp.data.contactMechId
              }
            };
          } else if(props.type === "phoneNumber") {
            const resp = await userStore.createUpdatePartyTelecomNumber({
              contactMechId: props.contactMechId,
              contactNumber: input,
              partyId: selectedUser.value.partyId,
              contactMechPurposeTypeId: "PRIMARY_PHONE"
            });
            if(commonUtil.hasError(resp)) {throw resp.data;}
            updatedSelectedUser = {
              ...updatedSelectedUser,
              phoneNumberDetails: {
                contactNumber: input,
                contactMechId: resp.data.contactMechId
              }
            };
          } else {
            const resp = await userStore.updatePartyExternalId({
              externalId: input,
              partyId: selectedUser.value.partyId
            });
            if(commonUtil.hasError(resp)) {throw resp.data;}
            updatedSelectedUser = {
              ...updatedSelectedUser,
              externalId: input
            };
          }
          userStore.updateSelectedUser(updatedSelectedUser);
          if(props.type === "email" || props.type === "phoneNumber") {
            await userStore.indexEmployee(selectedUser.value.partyId);
          }
          commonUtil.showToast(translate(`${OPTIONS[props.type].placeholder} updated successfully.`));
        } catch (error) {
          commonUtil.showToast(translate(`Failed to update ${props.type === "email" ? "email" : (props.type === "phoneNumber" ? "phone number" : "external ID")}.`));
          logger.error(error);
        }

        return true;
      }
    }]
  });
  await contactUpdateAlert.present();
  closePopover();
};

const deleteContactField = async () => {
  const message = `Are you sure you want to remove the ${props.type === "email" ? "email" : (props.type === "phoneNumber" ? "phone number" : "external ID")}.?`;

  const contactUpdateAlert = await alertController.create({
    header: translate(OPTIONS[props.type].removeHeader),
    message: translate(message),
    buttons: [{
      text: translate("No"),
      role: "cancel"
    },
    {
      text: translate("Yes"),
      handler: async () => {
        const updatedSelectedUser = JSON.parse(JSON.stringify(selectedUser.value));
        try {
          if(props.type === "email") {
            // `contactMechId` is an optional prop; deleting without one would post `undefined`.
            if (!props.contactMechId) throw new Error("Missing contactMechId for delete");
            const resp = await userStore.deletePartyContactMech({
              contactMechId: props.contactMechId,
              partyId: selectedUser.value.partyId
            });
            if(commonUtil.hasError(resp)) {throw resp.data;}
            delete updatedSelectedUser.emailDetails;
          } else if(props.type === "phoneNumber") {
            // `contactMechId` is an optional prop; deleting without one would post `undefined`.
            if (!props.contactMechId) throw new Error("Missing contactMechId for delete");
            const resp = await userStore.deletePartyContactMech({
              contactMechId: props.contactMechId,
              partyId: selectedUser.value.partyId
            });
            if(commonUtil.hasError(resp)) {throw resp.data;}
            delete updatedSelectedUser.phoneNumberDetails;
          } else {
            const resp = await userStore.updatePartyExternalId({
              externalId: "",
              partyId: selectedUser.value.partyId
            });
            if(commonUtil.hasError(resp)) {throw resp.data;}
            delete updatedSelectedUser.externalId;
          }
          userStore.updateSelectedUser(updatedSelectedUser);
          if(props.type === "email" || props.type === "phoneNumber") {
            await userStore.indexEmployee(selectedUser.value.partyId);
          }
          commonUtil.showToast(translate(`${OPTIONS[props.type].placeholder} removed successfully.`));
        } catch (error) {
          commonUtil.showToast(translate(`Failed to remove ${props.type === "email" ? "email" : (props.type === "phoneNumber" ? "phone number" : "external ID")}.`));
          logger.error(error);
        }
      }
    }]
  });
  await contactUpdateAlert.present();
  closePopover();
};
</script>
