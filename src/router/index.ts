import { createRouter, createWebHistory } from "@ionic/vue-router";
import { RouteRecordRaw } from "vue-router";
import store from "@/store"
import CreateProductStore from "@/views/CreateProductStore.vue";
import AddConfigurations from "@/views/AddConfigurations.vue";
import ProductStoreDetails from "@/views/ProductStoreDetails.vue";
import ProductStore from "@/views/ProductStore.vue";
import NetSuite from "@/views/NetSuite.vue";
import Settings from "@/views/Settings.vue"
import ShipmentMethods from "@/views/ShipmentMethods.vue"
import InventoryVariances from "@/views/InventoryVariances.vue";
import PaymentMethods from "@/views/PaymentMethods.vue";
import SalesChannel from "@/views/SalesChannel.vue";
import Departments from "@/views/Departments.vue";
import { DxpLogin, useAuthStore } from "@hotwax/dxp-components";
import { loader } from '@/user-utils';
import ShopifyConnectionDetails from "@/views/ShopifyConnectionDetails.vue";
import Klaviyo from "@/views/Klaviyo.vue";
import KlaviyoConnectionDetails from "@/views/KlaviyoConnectionDetails.vue";
import { translate } from "@/i18n";

const authGuard = async (to: any, from: any, next: any) => {
  const authStore = useAuthStore()
  if (!authStore.isAuthenticated || !store.getters['user/isAuthenticated']) {
    await loader.present(translate("Authenticating"))
    // TODO use authenticate() when support is there
    const redirectUrl = window.location.origin + '/login'
    window.location.href = `${process.env.VUE_APP_LOGIN_URL}?redirectUrl=${redirectUrl}`
    loader.dismiss()
  }
  next()
};

const loginGuard = (to: any, from: any, next: any) => {
  const authStore = useAuthStore()
  if (authStore.isAuthenticated && !to.query?.token && !to.query?.oms) {
    next('/')
  }
  next();
};

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    redirect: "/product-store"
  },
  {
    path: '/product-store',
    name: 'ProductStore',
    component: ProductStore,
    beforeEnter: authGuard,
  },
  {
    path: "/product-store-details/:productStoreId",
    name: "ProductStoreDetails",
    component: ProductStoreDetails,
    props: true,
    beforeEnter: authGuard,
  },
  {
    path: "/shopify",
    name: "ShopifyConnections",
    component: () => import("@/views/ShopifyConnections.vue"),
    beforeEnter: authGuard,
  },
  {
    path: '/shopify-connection-details/:id',
    name: 'ShopifyConnectionDetails',
    component: ShopifyConnectionDetails,
    props: true,
    beforeEnter: authGuard,
  },
  {
    path: '/shopify-connection-details/:id/locations',
    name: 'ShopifyLocations',
    component: () => import('@/views/ShopifyLocations.vue'),
    props: true,
    beforeEnter: authGuard,
  },
  {
    path: '/shopify-connection-details/:id/shipment-methods',
    name: 'ShopifyShipmentMethods',
    component: () => import('@/views/ShopifyShipmentMethods.vue'),
    props: true,
    beforeEnter: authGuard,
  },
  {
    path: '/shopify-connection-details/:id/payment-methods',
    name: 'ShopifyPaymentMethods',
    component: () => import('@/views/ShopifyPaymentMethods.vue'),
    props: true,
    beforeEnter: authGuard,
  },
  {
    path: '/shopify-connection-details/:id/sales-channels',
    name: 'ShopifySalesChannels',
    component: () => import('@/views/ShopifySalesChannels.vue'),
    props: true,
    beforeEnter: authGuard,
  },
  {
    path: '/shopify-connection-details/:id/product-types',
    name: 'ShopifyProductTypes',
    component: () => import('@/views/ShopifyProductTypes.vue'),
    props: true,
    beforeEnter: authGuard,
  },
  {
    path: '/shopify-connection-details/:id/product-sync',
    name: 'ShopifyProductSync',
    component: () => import('@/views/ShopifyProductSync.vue'),
    props: true,
    beforeEnter: authGuard,
  },
  {
    path: '/shopify-connection-details/:id/product-sync/history',
    name: 'ShopifyProductSyncHistory',
    component: () => import('@/views/ShopifyProductSyncHistory.vue'),
    props: true,
    beforeEnter: authGuard,
  },
  {
    path: '/shopify-connection-details/:id/product-sync/upgrade-assistant',
    name: 'ShopifyProductSyncUpgradeAssistant',
    component: () => import('@/views/ShopifyProductSyncUpgradeAssistant.vue'),
    props: true,
    beforeEnter: authGuard,
  },
  {
    path: '/shopify-connection-details/:id/instance-details',
    name: 'ShopifyInstanceDetails',
    component: () => import('@/views/ShopifyShopDetails.vue'),
    props: true,
    beforeEnter: authGuard,
  },
  {
    path: "/klaviyo",
    name: "Klaviyo",
    component: Klaviyo,
    beforeEnter: authGuard,
  },
  {
    path: "/klaviyo/:id",
    name: "KlaviyoConnectionDetails",
    component: KlaviyoConnectionDetails,
    props: true,
    beforeEnter: authGuard,
  },
  {
    path: "/netsuite",
    name: "NetSuite",
    component: NetSuite,
    beforeEnter: authGuard,
  },
  {
    path: "/netsuite/shipment-methods",
    name: "ShipmentMethods",
    component: ShipmentMethods,
    beforeEnter: authGuard,
  },
  // {
  //   path: "/netsuite/facilities",
  //   name: "Facilities",
  //   component: Facilities,
  //   beforeEnter: authGuard,
  // },
  {
    path: "/netsuite/inventory-variances",
    name: "InventoryVariances",
    component: InventoryVariances,
    beforeEnter: authGuard,
  },
  {
    path: "/netsuite/payment-methods",
    name: "PaymentMethods",
    component: PaymentMethods,
    beforeEnter: authGuard,
  },
  {
    path: "/netsuite/sales-channel",
    name: "SalesChannel",
    component: SalesChannel,
    beforeEnter: authGuard,
  },
  {
    path: "/netsuite/departments",
    name: "Departments",
    component: Departments,
    beforeEnter: authGuard,
  },
  {
    path: "/create-product-store",
    name: "CreateProductStore",
    component: CreateProductStore
  },
  {
    path: "/add-configurations/:productStoreId",
    name: "AddConfigurations",
    component: AddConfigurations,
    props: true,
    beforeEnter: (to, from, next) => {
      if(from.path === "/create-product-store") next()
      else router.push(from.path)
    }
  },
  {
    path: "/login",
    name: "Login",
    component: DxpLogin,
    beforeEnter: loginGuard
  },
  {
    path: "/settings",
    name: "Settings",
    component: Settings,
    beforeEnter: authGuard
  },
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router
