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

/**
 * The card body every segment shares. Deliberately says nothing about a SystemMessage or a
 * fulfillment id: a Pending row has neither, and the point of the shared body is that a shipment
 * reads the same wherever it sits in the pipeline.
 */
export interface FulfillmentShipmentRow {
  shipmentId: string;
  orderName: string;
  facility: string;
  orderDate: string;
  shippedDate: string;
  /**
   * The third fact, which is the one thing that differs by segment: how long a shipment has been
   * waiting, or when it settled.
   */
  trailing: { label: string; value: string };
  items: FulfillmentOrderItem[];
}

/** The badge a card leads with. Always a status the system actually stores. */
export interface FulfillmentShipmentState {
  label: string;
  color: string;
}
