import { createRouter, createWebHistory } from "@ionic/vue-router";
import { RouteRecordRaw } from "vue-router";
import Login from "@/views/Login.vue"
import store from "@/store"
import Tabs from "@/views/Tabs.vue"
import CreateProductStore from "@/views/CreateProductStore.vue";
import AddConfigurations from "@/views/AddConfigurations.vue";
import ProductStoreDetails from "@/views/ProductStoreDetails.vue";

const authGuard = (to: any, from: any, next: any) => {
  if (store.getters["user/isAuthenticated"]) {
    next()
  } else {
    next("/login")
  }
};

const loginGuard = (to: any, from: any, next: any) => {
  if (!store.getters["user/isAuthenticated"]) {
    next()
  } else {
    next("/")
  }
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
    component: Login,
    beforeEnter: loginGuard
  },
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router