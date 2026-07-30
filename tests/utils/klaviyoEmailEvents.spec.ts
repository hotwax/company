import { describe, expect, it } from "vitest";

import {
  KLAVIYO_SUPPORTED_EMAIL_TYPES,
  getKlaviyoEventsForStore,
} from "@/utils/klaviyoEmailEvents";

describe("getKlaviyoEventsForStore", () => {
  it("returns an empty array when productStoreId is not provided", () => {
    const result = getKlaviyoEventsForStore({});
    expect(result).toEqual([]);
  });

  it("returns an array mapping all supported email types with default values", () => {
    const result = getKlaviyoEventsForStore({ productStoreId: "STORE1" });
    expect(result).toHaveLength(KLAVIYO_SUPPORTED_EMAIL_TYPES.length);

    expect(result[0]).toEqual({
      emailType: KLAVIYO_SUPPORTED_EMAIL_TYPES[0].enumId,
      label: KLAVIYO_SUPPORTED_EMAIL_TYPES[0].fallbackLabel,
      enabled: false,
      ownedByThisGateway: false,
      gatewayAuthId: "",
      subject: "",
      setting: undefined,
    });
  });

  it("calculates enabled true when a setting exists for the given store and email type", () => {
    const result = getKlaviyoEventsForStore({
      productStoreId: "STORE1",
      allSettings: [
        { productStoreId: "STORE1", emailType: "READY_FOR_PICKUP" },
      ]
    });

    const readyForPickup = result.find(e => e.emailType === "READY_FOR_PICKUP");
    expect(readyForPickup?.enabled).toBe(true);
    expect(readyForPickup?.ownedByThisGateway).toBe(false); // gatewayAuthId doesn't match
  });

  it("calculates ownedByThisGateway true when enabled and gatewayAuthId matches", () => {
    const result = getKlaviyoEventsForStore({
      productStoreId: "STORE1",
      gatewayAuthId: "AUTH1",
      allSettings: [
        { productStoreId: "STORE1", emailType: "READY_FOR_PICKUP", gatewayAuthId: "AUTH1" },
      ]
    });

    const readyForPickup = result.find(e => e.emailType === "READY_FOR_PICKUP");
    expect(readyForPickup?.enabled).toBe(true);
    expect(readyForPickup?.ownedByThisGateway).toBe(true);
    expect(readyForPickup?.gatewayAuthId).toBe("AUTH1");
  });

  it("retrieves the correct label using injected emailTypes list", () => {
    const result = getKlaviyoEventsForStore({
      productStoreId: "STORE1",
      emailTypes: [
        { enumId: "READY_FOR_PICKUP", enumName: "Custom Name", description: "Custom Description" }
      ]
    });

    const readyForPickup = result.find(e => e.emailType === "READY_FOR_PICKUP");
    expect(readyForPickup?.label).toBe("Custom Name");
  });

  it("retrieves the correct label falling back to description if enumName is not provided", () => {
    const result = getKlaviyoEventsForStore({
      productStoreId: "STORE1",
      emailTypes: [
        { enumId: "READY_FOR_PICKUP", description: "Custom Description" }
      ]
    });

    const readyForPickup = result.find(e => e.emailType === "READY_FOR_PICKUP");
    expect(readyForPickup?.label).toBe("Custom Description");
  });

  it("resolves the subject from subjectDrafts if present", () => {
    const result = getKlaviyoEventsForStore({
      productStoreId: "STORE1",
      subjectDrafts: {
        "READY_FOR_PICKUP": "Draft Subject"
      },
      allSettings: [
        { productStoreId: "STORE1", emailType: "READY_FOR_PICKUP", subject: "Setting Subject" },
      ]
    });

    const readyForPickup = result.find(e => e.emailType === "READY_FOR_PICKUP");
    expect(readyForPickup?.subject).toBe("Draft Subject");
  });

  it("resolves the subject from settings if subjectDrafts is empty", () => {
    const result = getKlaviyoEventsForStore({
      productStoreId: "STORE1",
      allSettings: [
        { productStoreId: "STORE1", emailType: "READY_FOR_PICKUP", subject: "Setting Subject" },
      ]
    });

    const readyForPickup = result.find(e => e.emailType === "READY_FOR_PICKUP");
    expect(readyForPickup?.subject).toBe("Setting Subject");
  });

  it("maps the setting reference exactly as provided", () => {
    const setting = { productStoreId: "STORE1", emailType: "READY_FOR_PICKUP", subject: "Setting Subject" };
    const result = getKlaviyoEventsForStore({
      productStoreId: "STORE1",
      allSettings: [setting]
    });

    const readyForPickup = result.find(e => e.emailType === "READY_FOR_PICKUP");
    expect(readyForPickup?.setting).toBe(setting);
  });
});
