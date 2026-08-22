/** One line on a shipment, as the fulfillment cards show it. */
export interface FulfillmentOrderItem {
  orderItemSeqId: string;
  /** Whatever the shop's primary product identifier resolves to. */
  primary: string;
  /** And its secondary, conventionally the SKU. */
  secondary: string;
  /** Empty when the product has no image; Image falls back to the bundled placeholder. */
  imageUrl: string;
}

/** One cell of the shipment-facts grid. */
export interface FulfillmentShipmentFact {
  /** An ionicons icon for the cell. Optional — a fact without one renders label and value alone. */
  icon?: string;
  label: string;
  value: string;
}

/**
 * The card body every segment shares. Deliberately says nothing about a SystemMessage or a
 * fulfillment id: the point of the shared body is that a shipment reads the same wherever it sits
 * in the pipeline. Every optional field is one some backing record genuinely lacks — a queued
 * message names no facility, a history row carries no line items — and an absent field renders
 * nothing rather than an empty slot.
 */
export interface FulfillmentShipmentRow {
  shipmentId: string;
  orderName: string;
  facility?: string;
  /** The facts grid, in render order. Only facts the record actually has belong here. */
  facts: FulfillmentShipmentFact[];
  items?: FulfillmentOrderItem[];
}

/** The badge a card leads with. Always a status the system actually stores. */
export interface FulfillmentShipmentState {
  label: string;
  color: string;
}
