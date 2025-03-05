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

const authGuard = async (to: any, from: any, next: any) => {
  const authStore = useAuthStore()
  if (!authStore.isAuthenticated || !store.getters['user/isAuthenticated']) {
    await loader.present('Authenticating')
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