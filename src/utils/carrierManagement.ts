export type ShipmentMethod = {
  shipmentMethodTypeId: string;
  description?: string;
  [key: string]: any;
};

export function mergeCarrierShipmentMethods(
  shipmentMethodTypes: ShipmentMethod[],
  carrierShipmentMethods: ShipmentMethod[],
) {
  const configuredMethods = new Map(
    carrierShipmentMethods.map((method) => [method.shipmentMethodTypeId, method]),
  );

  return shipmentMethodTypes.map((method) => ({
    ...method,
    ...(configuredMethods.get(method.shipmentMethodTypeId) || {}),
    isConfigured: configuredMethods.has(method.shipmentMethodTypeId),
  }));
}

export function mergeProductStoreShipmentMethods(
  carrierShipmentMethods: ShipmentMethod[],
  productStoreAssociations: ShipmentMethod[],
  shipmentMethodTypes: ShipmentMethod[],
  productStoreId: string,
) {
  const descriptions = new Map(
    shipmentMethodTypes.map((method) => [method.shipmentMethodTypeId, method.description]),
  );
  const associations = new Map(
    productStoreAssociations
      .filter((method) => method.productStoreId === productStoreId)
      .map((method) => [method.shipmentMethodTypeId, method]),
  );

  return carrierShipmentMethods.map((method) => {
    const association = associations.get(method.shipmentMethodTypeId);
    return {
      ...method,
      ...(association || {}),
      description: descriptions.get(method.shipmentMethodTypeId),
      isConfigured: Boolean(association),
      isTrackingRequired: association?.isTrackingRequired === "Y" || association?.isTrackingRequired === true,
    };
  });
}
