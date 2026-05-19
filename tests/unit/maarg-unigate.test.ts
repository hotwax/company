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

  test("leaves unknown instance types without a default url", () => {
    assert.equal(
      getDefaultUnigateSendUrl({
        instanceInfo: { instancePurpose: "dev" }
      }),
      ""
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
      "production OMS instances are expected to use https://unigate.hotwax.io/rest/s1/unigate/. This tenant is currently using https://unigate-uat.hotwax.io/rest/s1/unigate/."
    );
  });

  test("warns when a uat instance is pointed at the production unigate url", () => {
    assert.equal(
      getUnigateSendUrlWarning(
        "https://unigate.hotwax.io/rest/s1/unigate/",
        { instanceInfo: { instancePurpose: "uat" } }
      ),
      "UAT OMS instances are expected to use https://unigate-uat.hotwax.io/rest/s1/unigate/. This tenant is currently using https://unigate.hotwax.io/rest/s1/unigate/."
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
