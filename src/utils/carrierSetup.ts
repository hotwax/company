export type CarrierUsage = "" | "labels" | "external";
export type ServiceStrategy = "direct" | "rate";
export type SetupMethod = { shipmentMethodTypeId: string; description: string; carrierServiceCode?: string; deliveryDays?: number | string };
export const SETUP_LABELS: Record<string, string> = {
  usage: "How will you use this carrier?", prepare: "Before you connect", credentials: "Connect your account",
  strategy: "Choose your shipping approach", methods: "Choose shipping methods", facilities: "Set up fulfillment facilities",
  stores: "Enable methods for your stores", mappings: "Map incoming shipping methods", review: "Review your setup",
};
export function carrierSetupSteps(usage: CarrierUsage): string[] {
  if(!usage) {return ["usage"];}

  return usage === "labels"
    ? ["usage", "prepare", "credentials", "strategy", "methods", "facilities", "stores", "mappings", "review"]
    : ["usage", "methods", "stores", "mappings", "review"];
}
// FedEx REST serviceType values. Ground transit depends on the route: never invent an SLA.
export const FEDEX_METHODS: SetupMethod[] = [
  { shipmentMethodTypeId: "FDX_PRIORITY_OVERNIGHT", description: "FedEx Priority Overnight", carrierServiceCode: "PRIORITY_OVERNIGHT", deliveryDays: 1 },
  { shipmentMethodTypeId: "FDX_STANDARD_OVERNIGHT", description: "FedEx Standard Overnight", carrierServiceCode: "STANDARD_OVERNIGHT", deliveryDays: 1 },
  { shipmentMethodTypeId: "FDX_2_DAY", description: "FedEx 2Day", carrierServiceCode: "FEDEX_2_DAY", deliveryDays: 2 },
  { shipmentMethodTypeId: "FDX_GROUND", description: "FedEx Ground", carrierServiceCode: "FEDEX_GROUND" },
  { shipmentMethodTypeId: "FDX_HOME_DELIVERY", description: "FedEx Home Delivery", carrierServiceCode: "GROUND_HOME_DELIVERY" },
];
export function fedexMethodsForOrigin(country: string) {
  // Home Delivery and the 2Day preset here are US domestic services; other services need
  // an explicit account/route availability check before they can be used to ship.
  return FEDEX_METHODS.filter(row => country === "US" || !["FDX_HOME_DELIVERY", "FDX_2_DAY"].includes(row.shipmentMethodTypeId));
}
export const SLA_METHODS: SetupMethod[] = [
  { shipmentMethodTypeId: "NEXT_DAY", description: "Next Day", deliveryDays: 1 },
  { shipmentMethodTypeId: "SECOND_DAY", description: "Two Day", deliveryDays: 2 },
  { shipmentMethodTypeId: "STANDARD", description: "Standard", deliveryDays: "" },
];
export function positiveDeliveryDays(value: unknown): boolean {
  return value !== "" && value != null && Number.isInteger(Number(value)) && Number(value) > 0;
}
export function fedexCredentialPayload(id: string, environment: "test" | "live", name: string, apiKey: string, secret: string) {
  return { shippingGatewayAuthId: id, shippingGatewayConfigId: "FEDEX", description: name.trim(),
    baseUrl: environment === "test" ? "https://apis-sandbox.fedex.com" : "https://apis.fedex.com",
    username: apiKey.trim(), publicKey: secret.trim(), authHeaderName: "Authorization" };
}
