<script setup lang="ts">
// * SystemPay (Lyra) Smartform mount. The parent has already minted a
// * form_token via /functions/v1/create-form-token; this component just
// * renders the form and reports the outcome.
import { invokeEdge } from '~/composables/useEdgeFunction'

interface Props {
  formToken: string
  // * Where to navigate after a successful payment (the IPN is the actual
  // * source of truth — this is just UX, the hash check confirms the
  // * browser-side outcome).
  successUrl: string
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'error', message: string): void }>()

const config = useRuntimeConfig()

// * `NUXT_PUBLIC_SYSTEMPAY_ENDPOINT` is stored as a bare hostname
// * (e.g. "api.systempay.fr"). Lyra's loader and the theme stylesheet both
// * need a full URL with scheme — prepend https:// here so we never end up
// * with a relative path resolving against the current origin.
const rawEndpoint = String(config.public.systempayEndpoint ?? '').trim()
const endpointUrl = (() => {
  if (!rawEndpoint) return ''
  const stripped = rawEndpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return `https://${stripped}`
})()

const publicKey = String(config.public.systempayPublicKey ?? '')
const loaded = ref(false)
const failed = ref<string | null>(null)

onMounted(async () => {
  if (!endpointUrl || !publicKey) {
    failed.value = 'systempay_not_configured'
    emit('error', failed.value)
    return
  }
  try {
    const KRGlue = (await import('@lyracom/embedded-form-glue')).default
    const { KR } = await KRGlue.loadLibrary(endpointUrl, publicKey)
    await KR.setFormConfig({ formToken: props.formToken, 'kr-language': 'fr-FR' })
    await KR.onSubmit(async (payment: any) => {
      // * UX-only confirmation; the IPN already mutates state authoritatively.
      try {
        await invokeEdge('validate-payment-hash', {
          method: 'POST',
          body: {
            clientAnswer: payment.clientAnswer,
            hash: payment.hash,
            hashKey: payment.hashKey,
          },
        })
      } catch (_) {
        /* non-fatal: server-side IPN is the source of truth */
      }
      window.location.href = props.successUrl
      return false
    })
    await KR.renderElements('#myPaymentForm')
    loaded.value = true
  } catch (err) {
    failed.value = err instanceof Error ? err.message : 'load_failed'
    emit('error', failed.value)
  }
})

useHead({
  link: endpointUrl
    ? [{ rel: 'stylesheet', href: `${endpointUrl}/static/js/krypton-client/V4.0/ext/neon-reset.min.css` }]
    : [],
})
</script>

<template>
  <div>
    <div v-if="failed" class="text-sm text-brand-secondary p-3 bg-brand-secondary/10 rounded">
      {{ failed }}
    </div>
    <!-- * One element, one class: kr-embedded and kr-smart-form are mutually
         exclusive layouts — Lyra raises CLIENT_724 if both are present. -->
    <div id="myPaymentForm" class="kr-smart-form" kr-card-form-expanded />

    <p v-if="!loaded && !failed" class="text-xs text-gray-500 mt-2">Chargement du formulaire de paiement…</p>
  </div>
</template>
