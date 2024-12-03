import { showToast, hasError } from '@/utils';
import emitter from "@/event-bus";
import logger from '@/logger';
import { NetSuiteService } from '@/services/NetSuiteService';
import { useStore } from "vuex";
import { alertController } from '@ionic/vue';
import { translate } from "@/i18n"

export function useNetSuiteComposables(integrationTypeId: any) {

  const store = useStore();
  
  // This function opens an alert dialog to edit the NetSuite ID, taking a mapping key and the current integration mapping as parameters.
  const editNetSuiteId = async (mappingKey: any, integrationMapping: any) => {
    const alert = await alertController.create({
      header: translate("Add NetSuite ID"),
      inputs: [{
        name: "netSuiteId",
        value: integrationMapping?.integrationMappingId ? integrationMapping.mappingValue : ""
      }],
      buttons: [
        {
          text: translate("Cancel"),
          role: "cancel"
        },
        {
          text: translate("Apply"),
          handler: async (data) => {
            const netSuiteId = data.netSuiteId.trim();
        
            if (!netSuiteId) {
              showToast(translate("Please enter a valid NetSuite ID"));
              return false;
            }

            if (integrationMapping?.mappingValue === netSuiteId) {
              showToast(translate("Please update the NetSuite ID"));
              return false;
            }

            const payload = {
              integrationTypeId: integrationTypeId,
              mappingKey: mappingKey,
              mappingValue: netSuiteId
            };

            if (integrationMapping?.integrationMappingId) {
              await updateNetSuiteId(payload, integrationMapping.integrationMappingId);
            } else {
              await addNetSuiteId(payload);
            }
          }
        }
      ]
    });
    await alert.present();
  };

  // This function adds a new NetSuite ID mapping, using a payload that contains the integration type ID, mapping key, and mapping value.
  const addNetSuiteId = async (payload: any) => {
    emitter.emit("presentLoader");
    let resp;

    try {
      resp = await NetSuiteService.addIntegrationTypeMappings(payload);
      if (!hasError(resp)) {
        showToast(translate("NetSuite Id updated successfully"));
        if(payload.integrationTypeId !== "NETSUITE_DISC_MTHD") {
          await store.dispatch("netSuite/fetchIntegrationTypeMappings", integrationTypeId);
        }
      } else {
        throw resp.data;
      }
    } catch (err) {
      logger.error(err);
    }
    emitter.emit('dismissLoader');
  };

  // This function updates an existing NetSuite ID mapping, taking a payload for the update and the integration mapping Id that needs to be updated.
  const updateNetSuiteId = async (payload: any, integrationMappingId: any) => {
    emitter.emit("presentLoader");
    let resp;

    try {
      resp = await NetSuiteService.updateIntegrationTypeMappings(payload, integrationMappingId);
      if (!hasError(resp)) {
        showToast(translate("NetSuite Id updated successfully"));
        if(payload.integrationTypeId !== "NETSUITE_DISC_MTHD") {
          await store.dispatch("netSuite/fetchIntegrationTypeMappings", integrationTypeId);
        }
      } else {
        throw resp.data;
      }
    } catch (err) {
      logger.error(err);
    }
    emitter.emit('dismissLoader');
  };

  // This function removes a NetSuite ID mapping based on its integration mapping Id, which is passed as a parameter.
  const removeNetSuiteId = async (integrationMappingId: any) => {
    emitter.emit('presentLoader');
    let resp;

    try {
      resp = await NetSuiteService.removeIntegrationMappingValue(integrationMappingId);
      console.log(resp, integrationMappingId);
      if (!hasError(resp)) {
        showToast(translate("NetSuite Id removed successfully"));
        await store.dispatch("netSuite/fetchIntegrationTypeMappings", integrationTypeId);
      } else {
        throw resp.data;
      }
    } catch (err) {
      logger.error(err);
    }
    emitter.emit('dismissLoader');
  };

  return {
    editNetSuiteId,
    addNetSuiteId,
    updateNetSuiteId,
    removeNetSuiteId
  };
}