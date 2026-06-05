// * Registers vue-konva globally (v-stage / v-layer / v-image / v-text / v-transformer).
// * Client-only: Konva touches `window`/`document` at import, so it must never
// * run during SSR. Used by the admin product logo-overlay editor.
import VueKonva from 'vue-konva'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(VueKonva)
})
