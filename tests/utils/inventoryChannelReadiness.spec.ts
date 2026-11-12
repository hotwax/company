import { describe, expect, it, vi } from "vitest";

vi.mock("@common", () => ({
  translate: (value: string, params: Record<string, unknown> = {}) =>
    value.replace(/\{(\w+)\}/g, (_match, key) => String(params[key] ?? "")),
}));

import { channelReadiness } from "@/utils/inventoryChannelReadiness";

const preOrder = { inventoryChannelId: "PRE", channelTypeEnumId: "SICT_PRE_ORDER", shopifyLocationId: "999", facilityGroupId: "GRP" };

const ready = {
  channel: preOrder,
  facilityGroup: { facilityGroupTypeId: "CHANNEL_FAC_GROUP" },
  publisherJobs: [{ paused: "N" }],
  shopChannels: [preOrder, { inventoryChannelId: "PHYS", channelTypeEnumId: "SICT_PHYSICAL" }],
  storePurposes: [{ facilityId: "PRE_ORDER_PARKING", facilityPurposeEnumId: "FP_PRE_ORDER_PARK" }],
  locationByFacility: { PRE_ORDER_PARKING: "999" },
  waitingEvents: 0,
  parkingPurposeEnumId: "FP_PRE_ORDER_PARK",
};

const levels = (input: Parameters<typeof channelReadiness>[0]) =>
  Object.fromEntries(channelReadiness(input).checks.map((check) => [check.id, check.level]));

describe("channelReadiness", () => {
  it("passes a pre-order channel the connector can publish and project", () => {
    const result = channelReadiness(ready);

    expect(result.ready).toBe(true);
    expect(result.parkingFacilityId).toBe("PRE_ORDER_PARKING");
    expect(levels(ready)).toEqual({ groupType: "ok", publisher: "ok", singleChannel: "ok", parking: "ok" });
  });

  it("flags a group that is not CHANNEL_FAC_GROUP, since the reset refuses it", () => {
    const result = channelReadiness({ ...ready, facilityGroup: { facilityGroupTypeId: "FEATURING" } });

    expect(result.ready).toBe(false);
    expect(result.checks[0].label).toContain("FEATURING");
  });

  it("counts a channel as publishing when any of its jobs is unpaused", () => {
    expect(levels({ ...ready, publisherJobs: [{ paused: "Y" }, { paused: "N" }] }).publisher).toBe("ok");
    expect(levels({ ...ready, publisherJobs: [{ paused: "Y" }] }).publisher).toBe("error");
    expect(levels({ ...ready, publisherJobs: [] }).publisher).toBe("error");
  });

  it("needs exactly one active channel of the type on the shop", () => {
    const second = { inventoryChannelId: "PRE_2", channelTypeEnumId: "SICT_PRE_ORDER" };

    expect(levels({ ...ready, shopChannels: [...ready.shopChannels, second] }).singleChannel).toBe("error");
  });

  it("needs the store's parking of that type mapped to the channel's location", () => {
    expect(levels({ ...ready, storePurposes: [] }).parking).toBe("error");
    expect(levels({ ...ready, locationByFacility: { PRE_ORDER_PARKING: "111" } }).parking).toBe("error");
    expect(levels({
      ...ready,
      storePurposes: [...ready.storePurposes, { facilityId: "PARK_2", facilityPurposeEnumId: "FP_PRE_ORDER_PARK" }],
      locationByFacility: { PRE_ORDER_PARKING: "999", PARK_2: "999" },
    }).parking).toBe("error");
    // Two active purposes are an error even when one of them maps to the location: the connector needs exactly one.
    expect(levels({
      ...ready,
      storePurposes: [...ready.storePurposes, { facilityId: "PARK_2", facilityPurposeEnumId: "FP_PRE_ORDER_PARK" }],
    }).parking).toBe("error");
    // A back-order purpose does not satisfy a pre-order channel.
    expect(levels({ ...ready, storePurposes: [{ facilityId: "PRE_ORDER_PARKING", facilityPurposeEnumId: "FP_BACKORDER_PARK" }] }).parking).toBe("error");
  });

  it("skips the future-only checks for a physical channel", () => {
    const physical = { inventoryChannelId: "PHYS", channelTypeEnumId: "SICT_PHYSICAL", shopifyLocationId: "1" };

    expect(Object.keys(levels({ ...ready, channel: physical, parkingPurposeEnumId: undefined }))).toEqual(["groupType", "publisher"]);
  });

  it("warns, without blocking, when events are still waiting before a reset", () => {
    const result = channelReadiness({ ...ready, waitingEvents: 3 });

    expect(result.ready).toBe(true);
    expect(result.checks.at(-1)).toMatchObject({ id: "waitingEvents", level: "warning" });
  });
});
