import { toastController } from "@ionic/vue";
import { DateTime } from "luxon";

// TODO Use separate files for specific utilities

// TODO Remove it when HC APIs are fully REST compliant
const hasError = (response: any) => {
  return !!response.data._ERROR_MESSAGE_ || !!response.data._ERROR_MESSAGE_LIST_;
}
const getCurrentTime = (zone: string, format = 't ZZZZ') => {
  return DateTime.now().setZone(zone).toFormat(format)
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

export { generateInternalId, hasError, showToast ,getCurrentTime}
