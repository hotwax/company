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

const sortByProperty = (array: any, property: any) => {
  return array.sort((a: any, b: any) => a[property].toLowerCase().localeCompare(b[property].toLowerCase()));
}

export { filterRecordsByDateField, generateInternalId, hasError, showToast, sortByProperty }
