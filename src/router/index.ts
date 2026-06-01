import { createRouter, createWebHistory } from '@ionic/vue-router'
import { RouteRecordRaw } from 'vue-router'
import { Login } from '@common'
import { useAuth } from '@common/composables/useAuth'

const CreateProductStore = () => import('@/views/CreateProductStore.vue')
const AddConfigurations = () => import('@/views/AddConfigurations.vue')
const ProductStoreDetails = () => import('@/views/ProductStoreDetails.vue')
const ProductStore = () => import('@/views/ProductStore.vue')
const NetSuite = () => import('@/views/NetSuite.vue')
const Settings = () => import('@/views/Settings.vue')
const ShipmentMethods = () => import('@/views/ShipmentMethods.vue')
const InventoryVariances = () => import('@/views/InventoryVariances.vue')
const PaymentMethods = () => import('@/views/PaymentMethods.vue')
const SalesChannel = () => import('@/views/SalesChannel.vue')
const Departments = () => import('@/views/Departments.vue')
const ShopifyConnectionDetails = () => import('@/views/ShopifyConnectionDetails.vue')
const Klaviyo = () => import('@/views/Klaviyo.vue')
const KlaviyoConnectionDetails = () => import('@/views/KlaviyoConnectionDetails.vue')

const authGuard = async () => {
  if (!useAuth().isAuthenticated.value) {
    return { path: '/login' }
  }
}

const routes: Array<RouteRecordRaw> = [
  { path: '/', redirect: '/product-store' },
  { path: '/product-store', name: 'ProductStore', component: ProductStore, beforeEnter: authGuard },
  { path: '/product-store-details/:productStoreId', name: 'ProductStoreDetails', component: ProductStoreDetails, props: true, beforeEnter: authGuard },
  { path: '/shopify', name: 'ShopifyConnections', component: () => import('@/views/ShopifyConnections.vue'), beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id', name: 'ShopifyConnectionDetails', component: ShopifyConnectionDetails, props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/locations', name: 'ShopifyLocations', component: () => import('@/views/ShopifyLocations.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/shipment-methods', name: 'ShopifyShipmentMethods', component: () => import('@/views/ShopifyShipmentMethods.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/payment-methods', name: 'ShopifyPaymentMethods', component: () => import('@/views/ShopifyPaymentMethods.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/sales-channels', name: 'ShopifySalesChannels', component: () => import('@/views/ShopifySalesChannels.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/product-types', name: 'ShopifyProductTypes', component: () => import('@/views/ShopifyProductTypes.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/product-sync', name: 'ShopifyProductSync', component: () => import('@/views/ShopifyProductSync.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/product-sync/history', name: 'ShopifyProductSyncHistory', component: () => import('@/views/ShopifyProductSyncHistory.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/product-sync/upgrade-assistant', name: 'ShopifyProductSyncUpgradeAssistant', component: () => import('@/views/ShopifyProductSyncUpgradeAssistant.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/instance-details', name: 'ShopifyInstanceDetails', component: () => import('@/views/ShopifyShopDetails.vue'), props: true, beforeEnter: authGuard },
  { path: '/klaviyo', name: 'Klaviyo', component: Klaviyo, beforeEnter: authGuard },
  { path: '/klaviyo/:id', name: 'KlaviyoConnectionDetails', component: KlaviyoConnectionDetails, props: true, beforeEnter: authGuard },
  { path: '/netsuite', name: 'NetSuite', component: NetSuite, beforeEnter: authGuard },
  { path: '/netsuite/shipment-methods', name: 'ShipmentMethods', component: ShipmentMethods, beforeEnter: authGuard },
  { path: '/netsuite/inventory-variances', name: 'InventoryVariances', component: InventoryVariances, beforeEnter: authGuard },
  { path: '/netsuite/payment-methods', name: 'PaymentMethods', component: PaymentMethods, beforeEnter: authGuard },
  { path: '/netsuite/sales-channel', name: 'SalesChannel', component: SalesChannel, beforeEnter: authGuard },
  { path: '/netsuite/departments', name: 'Departments', component: Departments, beforeEnter: authGuard },
  { path: '/create-product-store', name: 'CreateProductStore', component: CreateProductStore },
  {
    path: '/add-configurations/:productStoreId',
    name: 'AddConfigurations',
    component: AddConfigurations,
    props: true,
    beforeEnter: (to, from) => {
      if (from.path !== '/create-product-store') return { path: from.path }
    }
  },
  { path: '/login', name: 'Login', component: Login },
  { path: '/settings', name: 'Settings', component: Settings, beforeEnter: authGuard },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
