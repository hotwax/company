import { describe, expect, it } from "vitest";
import { carrierSetupSteps, fedexCredentialPayload, fedexMethodsForOrigin, positiveDeliveryDays } from "@/utils/carrierSetup";

describe("carrier setup decisions", () => {
  it("asks usage once and places facility setup before stores and incoming mappings", () => {
    const steps = carrierSetupSteps("labels");
    expect(steps.filter(step => step === "usage")).toHaveLength(1);
    expect(steps.indexOf("facilities")).toBeLessThan(steps.indexOf("stores"));
    expect(steps.indexOf("stores")).toBeLessThan(steps.indexOf("mappings"));
  });
  it("external fulfillment skips credentials, rate strategy, and facility accounts", () => {
    expect(carrierSetupSteps("external")).toEqual(["usage", "methods", "stores", "mappings", "review"]);
  });
  it("keeps test and production endpoints distinct and maps FedEx keys to the actual adapter fields", () => {
    const test = fedexCredentialPayload("id", "test", " Test ", " key ", " secret ");
    expect(test).toMatchObject({ baseUrl: "https://apis-sandbox.fedex.com", username: "key", publicKey: "secret", description: "Test", shippingGatewayConfigId: "FEDEX" });
    expect(test).not.toHaveProperty("password");
    expect(fedexCredentialPayload("id", "live", "Live", "key", "secret").baseUrl).toBe("https://apis.fedex.com");
  });
  it("does not import US-only presets for Canada or invent Ground delivery days", () => {
    expect(fedexMethodsForOrigin("CA").some(row => row.carrierServiceCode === "GROUND_HOME_DELIVERY")).toBe(false);
    expect(fedexMethodsForOrigin("US").find(row => row.carrierServiceCode === "FEDEX_GROUND")?.deliveryDays).toBeUndefined();
  });
  it.each([undefined, null, "", 0, -1, "0", 1.5, "invalid"])("rejects an invalid delivery target: %s", value => {
    expect(positiveDeliveryDays(value)).toBe(false);
  });
});
