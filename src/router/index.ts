import { createRouter, createWebHistory } from '@ionic/vue-router'
import { RouteRecordRaw } from 'vue-router'
import { Login, logger } from '@common/index'
import { useAuth } from '@common/composables/useAuth'

const CreateProductStore = () => import('@/views/product-store/CreateProductStore.vue')
const AddConfigurations = () => import('@/views/product-store/AddConfigurations.vue')
const ProductStoreDetails = () => import('@/views/product-store/ProductStoreDetails.vue')
const ProductStore = () => import('@/views/product-store/ProductStore.vue')
const NetSuite = () => import('@/views/netsuite/NetSuite.vue')
const Settings = () => import('@/views/settings/Settings.vue')
const ShipmentMethods = () => import('@/views/netsuite/ShipmentMethods.vue')
const InventoryVariances = () => import('@/views/netsuite/InventoryVariances.vue')
const PaymentMethods = () => import('@/views/netsuite/PaymentMethods.vue')
const SalesChannel = () => import('@/views/netsuite/SalesChannel.vue')
const Departments = () => import('@/views/netsuite/Departments.vue')
const ShopifyConnectionDetails = () => import('@/views/shopify/ShopifyConnectionDetails.vue')
const Klaviyo = () => import('@/views/klaviyo/Klaviyo.vue')
const KlaviyoConnectionDetails = () => import('@/views/klaviyo/KlaviyoConnectionDetails.vue')
const CloneProductStore = () => import('@/views/product-store/CloneProductStore.vue')
const Composer = () => import('@/views/agent/Composer.vue')
const Workforce = () => import('@/views/agent/Workforce.vue')
const SetupAgent = () => import('@/views/agent/SetupAgent.vue')
const Onboarding = () => import('@/views/agent/Onboarding.vue')

const authGuard = async () => {
  if (!useAuth().isAuthenticated.value) {
    return { path: '/login' }
  }
}

const routes: Array<RouteRecordRaw> = [
  { path: '/', redirect: '/product-store' },
  { path: '/product-store', name: 'ProductStore', component: ProductStore, beforeEnter: authGuard },
  { path: '/product-store-details/:productStoreId', name: 'ProductStoreDetails', component: ProductStoreDetails, props: true, beforeEnter: authGuard },
  { path: '/shopify', name: 'ShopifyConnections', component: () => import('@/views/shopify/ShopifyConnections.vue'), beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id', name: 'ShopifyConnectionDetails', component: ShopifyConnectionDetails, props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/locations', name: 'ShopifyLocations', component: () => import('@/views/shopify/ShopifyLocations.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/shipment-methods', name: 'ShopifyShipmentMethods', component: () => import('@/views/shopify/ShopifyShipmentMethods.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/payment-methods', name: 'ShopifyPaymentMethods', component: () => import('@/views/shopify/ShopifyPaymentMethods.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/sales-channels', name: 'ShopifySalesChannels', component: () => import('@/views/shopify/ShopifySalesChannels.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/product-types', name: 'ShopifyProductTypes', component: () => import('@/views/shopify/ShopifyProductTypes.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/product-sync', name: 'ShopifyProductSync', component: () => import('@/views/shopify/ShopifyProductSync.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/product-sync/history', name: 'ShopifyProductSyncHistory', component: () => import('@/views/shopify/ShopifyProductSyncHistory.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/product-sync/upgrade-assistant', name: 'ShopifyProductSyncUpgradeAssistant', component: () => import('@/views/shopify/ShopifyProductSyncUpgradeAssistant.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/instance-details', name: 'ShopifyInstanceDetails', component: () => import('@/views/shopify/ShopifyShopDetails.vue'), props: true, beforeEnter: authGuard },
  { path: '/klaviyo', name: 'Klaviyo', component: Klaviyo, beforeEnter: authGuard },
  { path: '/klaviyo/:id', name: 'KlaviyoConnectionDetails', component: KlaviyoConnectionDetails, props: true, beforeEnter: authGuard },
  { path: '/netsuite', name: 'NetSuite', component: NetSuite, beforeEnter: authGuard },
  { path: '/netsuite/shipment-methods', name: 'ShipmentMethods', component: ShipmentMethods, beforeEnter: authGuard },
  { path: '/netsuite/inventory-variances', name: 'InventoryVariances', component: InventoryVariances, beforeEnter: authGuard },
  { path: '/netsuite/payment-methods', name: 'PaymentMethods', component: PaymentMethods, beforeEnter: authGuard },
  { path: '/netsuite/sales-channel', name: 'SalesChannel', component: SalesChannel, beforeEnter: authGuard },
  { path: '/netsuite/departments', name: 'Departments', component: Departments, beforeEnter: authGuard },
  { path: '/create-product-store', name: 'CreateProductStore', component: CreateProductStore, beforeEnter: authGuard },
  {
    path: '/add-configurations/:productStoreId',
    name: 'AddConfigurations',
    component: AddConfigurations,
    props: true,
    beforeEnter: (to, from) => {
      logger.info("AddConfigurations beforeEnter guard", { to: to.path, from: from.path, fromName: from.name });
      if (from.path !== '/create-product-store' && from.name !== 'CreateProductStore') {
        return { path: from.path || '/product-store' }
      }
    }
  },
  { path: '/login', name: 'Login', component: Login },
  { path: '/settings', name: 'Settings', component: Settings, beforeEnter: authGuard },
  { path: '/clone-product-store', name: 'CloneProductStore', component: CloneProductStore, beforeEnter: authGuard },
  { path: '/composer', name: 'Composer', component: Composer, beforeEnter: authGuard },
  { path: '/workforce', name: 'Workforce', component: Workforce, beforeEnter: authGuard },
  { path: '/setup-agent', name: 'SetupAgent', component: SetupAgent, beforeEnter: authGuard },
  { path: '/onboarding', name: 'Onboarding', component: Onboarding, beforeEnter: authGuard },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
