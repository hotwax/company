import { createRouter, createWebHistory } from "@ionic/vue-router"
import { RouteRecordRaw } from "vue-router"
import { Login, commonUtil, logger, translate } from "@common/index"
import { useAuth } from "@common/composables/useAuth"
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
const CreateProductStore = () => import("@/views/CreateProductStore.vue")
const ProductStoreOnboarding = () => import("@/views/ProductStoreOnboarding.vue")
const AddConfigurations = () => import("@/views/AddConfigurations.vue")
const ProductStoreDetails = () => import("@/views/ProductStoreDetails.vue")
const ProductStore = () => import("@/views/ProductStore.vue")
const NetSuite = () => import("@/views/NetSuite.vue")
const Carriers = () => import("@/views/Carriers.vue")
const CarrierDetails = () => import("@/views/CarrierDetails.vue")
const Settings = () => import("@/views/Settings.vue")
const ShipmentMethods = () => import("@/views/ShipmentMethods.vue")
const InventoryVariances = () => import("@/views/InventoryVariances.vue")
const PaymentMethods = () => import("@/views/PaymentMethods.vue")
const SalesChannel = () => import("@/views/SalesChannel.vue")
const Departments = () => import("@/views/Departments.vue")
const ShopifyConnectionDetails = () => import("@/views/ShopifyConnectionDetails.vue")
const Klaviyo = () => import("@/views/Klaviyo.vue")
const KlaviyoConnectionDetails = () => import("@/views/KlaviyoConnectionDetails.vue")
const CloneProductStore = () => import("@/views/CloneProductStore.vue")
const Composer = () => import("@/views/agent/Composer.vue")
const Workforce = () => import("@/views/agent/Workforce.vue")
const ResetPassword = () => import("@/views/ResetPassword.vue")

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

