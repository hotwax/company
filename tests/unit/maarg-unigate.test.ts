import assert from "assert";
import {
  getDefaultUnigateSendUrl,
  getPreferredUnigateSendUrl,
  getUnigateSendUrlWarning,
  normalizeUnigateSendUrl,
} from "../../src/utils/maarg";

describe("maarg unigate defaults", () => {
  test("maps prod instances to the production unigate url", () => {
    assert.equal(
      getDefaultUnigateSendUrl({
        instanceInfo: { instancePurpose: "prod" }
      }),
      "https://unigate.hotwax.io/rest/s1/unigate/"
    );
  });

  test("maps uat instances to the uat unigate url", () => {
    assert.equal(
      getDefaultUnigateSendUrl({
        instanceInfo: { instancePurpose: "UAT" }
      }),
      "https://unigate-uat.hotwax.io/rest/s1/unigate/"
    );
  });

  test("keeps an existing send url instead of overwriting it from maarg", () => {
    assert.equal(
      getPreferredUnigateSendUrl(
        "https://custom-unigate.hotwax.io/rest/s1/unigate/",
        { instanceInfo: { instancePurpose: "prod" } }
      ),
      "https://custom-unigate.hotwax.io/rest/s1/unigate/"
    );
  });

  test("maps dev instances to the uat unigate url", () => {
    assert.equal(
      getDefaultUnigateSendUrl({
        instanceInfo: { instancePurpose: "dev" }
      }),
      "https://unigate-uat.hotwax.io/rest/s1/unigate/"
    );
  });

  test("normalizes unigate send urls without requiring a trailing slash", () => {
    assert.equal(
      normalizeUnigateSendUrl("https://unigate.hotwax.io/rest/s1/unigate"),
      "https://unigate.hotwax.io/rest/s1/unigate/"
    );
  });

  test("warns when a production instance is pointed at the uat unigate url", () => {
    assert.equal(
      getUnigateSendUrlWarning(
        "https://unigate-uat.hotwax.io/rest/s1/unigate/",
        { instanceInfo: { instancePurpose: "prod" } }
      ),
      "This is the UAT Unigate URL configured on a production OMS instance. Klaviyo calls will be proxied to the wrong environment."
    );
  });

  test("warns when a uat instance is pointed at the production unigate url", () => {
    assert.equal(
      getUnigateSendUrlWarning(
        "https://unigate.hotwax.io/rest/s1/unigate/",
        { instanceInfo: { instancePurpose: "uat" } }
      ),
      "This is the production Unigate URL configured on a UAT OMS instance. Klaviyo calls will be proxied to the wrong environment."
    );
  });

  test("does not warn when the configured url matches the expected instance url", () => {
    assert.equal(
      getUnigateSendUrlWarning(
        "https://unigate.hotwax.io/rest/s1/unigate/",
        { instanceInfo: { instancePurpose: "production" } }
      ),
      ""
    );
  });
});
