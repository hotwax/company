import type { ProductStoreEmailSetting } from "@/services/KlaviyoService";

export const KLAVIYO_SUPPORTED_EMAIL_TYPES: { enumId: string; fallbackLabel: string }[] = [
  { enumId: "READY_FOR_PICKUP", fallbackLabel: "BOPIS Order Ready for Pickup" },
  { enumId: "REJECT_BOPIS_ORDER", fallbackLabel: "BOPIS Order Rejection" },
  { enumId: "CANCEL_BOPIS_ORDER", fallbackLabel: "BOPIS Order Cancellation" },
  { enumId: "HANDOVER_BOPIS_ORDER", fallbackLabel: "BOPIS Order Handover/Completion" },
  { enumId: "CREATE_KLAVIYO_EVENT", fallbackLabel: "Create Klaviyo Event" },
];

type ProductStore = {
  productStoreId?: string;
  storeName?: string;
};

type EmailType = {
  enumId?: string;
  enumName?: string;
  description?: string;
};

type KlaviyoEmailEventState = {
  emailType: string;
  label: string;
  enabled: boolean;
  ownedByThisGateway: boolean;
  gatewayAuthId: string;
  subject: string;
  setting?: ProductStoreEmailSetting;
};

export function getDefaultKlaviyoProductStoreId(
  productStores: ProductStore[] = [],
  selectedStoreId = "",
  preferredStoreId = ""
) {
  const availableStoreIds = productStores
    .map((store) => store?.productStoreId)
    .filter((storeId): storeId is string => !!storeId);

  if (selectedStoreId && availableStoreIds.includes(selectedStoreId)) {
    return selectedStoreId;
  }

  if (preferredStoreId && availableStoreIds.includes(preferredStoreId)) {
    return preferredStoreId;
  }

  return availableStoreIds[0] || "";
}

export function getKlaviyoEventLabel(emailTypes: EmailType[] = [], emailType: string) {
  const enumRow = emailTypes.find((item) => item?.enumId === emailType);
  if (enumRow?.enumName || enumRow?.description) {
    return enumRow.enumName || enumRow.description || emailType;
  }

  const fallback = KLAVIYO_SUPPORTED_EMAIL_TYPES.find((supported) => supported.enumId === emailType);
  return fallback?.fallbackLabel || emailType;
}

export function getKlaviyoEventsForStore({
  productStoreId,
  emailTypes = [],
  allSettings = [],
  gatewayAuthId = "",
  subjectDrafts = {},
}: {
  productStoreId?: string;
  emailTypes?: EmailType[];
  allSettings?: ProductStoreEmailSetting[];
  gatewayAuthId?: string;
  subjectDrafts?: Record<string, string>;
}): KlaviyoEmailEventState[] {
  if (!productStoreId) return [];

  return KLAVIYO_SUPPORTED_EMAIL_TYPES.map((supported) => {
    const setting = allSettings.find(
      (item) => item.productStoreId === productStoreId && item.emailType === supported.enumId
    );
    const enabled = !!setting;
    const ownedByThisGateway = enabled && setting?.gatewayAuthId === gatewayAuthId;

    return {
      emailType: supported.enumId,
      label: getKlaviyoEventLabel(emailTypes, supported.enumId),
      enabled,
      ownedByThisGateway,
      gatewayAuthId: setting?.gatewayAuthId || "",
      subject: subjectDrafts[supported.enumId] ?? setting?.subject ?? "",
      setting,
    };
  });
}
