import { createRouter, createWebHistory } from "@ionic/vue-router";
import { RouteRecordRaw } from "vue-router";
import store from "@/store"
import Tabs from "@/views/Tabs.vue"
import CreateProductStore from "@/views/CreateProductStore.vue";
import AddConfigurations from "@/views/AddConfigurations.vue";
import ProductStoreDetails from "@/views/ProductStoreDetails.vue";
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
    redirect: "/tabs/product-store"
  },
  {
    path: "/tabs",
    component: Tabs,
    children: [
      {
        path: "",
        redirect: "/tabs/product-store"
      },
      {
        path: "product-store",
        name: "ProductStore",
        component: () => import("@/views/ProductStore.vue")
      },
      {
        path: "settings",
        name: "Settings",
        component: () => import("@/views/Settings.vue")
      }
    ],
    beforeEnter: authGuard
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
    path: "/product-store-details/:productStoreId",
    name: "ProductStoreDetails",
    component: ProductStoreDetails,
    props: true
  },
  {
    path: "/login",
    name: "Login",
    component: DxpLogin,
    beforeEnter: loginGuard
  },
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router