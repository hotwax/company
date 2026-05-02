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


const getDownloadFileContent = (data: any) => {
  const fileContent = data?.csvData ?? data?.fileData ?? data?.data ?? data;
  if (typeof fileContent === "string") return fileContent;
  if (fileContent === undefined || fileContent === null) return "";
  return JSON.stringify(fileContent, null, 2);
}

const downloadTextFile = (content: string, fileName: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export { generateInternalId, hasError, showToast ,getCurrentTime, getDownloadFileContent, downloadTextFile}
