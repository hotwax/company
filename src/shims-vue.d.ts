/// <reference types="vite/client" />
/// <reference types="pinia-plugin-persistedstate" />

declare module '*.vue' {
  import { defineComponent } from 'vue'
  const component: ReturnType<typeof defineComponent>
  export default component
}
