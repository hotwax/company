import { useAuth } from "@common/composables/useAuth"
import { Login, commonUtil, translate } from "@common/index"
import { createRouter, createWebHistory } from "@ionic/vue-router"
import type { RouteLocationNormalized, RouteRecordRaw } from "vue-router"
import Actions from "@/authorization/actions"
import { useProductStoreOnboardingWizard } from "@/composables/useProductStoreOnboardingWizard"
import { useUserStore } from "@/store/user"

const FindFacilities = () => import("@/views/FindFacilities.vue")
const FacilityDetails = () => import("@/views/FacilityDetails.vue")
const CreateFacility = () => import("@/views/CreateFacility.vue")
const AddFacilityAddress = () => import("@/views/AddFacilityAddress.vue")
const AddFacilityConfig = () => import("@/views/AddFacilityConfig.vue")
const FindGroups = () => import("@/views/FindGroups.vue")
const FacilityGroupDetail = () => import("@/views/FacilityGroupDetail.vue")
const Parking = () => import("@/views/Parking.vue")
const Users = () => import("@/views/Users.vue")
const AppPermissions = () => import("@/views/AppPermissions.vue")
const SecurityGroups = () => import("@/views/SecurityGroups.vue")
const SecurityGroupDetail = () => import("@/views/SecurityGroupDetail.vue")
const UserDetails = () => import("@/views/UserDetails.vue")
const CreateUser = () => import("@/views/CreateUser.vue")
const UserConfirmation = () => import("@/views/UserConfirmation.vue")
const UserQuickSetup = () => import("@/views/UserQuickSetup.vue")
const ProductStoreOnboarding = () => import("@/views/ProductStoreOnboarding.vue")
const ProductStoreDetails = () => import("@/views/ProductStoreDetails.vue")
const ProductStore = () => import("@/views/ProductStore.vue")
const NetSuite = () => import("@/views/NetSuite.vue")
const NetSuiteSyncMonitor = () => import("@/views/NetSuiteSyncMonitor.vue")
const Carriers = () => import("@/views/Carriers.vue")
const CreateCarrier = () => import("@/views/CreateCarrier.vue")
const CarrierShipmentMethods = () => import("@/views/CarrierShipmentMethods.vue")
const CarrierDetails = () => import("@/views/CarrierDetails.vue")
const Settings = () => import("@/views/Settings.vue")
const ShipmentMethods = () => import("@/views/ShipmentMethods.vue")
const InventoryVariances = () => import("@/views/InventoryVariances.vue")
const PaymentMethods = () => import("@/views/PaymentMethods.vue")
const SalesChannel = () => import("@/views/SalesChannel.vue")
const Departments = () => import("@/views/Departments.vue")
const ShopifyConnectionDetails = () => import("@/views/ShopifyConnectionDetails.vue")
const ShopifyInventorySync = () => import("@/views/ShopifyInventorySync.vue")
const Klaviyo = () => import("@/views/Klaviyo.vue")
const KlaviyoConnectionDetails = () => import("@/views/KlaviyoConnectionDetails.vue")
const CloneProductStore = () => import("@/views/CloneProductStore.vue")
const Composer = () => import("@/views/agent/Composer.vue")
const Workforce = () => import("@/views/agent/Workforce.vue")
const ResetPassword = () => import("@/views/ResetPassword.vue")
const AppVersion = () => import("@/views/AppVersion.vue")
const Organizations = () => import("@/views/Organizations.vue")
const OrganizationDetails = () => import("@/views/OrganizationDetails.vue")

const authGuard = () => {
  if(!useAuth().isAuthenticated.value) {
    return { path: "/login" }
  }
}

const requirePermission = (permissionId: string) => () => {
  if(!useAuth().isAuthenticated.value) {
    return { path: "/login" }
  }
  if(!useUserStore().hasPermission(permissionId)) {
    commonUtil.showToast(translate("The requested page was not available to your user. Please contact your administrator to update your permissions."))

    return { path: "/product-store" }
  }
}

/**
 * `/create-product-store` is a compatibility command, not a resumable route. Reset before
 * redirecting so old links always start a clean setup. The canonical base route remains resumable,
 * and no transient query flag is left behind for a reload or later navigation to replay.
 */
export function redirectLegacyProductStoreCreation(to: Pick<RouteLocationNormalized, "query" | "hash">) {
  useProductStoreOnboardingWizard().startNewSetup()

  return {
    name: "ProductStoreOnboarding",
    query: to.query,
    hash: to.hash,
  }
}