const routes: Array<RouteRecordRaw> = [
  { path: "/", redirect: "/product-store" },
  { path: "/product-store", name: "ProductStore", component: ProductStore, beforeEnter: authGuard },
  { path: "/facilities/find", name: "FindFacilities", component: FindFacilities, beforeEnter: authGuard },
  { path: "/facilities/groups", name: "FindGroups", component: FindGroups, beforeEnter: authGuard },
  { path: "/facility-group-detail/:facilityGroupId", name: "FacilityGroupDetail", component: FacilityGroupDetail, props: true, beforeEnter: authGuard },
  { path: "/parking", name: "Parking", component: Parking, beforeEnter: authGuard },
  { path: "/facility-details/:facilityId", name: "FacilityDetails", component: FacilityDetails, props: true, beforeEnter: authGuard },
  { path: "/create-facility", name: "CreateFacility", component: CreateFacility, beforeEnter: authGuard },
  { path: "/create-facility/address/:facilityId", name: "AddFacilityAddress", component: AddFacilityAddress, props: true, beforeEnter: authGuard },
  { path: "/create-facility/config/:facilityId", name: "AddFacilityConfig", component: AddFacilityConfig, props: true, beforeEnter: authGuard },
  { path: "/users", name: "Users", component: Users, beforeEnter: requirePermission("USERS_LIST_VIEW OR PARTYMGR_VIEW OR PARTYMGR_ADMIN") },
  { path: "/app-permissions", name: "AppPermissions", component: AppPermissions, beforeEnter: requirePermission("APP_PERMISSION_VIEW OR APP_PERMISSION_CREATE OR APP_PERMISSION_UPDATE OR SECURITY_ADMIN") },
  { path: "/security-groups", name: "SecurityGroups", component: SecurityGroups, beforeEnter: requirePermission("SECURITY_VIEW OR SECURITY_ADMIN") },
  { path: "/security-group-detail/:userGroupId", name: "SecurityGroupDetail", component: SecurityGroupDetail, props: true, beforeEnter: requirePermission("SECURITY_VIEW OR SECURITY_ADMIN") },
  { path: "/user-details/:partyId", name: "UserDetails", component: UserDetails, props: true, beforeEnter: requirePermission("USERS_LIST_VIEW OR PARTYMGR_VIEW OR PARTYMGR_ADMIN") },
  { path: "/create-user", name: "CreateUser", component: CreateUser, beforeEnter: requirePermission("SECURITY_CREATE OR SECURITY_ADMIN") },
  { path: "/user-confirmation/:partyId", name: "UserConfirmation", component: UserConfirmation, props: true, beforeEnter: requirePermission("SECURITY_CREATE OR SECURITY_ADMIN") },
  { path: "/user-quick-setup/:partyId", name: "UserQuickSetup", component: UserQuickSetup, props: true, beforeEnter: requirePermission("SECURITY_CREATE OR SECURITY_ADMIN") },
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
  { path: "/shopify-connection-details/:id/order-sync/configure", name: "ShopifyOrderSyncConfigure", component: () => import("@/views/ShopifyOrderSyncConfigure.vue"), props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/order-sync", name: "ShopifyOrderSync", component: () => import("@/views/ShopifyOrderSync.vue"), props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/order-sync/history", name: "ShopifyOrderSyncHistory", component: () => import("@/views/ShopifyOrderSyncHistory.vue"), props: true, beforeEnter: authGuard },
  { path: "/shopify-connection-details/:id/instance-details", name: "ShopifyInstanceDetails", component: () => import("@/views/ShopifyShopDetails.vue"), props: true, beforeEnter: authGuard },
  { path: "/klaviyo", name: "Klaviyo", component: Klaviyo, beforeEnter: authGuard },
  { path: "/klaviyo/:id", name: "KlaviyoConnectionDetails", component: KlaviyoConnectionDetails, props: true, beforeEnter: authGuard },
  { path: "/netsuite", name: "NetSuite", component: NetSuite, beforeEnter: authGuard },
  { path: "/carriers", name: "Carriers", component: Carriers, beforeEnter: requirePermission("CARRIER_SETUP_VIEW") },
  { path: "/carriers/:partyId", name: "CarrierDetails", component: CarrierDetails, props: true, beforeEnter: requirePermission("CARRIER_SETUP_VIEW") },
  { path: "/netsuite/shipment-methods", name: "ShipmentMethods", component: ShipmentMethods, beforeEnter: authGuard },
  { path: "/netsuite/inventory-variances", name: "InventoryVariances", component: InventoryVariances, beforeEnter: authGuard },
  { path: "/netsuite/payment-methods", name: "PaymentMethods", component: PaymentMethods, beforeEnter: authGuard },
  { path: "/netsuite/sales-channel", name: "SalesChannel", component: SalesChannel, beforeEnter: authGuard },
  { path: "/netsuite/departments", name: "Departments", component: Departments, beforeEnter: authGuard },
  { path: "/create-product-store", name: "CreateProductStore", component: CreateProductStore, beforeEnter: authGuard },
  { path: "/product-store-onboarding", name: "ProductStoreOnboarding", component: ProductStoreOnboarding, beforeEnter: authGuard },
  { path: "/product-store-onboarding/:productStoreId", name: "ProductStoreOnboardingForStore", component: ProductStoreOnboarding, props: true, beforeEnter: authGuard },
  {
    path: "/add-configurations/:productStoreId",
    name: "AddConfigurations",
    component: AddConfigurations,
    props: true,
    beforeEnter: (to, from) => {
      logger.info("AddConfigurations beforeEnter guard", { to: to.path, from: from.path, fromName: from.name });
      if(from.path !== "/create-product-store" && from.name !== "CreateProductStore") {
        return { path: from.path || "/product-store" }
      }
    }
  },
  { path: "/login", name: "Login", component: Login },
  { path: "/reset-password", name: "ResetPassword", component: ResetPassword },
  { path: "/settings", name: "Settings", component: Settings, beforeEnter: authGuard },
  { path: "/clone-product-store", name: "CloneProductStore", component: CloneProductStore, beforeEnter: authGuard },
  { path: "/composer", name: "Composer", component: Composer, beforeEnter: authGuard },
  { path: "/workforce", name: "Workforce", component: Workforce, beforeEnter: authGuard },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
