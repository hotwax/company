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
    it("stores the instance base URL without a trailing slash", () => {
      expect(normalizeUnigateSendUrl(" https://example.com/ ")).toBe("https://example.com");
      expect(normalizeUnigateSendUrl("https://example.com:8443/")).toBe("https://example.com:8443");
    });

    it("rejects API paths and other extra URL components rather than repairing them", () => {
      for(const url of ["https://example.com/rest/s1/unigate", "https://example.com/rest/s1/unigate/", "https://example.com/apps/Unigate", "https://example.com/context", "https://example.com?mode=test", "https://example.com#test", "https://user:password@example.com", "http://example.com", "https://example.com:0"]) {
        expect(normalizeUnigateSendUrl(url)).toBe("");
      }
    });

    it("rejects invalid URLs", () => {
      expect(normalizeUnigateSendUrl("invalid-url")).toBe("");
      expect(normalizeUnigateSendUrl("invalid-url/")).toBe("");
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
        .toBe("https://unigate.hotwax.io");
      expect(getDefaultUnigateSendUrl({ instanceInfo: { instancePurpose: "production" } }))
        .toBe("https://unigate.hotwax.io");

      expect(getDefaultUnigateSendUrl({ instanceInfo: { instancePurpose: "uat" } }))
        .toBe("https://unigate-uat.hotwax.io");

      expect(getDefaultUnigateSendUrl({ instanceInfo: { instancePurpose: "dev" } }))
        .toBe("https://unigate-uat.hotwax.io");
      expect(getDefaultUnigateSendUrl({ instanceInfo: { instancePurpose: "development" } }))
        .toBe("https://unigate-uat.hotwax.io");
    });

    it("should return empty string for unknown environments", () => {
      expect(getDefaultUnigateSendUrl({ instanceInfo: { instancePurpose: "staging" } })).toBe("");
      expect(getDefaultUnigateSendUrl({})).toBe("");
    });
  });

  describe("getPreferredUnigateSendUrl", () => {
    it("does not replace an invalid existing URL with a different environment", () => {
      expect(getPreferredUnigateSendUrl("https://custom.example.com/apps/Unigate", { instanceInfo: { instancePurpose: "prod" } })).toBe("");
    });
    it("should prefer existing URL if provided", () => {
      expect(getPreferredUnigateSendUrl("https://custom.example.com/", { instanceInfo: { instancePurpose: "prod" } }))
        .toBe("https://custom.example.com");
    });

    it("should fallback to default URL if existing is empty", () => {
      expect(getPreferredUnigateSendUrl("", { instanceInfo: { instancePurpose: "prod" } }))
        .toBe("https://unigate.hotwax.io");
      expect(getPreferredUnigateSendUrl("  ", { instanceInfo: { instancePurpose: "prod" } }))
        .toBe("https://unigate.hotwax.io");
    });
  });

  describe("getUnigateSendUrlWarning", () => {
    it("should return empty string if no configured URL is provided", () => {
      expect(getUnigateSendUrlWarning("", { instanceInfo: { instancePurpose: "prod" } })).toBe("");
    });

    it("should return empty string if environments match exactly", () => {
      expect(getUnigateSendUrlWarning("https://unigate.hotwax.io", { instanceInfo: { instancePurpose: "prod" } }))
        .toBe("");
      expect(getUnigateSendUrlWarning("https://unigate-uat.hotwax.io", { instanceInfo: { instancePurpose: "uat" } }))
        .toBe("");
    });

    it("should return empty string for dev instance using default UAT unigate URL", () => {
      const devInfo = { instanceInfo: { instancePurpose: "dev" } };
      const defaultUrl = getDefaultUnigateSendUrl(devInfo);
      expect(getUnigateSendUrlWarning(defaultUrl, devInfo)).toBe("");
    });

    it("should warn on reverse-lookup environment mismatch (e.g. prod URL on dev instance)", () => {
      expect(getUnigateSendUrlWarning("https://unigate.hotwax.io", { instanceInfo: { instancePurpose: "dev" } }))
        .toBe("This is the production Unigate URL configured on a dev OMS instance. Klaviyo calls will be proxied to the wrong environment.");

      expect(getUnigateSendUrlWarning("https://unigate-uat.hotwax.io", { instanceInfo: { instancePurpose: "prod" } }))
        .toBe("This is the UAT Unigate URL configured on a production OMS instance. Klaviyo calls will be proxied to the wrong environment.");
    });

    it("should warn on unknown URL fallback mismatch", () => {
      expect(getUnigateSendUrlWarning("https://unknown.example.com/", { instanceInfo: { instancePurpose: "prod" } }))
        .toBe("production OMS instances are expected to use https://unigate.hotwax.io. This tenant is currently using https://unknown.example.com.");
    });

    it("should return empty string if instance purpose is unknown and url is unknown", () => {
      expect(getUnigateSendUrlWarning("https://unknown.example.com/", { instanceInfo: { instancePurpose: "staging" } })).toBe("");
    });
  });
});
