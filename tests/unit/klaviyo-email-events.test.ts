import assert from "assert";
import {
  getDefaultKlaviyoProductStoreId,
  getKlaviyoEventsForStore,
} from "../../src/utils/klaviyoEmailEvents";

describe("klaviyo email events", () => {
  test("keeps the current store when valid and otherwise falls back predictably", () => {
    const productStores = [
      { productStoreId: "STORE_A", storeName: "Store A" },
      { productStoreId: "STORE_B", storeName: "Store B" },
    ];

    assert.equal(getDefaultKlaviyoProductStoreId(productStores, "STORE_B", "STORE_A"), "STORE_B");
    assert.equal(getDefaultKlaviyoProductStoreId(productStores, "MISSING", "STORE_A"), "STORE_A");
    assert.equal(getDefaultKlaviyoProductStoreId(productStores, "", "MISSING"), "STORE_A");
    assert.equal(getDefaultKlaviyoProductStoreId([], "STORE_B", "STORE_A"), "");
  });

  test("builds event state for the selected store and current connection", () => {
    const events = getKlaviyoEventsForStore({
      productStoreId: "STORE_B",
      emailTypes: [
        { enumId: "READY_FOR_PICKUP", enumName: "Ready for pickup" },
        { enumId: "REJECT_BOPIS_ORDER", enumName: "Rejected order" },
      ],
      allSettings: [
        {
          productStoreId: "STORE_A",
          emailType: "READY_FOR_PICKUP",
          gatewayAuthId: "GATEWAY_1",
          subject: "Store A ready",
        },
        {
          productStoreId: "STORE_B",
          emailType: "READY_FOR_PICKUP",
          gatewayAuthId: "GATEWAY_2",
          subject: "Store B ready",
        },
        {
          productStoreId: "STORE_B",
          emailType: "REJECT_BOPIS_ORDER",
          gatewayAuthId: "GATEWAY_1",
          subject: "Store B rejected",
        },
      ] as any,
      gatewayAuthId: "GATEWAY_1",
      subjectDrafts: {
        REJECT_BOPIS_ORDER: "Draft rejected subject",
      },
    });

    assert.equal(events[0].emailType, "READY_FOR_PICKUP");
    assert.equal(events[0].enabled, true);
    assert.equal(events[0].ownedByThisGateway, false);
    assert.equal(events[0].subject, "Store B ready");

    assert.equal(events[1].emailType, "REJECT_BOPIS_ORDER");
    assert.equal(events[1].enabled, true);
    assert.equal(events[1].ownedByThisGateway, true);
    assert.equal(events[1].subject, "Draft rejected subject");
  });
});
