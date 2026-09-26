import { translate } from "@common";

/**
 * Human labels for facility group type ids.
 *
 * ⚠️ THIS EXISTS BECAUSE THE OMS HAS NO FACILITY GROUP TYPE RESOURCE TO READ DESCRIPTIONS FROM.
 *
 * `oms/facilityGroupTypes` and `admin/facilityGroupTypes` both 404, `admin/enums` holds no
 * `FacilityGroupType` rows, and `FacilityGroupType` appears in no `.rest.xml` — so
 * `useFacilityGroupTypes` derives the types from the ids already on cached groups and has no
 * description to attach. With none, every surface fell back to the raw id: group cards, the detail
 * header, the type filter, and the create/edit pickers all read "BROKERING_GROUP",
 * "ALLOW_NEGATIVE_RES", "SHOPIFY_GROUP_FAC".
 *
 * A local map is the only fix available in this repo. Delete it in favour of server descriptions if
 * a `facilityGroupTypes` endpoint is ever added.
 */
const FACILITY_GROUP_TYPE_LABELS: Record<string, string> = {
  ALLOW_NEGATIVE_RES: "Allow Negative Reservation",
  AUTO_CANCEL_CONFIG: "Auto Cancel Configuration",
  BROKERING_GROUP: "Brokering",
  CHANNEL_FAC_GROUP: "Channel",
  FEATURING: "Featuring",
  FULFILLMENT: "Fulfillment",
  ORD_CANCEL_CONFIG: "Order Cancel Configuration",
  PICKING: "Picking",
  PICKUP: "Pickup",
  SAME_DAY: "Same Day",
  SHIPPING_LABEL: "Shipping Label",
  SHOPIFY_GROUP_FAC: "Shopify",
};

/**
 * The label for a group type id, or "" when it is not mapped.
 *
 * Empty rather than the id itself on purpose: every caller already renders
 * `description || facilityGroupTypeId`, so an unmapped type shows its id — visible and unlabelled,
 * never blank.
 */
export function facilityGroupTypeLabel(facilityGroupTypeId: string): string {
  const label = FACILITY_GROUP_TYPE_LABELS[facilityGroupTypeId];

  return label ? translate(label) : "";
}

/** The mapped ids, for tests and for asserting locale coverage. */
export const facilityGroupTypeLabelIds = Object.keys(FACILITY_GROUP_TYPE_LABELS);
