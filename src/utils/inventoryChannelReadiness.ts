import { translate } from "@common";

/**
 * WHAT A CHANNEL NEEDS BEFORE IT CAN PUBLISH, checked from rows the page already holds.
 *
 * Each check mirrors a rule the connector enforces at run time, so a failed check here is a run that will
 * fail or silently skip there:
 * - the facility group must be CHANNEL_FAC_GROUP: `generate#InventoryChannelInventoryFeed` (the channel
 *   reset) refuses any other type;
 * - a channel's details are claimed only by an unpaused publish job whose inventoryChannelId names it;
 * - a pre-order or back-order channel must be the shop's only active channel of its type, and the store
 *   needs exactly one active parking purpose of that type whose facility maps to the channel's Shopify
 *   location, or `get#ShopifyOrderLocationProjection` refuses the shop's orders;
 * - a reset while the channel still has unbatched events posts those events on top of the reset total.
 */

export type ReadinessLevel = "ok" | "warning" | "error";

export interface ReadinessCheck {
  id: "groupType" | "publisher" | "singleChannel" | "parking" | "waitingEvents";
  level: ReadinessLevel;
  label: string;
}

export interface ChannelReadinessInput {
  channel: { inventoryChannelId: string; channelTypeEnumId?: string; shopifyLocationId?: string; facilityGroupId?: string };
  /** The facility group's row, or undefined when it is not cached. */
  facilityGroup?: { facilityGroupTypeId?: string } | undefined;
  /** Every publish job (drain# or publish#) whose inventoryChannelId is this channel. */
  publisherJobs: Array<{ paused?: string }>;
  /** The shop's channels that are effective now, this one included. */
  shopChannels: Array<{ inventoryChannelId: string; channelTypeEnumId?: string }>;
  /** Active purposes of the shop's product store. */
  storePurposes: Array<{ facilityId: string; facilityPurposeEnumId: string }>;
  /** facilityId -> Shopify location id, for this shop. */
  locationByFacility: Record<string, string>;
  /** Unbatched events cached for this channel. */
  waitingEvents: number;
  /** FP_PRE_ORDER_PARK or FP_BACKORDER_PARK for a future channel; undefined for a physical one. */
  parkingPurposeEnumId?: string;
}

export interface ChannelReadiness {
  checks: ReadinessCheck[];
  /** The one parking facility the connector would use, when exactly one maps to the channel's location. */
  parkingFacilityId: string;
  ready: boolean;
}

export function channelReadiness(input: ChannelReadinessInput): ChannelReadiness {
  const checks: ReadinessCheck[] = [];
  const typeId = input.channel.channelTypeEnumId || "SICT_PHYSICAL";

  const groupType = input.facilityGroup?.facilityGroupTypeId;
  checks.push(groupType === "CHANNEL_FAC_GROUP"
    ? { id: "groupType", level: "ok", label: translate("Facility group is a channel group") }
    : {
      id: "groupType",
      level: "error",
      label: groupType
        ? translate("Facility group type is {type}; channel resets need CHANNEL_FAC_GROUP", { type: groupType })
        : translate("Facility group is not cached; channel resets need CHANNEL_FAC_GROUP"),
    });

  const activePublishers = input.publisherJobs.filter((job) => job.paused !== "Y").length;
  checks.push(activePublishers
    ? { id: "publisher", level: "ok", label: translate("A publish job is active for this channel") }
    : {
      id: "publisher",
      level: "error",
      label: input.publisherJobs.length
        ? translate("Its publish job is paused, so its events are not sent")
        : translate("No publish job names this channel, so its events are not sent"),
    });

  let parkingFacilityId = "";
  if(input.parkingPurposeEnumId) {
    const sameType = input.shopChannels.filter((row) => (row.channelTypeEnumId || "SICT_PHYSICAL") === typeId);
    checks.push(sameType.length === 1
      ? { id: "singleChannel", level: "ok", label: translate("Only active channel of its type on this shop") }
      : { id: "singleChannel", level: "error", label: translate("{count} active channels of this type on this shop; the connector needs exactly one", { count: sameType.length }) });

    const parking = input.storePurposes.filter((row) => row.facilityPurposeEnumId === input.parkingPurposeEnumId);
    const atLocation = parking.filter((row) =>
      !!input.channel.shopifyLocationId && input.locationByFacility[row.facilityId] === String(input.channel.shopifyLocationId));
    if(atLocation.length === 1) {
      parkingFacilityId = atLocation[0].facilityId;
      checks.push({ id: "parking", level: "ok", label: translate("Store parking {facility} maps to this location", { facility: parkingFacilityId }) });
    } else if(!parking.length) {
      checks.push({ id: "parking", level: "error", label: translate("The product store has no active parking facility for this type") });
    } else if(!atLocation.length) {
      checks.push({
        id: "parking",
        level: "error",
        label: translate("Store parking {facility} is not mapped to this Shopify location", { facility: parking.map((row) => row.facilityId).join(", ") }),
      });
    } else {
      checks.push({ id: "parking", level: "error", label: translate("More than one store parking facility maps to this location") });
    }
  }

  if(input.waitingEvents > 0) {
    checks.push({
      id: "waitingEvents",
      level: "warning",
      label: translate("Events are still waiting to batch ({count} in the cached window): let the publish job catch up before a reset, or they are counted twice", { count: input.waitingEvents }),
    });
  }

  return { checks, parkingFacilityId, ready: checks.every((check) => check.level !== "error") };
}
