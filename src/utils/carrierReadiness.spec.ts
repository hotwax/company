import { describe, expect, it } from "vitest";
import {
  ADDRESS_VALIDATION_CARRIERS,
  deriveAddressValidationReadiness,
  hasCompleteUnigateConfig,
} from "./carrierReadiness";

const completeTenant = {
  internalId: "tenant",
  sendUrl: "https://unigate.example/",
  publicKey: "secret",
};

describe("carrier readiness", () => {
  it("only advertises FedEx for automatic address validation", () => {
    expect(ADDRESS_VALIDATION_CARRIERS).toEqual([
      {
        carrierPartyId: "FEDEX",
        name: "FedEx",
        capabilities: ["Automatic address validation"],
      },
    ]);
  });

  it("requires every Unigate tenant field", () => {
    expect(hasCompleteUnigateConfig(completeTenant)).toBe(true);
    expect(hasCompleteUnigateConfig({ ...completeTenant, publicKey: "" })).toBe(false);
    expect(hasCompleteUnigateConfig(null)).toBe(false);
  });

  it("does not treat unavailable credential and store-link data as disconnected", () => {
    expect(deriveAddressValidationReadiness({
      unigateConfig: completeTenant,
      credentialStatus: "unavailable",
      storeLinkStatus: "unavailable",
    })).toEqual({
      tenant: "ready",
      credential: "unavailable",
      storeLink: "unavailable",
      addressValidation: "unavailable",
    });
  });

  it("reports ready only when tenant, credential, and store link are configured", () => {
    expect(deriveAddressValidationReadiness({
      unigateConfig: completeTenant,
      credentialStatus: "configured",
      storeLinkStatus: "configured",
    }).addressValidation).toBe("ready");
  });

  it("prioritizes an actionable missing prerequisite", () => {
    expect(deriveAddressValidationReadiness({
      unigateConfig: null,
      credentialStatus: "unavailable",
      storeLinkStatus: "unavailable",
    }).addressValidation).toBe("action-required");
  });
});