const routes: Array<RouteRecordRaw> = [
  { path: "/", redirect: "/product-store" },
  { path: "/product-store", name: "ProductStore", component: ProductStore, beforeEnter: authGuard },
  {
    path: "/organizations",
    name: "Organizations",
    component: Organizations,
    beforeEnter: requirePermission(Actions.APP_ORGANIZATIONS_VIEW),
  },
  {
    path: "/organization-details/:partyId",
    name: "OrganizationDetails",
    component: OrganizationDetails,
    props: true,
    beforeEnter: requirePermission(Actions.APP_ORGANIZATIONS_VIEW),
  },
  { path: "/facilities/find", name: "FindFacilities", component: FindFacilities, beforeEnter: authGuard },
  { path: "/facilities/groups", name: "FindGroups", component: FindGroups, beforeEnter: authGuard },
  { path: "/facility-group-detail/:facilityGroupId", name: "FacilityGroupDetail", component: FacilityGroupDetail, props: true, beforeEnter: authGuard },
  { path: "/parking", name: "Parking", component: Parking, beforeEnter: authGuard },
  { path: "/facility-details/:facilityId", name: "FacilityDetails", component: FacilityDetails, props: true, beforeEnter: authGuard },
  { path: "/create-facility", name: "CreateFacility", component: CreateFacility, beforeEnter: authGuard },
  { path: "/create-facility/address/:facilityId", name: "AddFacilityAddress", component: AddFacilityAddress, props: true, beforeEnter: authGuard },
  { path: "/create-facility/config/:facilityId", name: "AddFacilityConfig", component: AddFacilityConfig, props: true, beforeEnter: authGuard },
  { path: "/users", name: "Users", component: Users, beforeEnter: requirePermission(Actions.APP_USERS_VIEW) },
  { path: "/app-permissions", name: "AppPermissions", component: AppPermissions, beforeEnter: requirePermission(Actions.APP_APP_PERMISSIONS_VIEW) },
  { path: "/security-groups", name: "SecurityGroups", component: SecurityGroups, beforeEnter: requirePermission(Actions.APP_SECURITY_GROUPS_VIEW) },
  { path: "/security-group-detail/:userGroupId", name: "SecurityGroupDetail", component: SecurityGroupDetail, props: true, beforeEnter: requirePermission(Actions.APP_SECURITY_GROUPS_VIEW) },
  { path: "/user-details/:partyId", name: "UserDetails", component: UserDetails, props: true, beforeEnter: requirePermission(Actions.APP_USERS_VIEW) },
  { path: "/create-user", name: "CreateUser", component: CreateUser, beforeEnter: requirePermission(Actions.APP_SECURITY_CREATE) },
  { path: "/user-confirmation/:partyId", name: "UserConfirmation", component: UserConfirmation, props: true, beforeEnter: requirePermission(Actions.APP_SECURITY_CREATE) },
  { path: "/user-quick-setup/:partyId", name: "UserQuickSetup", component: UserQuickSetup, props: true, beforeEnter: requirePermission(Actions.APP_SECURITY_CREATE) },
  { path: "/product-store-details/:productStoreId", name: "ProductStoreDetails", component: ProductStoreDetails, props: true, beforeEnter: authGuard },
  { path: "/shopify", name: "ShopifyConnections", component: () => import("@/views/ShopifyConnections.vue"), beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id", name: "ShopifyConnectionDetails", component: ShopifyConnectionDetails, props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/locations", name: "ShopifyLocations", component: () => import("@/views/ShopifyLocations.vue"), props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/shipment-methods", name: "ShopifyShipmentMethods", component: () => import("@/views/ShopifyShipmentMethods.vue"), props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/payment-methods", name: "ShopifyPaymentMethods", component: () => import("@/views/ShopifyPaymentMethods.vue"), props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/sales-channels", name: "ShopifySalesChannels", component: () => import("@/views/ShopifySalesChannels.vue"), props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/product-types", name: "ShopifyProductTypes", component: () => import("@/views/ShopifyProductTypes.vue"), props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/product-sync", name: "ShopifyProductSync", component: () => import("@/views/ShopifyProductSync.vue"), props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/product-sync/history", name: "ShopifyProductSyncHistory", component: () => import("@/views/ShopifyProductSyncHistory.vue"), props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/product-sync/upgrade-assistant", name: "ShopifyProductSyncUpgradeAssistant", component: () => import("@/views/ShopifyProductSyncUpgradeAssistant.vue"), props: true, beforeEnter: authGuard },
  {
    path: "/shopify-connection-details/:id/inventory-sync",
    name: "ShopifyInventorySync",
    component: ShopifyInventorySync,
    props: (route) => ({ id: route.params.id, initialView: "monitor" }),
    beforeEnter: authGuard,
  },
  {
    path: "/shopify-connection-details/:id/inventory-sync/history",
    name: "ShopifyInventorySyncHistory",
    component: ShopifyInventorySync,
    props: (route) => ({
      id: route.params.id,
      initialView: "history",
      initialHistoryMode: route.query.mode === "batches" ? "batches" : "events",
    }),
    beforeEnter: authGuard,
  },
  {
    // Full run history for one inventory sync job. jobName is a route param rather than a query so
    // the page is linkable; `title` carries the human name the sync screen already has.
    path: "/shopify-connection-details/:id/inventory-sync/job-runs/:jobName",
    name: "ShopifyInventoryJobRuns",
    component: () => import("@/views/ShopifyInventoryJobRuns.vue"),
    props: (route) => ({
      id: route.params.id,
      jobName: route.params.jobName,
      title: typeof route.query.title === "string" ? route.query.title : "",
    }),
    beforeEnter: authGuard,
  },
  { path: "/shopify-connection-details/:id/order-sync/configure", name: "ShopifyOrderSyncConfigure", component: () => import("@/views/ShopifyOrderSyncConfigure.vue"), props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/order-sync", name: "ShopifyOrderSync", component: () => import("@/views/ShopifyOrderSync.vue"), props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/order-sync/history", name: "ShopifyOrderSyncHistory", component: () => import("@/views/ShopifyOrderSyncHistory.vue"), props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/instance-details", name: "ShopifyInstanceDetails", component: () => import("@/views/ShopifyShopDetails.vue"), props: true, beforeEnter: authGuard },
  { path: "/klaviyo", name: "Klaviyo", component: Klaviyo, beforeEnter: authGuard },
  { path: "/klaviyo/:id", name: "KlaviyoConnectionDetails", component: KlaviyoConnectionDetails, props: true, beforeEnter: authGuard },
  { path: "/netsuite", name: "NetSuite", component: NetSuite, beforeEnter: authGuard },
  { path: "/unigate", name: "Unigate", component: () => import("@/views/Unigate.vue"), beforeEnter: requirePermission("CARRIER_SETUP_VIEW") },
  { path: "/carriers", name: "Carriers", component: Carriers, beforeEnter: requirePermission("CARRIER_SETUP_VIEW") },
  { path: "/create-carrier", name: "CreateCarrier", component: CreateCarrier, beforeEnter: requirePermission("CARRIER_SETUP_VIEW") },
  { path: "/shipment-methods-setup/:partyId", name: "CarrierShipmentMethods", component: CarrierShipmentMethods, props: true, beforeEnter: requirePermission("CARRIER_SETUP_VIEW") },
  { path: "/carrier-details/:partyId", name: "CarrierDetailsAlias", component: CarrierDetails, props: true, beforeEnter: requirePermission("CARRIER_SETUP_VIEW") },
  { path: "/carriers/:partyId", name: "CarrierDetails", component: CarrierDetails, props: true, beforeEnter: requirePermission("CARRIER_SETUP_VIEW") },
  { path: "/netsuite/shipment-methods", name: "ShipmentMethods", component: ShipmentMethods, beforeEnter: authGuard },
  { path: "/netsuite/inventory-variances", name: "InventoryVariances", component: InventoryVariances, beforeEnter: authGuard },
  { path: "/netsuite/payment-methods", name: "PaymentMethods", component: PaymentMethods, beforeEnter: authGuard },
  { path: "/netsuite/sales-channel", name: "SalesChannel", component: SalesChannel, beforeEnter: authGuard },
  { path: "/netsuite/departments", name: "Departments", component: Departments, beforeEnter: authGuard },
  { path: "/netsuite/sync-monitor", name: "NetSuiteSyncMonitor", component: NetSuiteSyncMonitor, beforeEnter: authGuard },
  {
    path: "/create-product-store",
    name: "CreateProductStore",
    redirect: redirectLegacyProductStoreCreation,
  },
  { path: "/product-store-onboarding", name: "ProductStoreOnboarding", component: ProductStoreOnboarding, beforeEnter: authGuard },
  { path: "/product-store-onboarding/:productStoreId", name: "ProductStoreOnboardingForStore", component: ProductStoreOnboarding, props: true, beforeEnter: authGuard },
  {
    path: "/add-configurations/:productStoreId",
    name: "AddConfigurations",
    redirect: (to) => ({
      name: "ProductStoreOnboardingForStore",
      params: { productStoreId: to.params.productStoreId },
      query: to.query,
      hash: to.hash,
    }),
  },
  { path: "/login", name: "Login", component: Login },
  { path: "/reset-password", name: "ResetPassword", component: ResetPassword },
  { path: "/settings", name: "Settings", component: Settings, beforeEnter: authGuard },
  { path: "/app-version", name: "AppVersion", component: AppVersion, beforeEnter: authGuard },
  { path: "/clone-product-store", name: "CloneProductStore", component: CloneProductStore, beforeEnter: authGuard },
  { path: "/composer", name: "Composer", component: Composer, beforeEnter: authGuard },
  { path: "/workforce", name: "Workforce", component: Workforce, beforeEnter: authGuard },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach(() => {
  // Enforce the canonical version URL on every navigation (no-op until the version is resolved, or if
  // already canonical). Redirect cancels this navigation. Logic lives in useAuth so it's shared. Runs
  // globally (routes here use per-route beforeEnter guards, so this must be a top-level beforeEach).
  if(useAuth().checkAppVersionRedirect()) {
    return false
  }
})

export default router
