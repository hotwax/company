export type ReadinessStatus = "ready" | "action-required" | "unavailable";

export type CarrierDataStatus = "configured" | "missing" | "unavailable";

export type AddressValidationReadiness = {
  tenant: ReadinessStatus;
  credential: ReadinessStatus;
  storeLink: ReadinessStatus;
  addressValidation: ReadinessStatus;
};

export const ADDRESS_VALIDATION_CARRIERS = [
  {
    carrierPartyId: "FEDEX",
    name: "FedEx",
    capabilities: ["Automatic address validation"],
  },
] as const;

export function hasCompleteUnigateConfig(config: any): boolean {
  return Boolean(
    String(config?.internalId || "").trim()
      && String(config?.sendUrl || "").trim()
  );
}

function dataStatusToReadiness(status: CarrierDataStatus): ReadinessStatus {
  if (status === "configured") return "ready";
  if (status === "missing") return "action-required";
  return "unavailable";
}

export function deriveAddressValidationReadiness({
  unigateConfig,
  credentialStatus,
  storeLinkStatus,
}: {
  unigateConfig: any;
  credentialStatus: CarrierDataStatus;
  storeLinkStatus: CarrierDataStatus;
}): AddressValidationReadiness {
  const tenant = hasCompleteUnigateConfig(unigateConfig) ? "ready" : "action-required";
  const credential = dataStatusToReadiness(credentialStatus);
  const storeLink = dataStatusToReadiness(storeLinkStatus);

  let addressValidation: ReadinessStatus = "ready";
  if ([tenant, credential, storeLink].includes("action-required")) {
    addressValidation = "action-required";
  } else if ([credential, storeLink].includes("unavailable")) {
    addressValidation = "unavailable";
  }

  return { tenant, credential, storeLink, addressValidation };
}
