import { toastController } from "@ionic/vue";

// TODO Use separate files for specific utilities

// TODO Remove it when HC APIs are fully REST compliant
const hasError = (response: any) => {
  return !!response.data._ERROR_MESSAGE_ || !!response.data._ERROR_MESSAGE_LIST_;
}

const showToast = async (message: string) => {
  const toast = await toastController
    .create({
      message,
      duration: 3000,
      position: "top",
    })
  return toast.present();
}

const generateInternalId = (name: string) => {
  return name.trim().toUpperCase().split(' ').join('_');
}

const filterRecordsByDateField = (data: any[], fieldName: string) => {
  return data.filter((item: any) => !item[fieldName] || item[fieldName] > Date.now());
}

const sortByProperty = (data: any, property: string) => {
  return data.sort((a: any, b: any) => {
    const aValue = a[property] ? a[property].toLowerCase() : '';
    const bValue = b[property] ? b[property].toLowerCase() : '';
    // Use localeCompare to sort the values
    return aValue.localeCompare(bValue);
  });
}

// Deduplicates shipment methods by 'shipmentMethodTypeId', keeping the last entry for each type.
// Converts the deduplicated values from a Map into an array using Array.from().
const deduplicateByField = (data: any[], fieldName: string) => {
  return Array.from(new Map(data.map(item => [item[fieldName], item])).values());
};

export { deduplicateByField, filterRecordsByDateField, generateInternalId, hasError, showToast, sortByProperty }
