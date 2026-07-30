import { describe, it, expect } from "vitest";
import {
  getMaargInstancePurpose,
  normalizeUnigateSendUrl,
  getDefaultUnigateSendUrl,
  getPreferredUnigateSendUrl,
  getUnigateSendUrlWarning
} from "@/utils/maarg";

describe("maarg utils", () => {
  describe("getMaargInstancePurpose", () => {
    it("should return instance purpose correctly", () => {
      expect(getMaargInstancePurpose({ instanceInfo: { instancePurpose: " PROD " } })).toBe("prod");
      expect(getMaargInstancePurpose({ instanceInfo: { instancePurpose: "Development" } })).toBe("development");
    });

    it("should handle empty or undefined inputs", () => {
      expect(getMaargInstancePurpose(undefined)).toBe("");
      expect(getMaargInstancePurpose(null)).toBe("");
      expect(getMaargInstancePurpose({})).toBe("");
      expect(getMaargInstancePurpose({ instanceInfo: {} })).toBe("");
    });
  });

  describe("normalizeUnigateSendUrl", () => {
    it("should append trailing slash and normalize valid URLs", () => {
      expect(normalizeUnigateSendUrl("https://example.com/api")).toBe("https://example.com/api/");
      expect(normalizeUnigateSendUrl("https://example.com/api/")).toBe("https://example.com/api/");
    });

    it("should fallback to string operations for invalid URLs", () => {
      expect(normalizeUnigateSendUrl("invalid-url")).toBe("invalid-url/");
      expect(normalizeUnigateSendUrl("invalid-url/")).toBe("invalid-url/");
    });

    it("should handle empty strings", () => {
      expect(normalizeUnigateSendUrl("")).toBe("");
      expect(normalizeUnigateSendUrl("   ")).toBe("");
      expect(normalizeUnigateSendUrl(undefined as any)).toBe("");
    });
  });

  describe("getDefaultUnigateSendUrl", () => {
    it("should map known environments correctly", () => {
      expect(getDefaultUnigateSendUrl({ instanceInfo: { instancePurpose: "prod" } }))
        .toBe("https://unigate.hotwax.io/rest/s1/unigate/");
      expect(getDefaultUnigateSendUrl({ instanceInfo: { instancePurpose: "production" } }))
        .toBe("https://unigate.hotwax.io/rest/s1/unigate/");

      expect(getDefaultUnigateSendUrl({ instanceInfo: { instancePurpose: "uat" } }))
        .toBe("https://unigate-uat.hotwax.io/rest/s1/unigate/");

      expect(getDefaultUnigateSendUrl({ instanceInfo: { instancePurpose: "dev" } }))
        .toBe("https://unigate-uat.hotwax.io/rest/s1/unigate/");
      expect(getDefaultUnigateSendUrl({ instanceInfo: { instancePurpose: "development" } }))
        .toBe("https://unigate-uat.hotwax.io/rest/s1/unigate/");
    });

    it("should return empty string for unknown environments", () => {
      expect(getDefaultUnigateSendUrl({ instanceInfo: { instancePurpose: "staging" } })).toBe("");
      expect(getDefaultUnigateSendUrl({})).toBe("");
    });
  });

  describe("getPreferredUnigateSendUrl", () => {
    it("should prefer existing URL if provided", () => {
      expect(getPreferredUnigateSendUrl("https://custom.example.com/", { instanceInfo: { instancePurpose: "prod" } }))
        .toBe("https://custom.example.com/");
    });

    it("should fallback to default URL if existing is empty", () => {
      expect(getPreferredUnigateSendUrl("", { instanceInfo: { instancePurpose: "prod" } }))
        .toBe("https://unigate.hotwax.io/rest/s1/unigate/");
      expect(getPreferredUnigateSendUrl("  ", { instanceInfo: { instancePurpose: "prod" } }))
        .toBe("https://unigate.hotwax.io/rest/s1/unigate/");
    });
  });

  describe("getUnigateSendUrlWarning", () => {
    it("should return empty string if no configured URL is provided", () => {
      expect(getUnigateSendUrlWarning("", { instanceInfo: { instancePurpose: "prod" } })).toBe("");
    });

    it("should return empty string if environments match exactly", () => {
      expect(getUnigateSendUrlWarning("https://unigate.hotwax.io/rest/s1/unigate/", { instanceInfo: { instancePurpose: "prod" } }))
        .toBe("");
      expect(getUnigateSendUrlWarning("https://unigate-uat.hotwax.io/rest/s1/unigate/", { instanceInfo: { instancePurpose: "uat" } }))
        .toBe("");
    });

    it("should warn on reverse-lookup environment mismatch (e.g. prod URL on dev instance)", () => {
      expect(getUnigateSendUrlWarning("https://unigate.hotwax.io/rest/s1/unigate/", { instanceInfo: { instancePurpose: "dev" } }))
        .toBe("This is the production Unigate URL configured on a dev OMS instance. Klaviyo calls will be proxied to the wrong environment.");

      expect(getUnigateSendUrlWarning("https://unigate-uat.hotwax.io/rest/s1/unigate/", { instanceInfo: { instancePurpose: "prod" } }))
        .toBe("This is the UAT Unigate URL configured on a production OMS instance. Klaviyo calls will be proxied to the wrong environment.");
    });

    it("should warn on unknown URL fallback mismatch", () => {
      expect(getUnigateSendUrlWarning("https://unknown.example.com/", { instanceInfo: { instancePurpose: "prod" } }))
        .toBe("production OMS instances are expected to use https://unigate.hotwax.io/rest/s1/unigate/. This tenant is currently using https://unknown.example.com/.");
    });

    it("should return empty string if instance purpose is unknown and url is unknown", () => {
      expect(getUnigateSendUrlWarning("https://unknown.example.com/", { instanceInfo: { instancePurpose: "staging" } })).toBe("");
    });
  });
});
