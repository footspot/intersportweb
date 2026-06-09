<script setup lang="ts">
// * /contact — public contact page. Data comes from the singleton contact_info.
import { useContactStore } from '~/stores/contact'
import { invokeEdge } from '~/composables/useEdgeFunction'

const { t } = useI18n()
const contact = useContactStore()

await useAsyncData('public-contact', async () => { await contact.fetch(); return true })

// * SEO — contact page meta.
useSeoMeta({
  title: () => `${t('contactPage.title', 'Contact')} — Intersport Club IDF`,
  description:
    'Contactez Intersport Club IDF pour vos commandes d\'équipements et textiles personnalisés de club sportif.',
  ogTitle: 'Contact — Intersport Club IDF',
  twitterCard: 'summary',
})

const info = computed(() => contact.info)

// * Contact form — posts to the rate-limited `contact-message` edge function.
const form = reactive({ name: '', email: '', subject: '', message: '' })
const sending = ref(false)
const sent = ref(false)
const formError = ref('')

const inputClass =
  'w-full rounded-lg border border-gray-200 dark:border-sidebar bg-gray-50 dark:bg-sidebar px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition'

function validEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

async function submitForm() {
  formError.value = ''
  if (!form.name.trim() || !form.email.trim()) {
    formError.value = t('contactPage.form.required')
    return
  }
  if (!validEmail(form.email)) {
    formError.value = t('contactPage.form.invalidEmail')
    return
  }
  sending.value = true
  const { error } = await invokeEdge('contact-message', {
    method: 'POST',
    body: { name: form.name, email: form.email, subject: form.subject, message: form.message },
  })
  sending.value = false
  if (error) {
    formError.value =
      error.code === 'rate_limited'
        ? t('contactPage.form.rateLimited')
        : t('contactPage.form.error')
    return
  }
  sent.value = true
  form.name = ''
  form.email = ''
  form.subject = ''
  form.message = ''
}

// * Build a Google Maps directions URL from the stored address so the
// * "Itinéraire" button always opens the user's chosen maps app.
const directionsHref = computed(() => {
  const a = info.value?.address?.trim()
  if (!a) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}`
})

const hasAnyContact = computed(
  () => !!(info.value?.address || info.value?.phone),
)
</script>

<template>
  <div class="bg-white dark:bg-sidebar-bg">
    <!-- * Hero — gradient banner with subtle radial glow + Intersport-red accent. -->
    <section class="relative">
      <div class="absolute inset-0 bg-gradient-to-br from-brand-primary via-brand-primary-dark to-sidebar" />
      <div
        class="absolute inset-0 opacity-40"
        style="background:
          radial-gradient(900px 400px at 12% 0%, rgba(255,255,255,0.18), transparent 60%),
          radial-gradient(700px 350px at 95% 100%, rgba(227,11,12,0.45), transparent 65%);"
      />
      <div
        class="absolute inset-0 mix-blend-overlay opacity-[0.07]"
        style="background-image: radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px); background-size: 18px 18px;"
      />

      <div class="relative max-w-6xl mx-auto px-6 pt-20 pb-28 md:pt-28 md:pb-36">
        <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium tracking-wider uppercase text-white/90 bg-white/10 backdrop-blur-sm border border-white/20">
          <span class="w-1.5 h-1.5 rounded-full bg-brand-secondary animate-pulse" />
          {{ t('contactPage.kicker') }}
        </span>
        <h1 class="font-heading mt-5 text-5xl md:text-7xl font-bold text-white leading-[1.05] tracking-tight">
          {{ t('contactPage.title') }}<span class="text-brand-secondary">.</span>
        </h1>
        <p class="mt-4 text-lg md:text-xl text-white/75 max-w-xl">
          {{ t('contactPage.subtitle') }}
        </p>
      </div>

      <!-- * Wave divider — extends 1px below to absorb sub-pixel gap that otherwise leaks the gradient. -->
      <svg class="block absolute -bottom-px left-0 w-full text-white dark:text-sidebar-bg pointer-events-none" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true">
        <path fill="currentColor" d="M0,64 C360,16 720,16 1080,48 C1260,64 1380,72 1440,64 L1440,80 L0,80 Z" />
      </svg>
    </section>

    <section class="max-w-6xl mx-auto px-6 -mt-16 md:-mt-20 relative z-10 pb-20 space-y-10">
      <!-- * Action cards — float over the hero edge. Hover lift + accent corner. -->
      <div v-if="hasAnyContact" class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        <a
          v-if="info?.address"
          :href="directionsHref ?? undefined"
          target="_blank"
          rel="noopener noreferrer"
          class="group relative overflow-hidden rounded-card bg-white dark:bg-sidebar-surface border border-gray-100 dark:border-sidebar shadow-card-md hover:shadow-card-lg hover:-translate-y-1 transition-all duration-300 p-6"
        >
          <div class="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-primary/10 group-hover:bg-brand-primary/20 transition-colors" />
          <div class="relative">
            <div class="w-11 h-11 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mb-4 group-hover:bg-brand-primary group-hover:text-white transition-colors">
              <UIcon name="i-lucide-map-pin" class="w-5 h-5" />
            </div>
            <h3 class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{{ t('contactPage.address') }}</h3>
            <p class="font-medium text-gray-900 dark:text-white whitespace-pre-line leading-snug">{{ info.address }}</p>
            <span class="inline-flex items-center gap-1 mt-3 text-sm font-medium text-brand-primary group-hover:gap-2 transition-all">
              {{ t('contactPage.directions') }}
              <UIcon name="i-lucide-arrow-up-right" class="w-4 h-4" />
            </span>
          </div>
        </a>

        <a
          v-if="info?.phone"
          :href="`tel:${info.phone}`"
          class="group relative overflow-hidden rounded-card bg-white dark:bg-sidebar-surface border border-gray-100 dark:border-sidebar shadow-card-md hover:shadow-card-lg hover:-translate-y-1 transition-all duration-300 p-6"
        >
          <div class="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-green/10 group-hover:bg-brand-green/20 transition-colors" />
          <div class="relative">
            <div class="w-11 h-11 rounded-xl bg-brand-green/10 text-brand-green flex items-center justify-center mb-4 group-hover:bg-brand-green group-hover:text-white transition-colors">
              <UIcon name="i-lucide-phone" class="w-5 h-5" />
            </div>
            <h3 class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{{ t('contactPage.phone') }}</h3>
            <p class="font-medium text-gray-900 dark:text-white tracking-wide">{{ info.phone }}</p>
            <span class="inline-flex items-center gap-1 mt-3 text-sm font-medium text-brand-green group-hover:gap-2 transition-all">
              {{ t('contactPage.callNow') }}
              <UIcon name="i-lucide-arrow-up-right" class="w-4 h-4" />
            </span>
          </div>
        </a>

      </div>

      <div v-else class="rounded-card bg-gray-50 dark:bg-sidebar-surface border border-gray-100 dark:border-sidebar p-10 text-center text-gray-500">
        {{ t('contactPage.empty') }}
      </div>

      <!-- * Contact form — rate-limited submission to the business inbox. -->
      <div class="rounded-card bg-white dark:bg-sidebar-surface border border-gray-100 dark:border-sidebar shadow-card-md p-6 md:p-8">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-11 h-11 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            <UIcon name="i-lucide-send" class="w-5 h-5" />
          </div>
          <div>
            <h2 class="font-heading text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
              {{ t('contactPage.form.title') }}
            </h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('contactPage.form.subtitle') }}</p>
          </div>
        </div>

        <div
          v-if="sent"
          class="rounded-xl bg-brand-green/10 border border-brand-green/30 text-brand-green px-4 py-3 text-sm flex items-center gap-2 mb-5"
        >
          <UIcon name="i-lucide-circle-check" class="w-5 h-5 shrink-0" />
          {{ t('contactPage.form.success') }}
        </div>

        <form class="space-y-4" @submit.prevent="submitForm">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                {{ t('contactPage.form.name') }} <span class="text-brand-secondary">*</span>
              </label>
              <input v-model="form.name" type="text" maxlength="120" :class="inputClass" :placeholder="t('contactPage.form.name')">
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                {{ t('contactPage.form.email') }} <span class="text-brand-secondary">*</span>
              </label>
              <input v-model="form.email" type="email" :class="inputClass" placeholder="email@exemple.fr">
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
              {{ t('contactPage.form.subject') }}
            </label>
            <input v-model="form.subject" type="text" maxlength="200" :class="inputClass" :placeholder="t('contactPage.form.subject')">
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
              {{ t('contactPage.form.message') }}
            </label>
            <textarea v-model="form.message" rows="5" maxlength="5000" :class="[inputClass, 'resize-y']" :placeholder="t('contactPage.form.message')" />
          </div>

          <p v-if="formError" class="text-sm text-brand-secondary flex items-center gap-1.5">
            <UIcon name="i-lucide-circle-alert" class="w-4 h-4 shrink-0" />
            {{ formError }}
          </p>

          <div class="flex justify-end">
            <button
              type="submit"
              :disabled="sending"
              class="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <UIcon :name="sending ? 'i-lucide-loader-circle' : 'i-lucide-send'" :class="['w-4 h-4', sending && 'animate-spin']" />
              {{ sending ? t('contactPage.form.sending') : t('contactPage.form.send') }}
            </button>
          </div>
        </form>
      </div>

      <!-- * "Qui sommes-nous ?" — editorial card with red accent bar + oversized quote glyph. -->
      <article
        v-if="info?.who_we_are"
        class="relative rounded-card bg-white dark:bg-sidebar-surface border border-gray-100 dark:border-sidebar shadow-card-sm overflow-hidden"
      >
        <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brand-primary to-brand-secondary" />
        <UIcon
          name="i-lucide-quote"
          class="absolute -top-4 right-6 w-28 h-28 text-brand-primary/5 dark:text-white/5 rotate-180"
        />
        <div class="relative p-8 md:p-12">
          <div class="flex items-center gap-2 mb-3">
            <span class="h-px w-8 bg-brand-secondary" />
            <span class="text-xs uppercase tracking-[0.2em] font-medium text-brand-secondary">Intersport</span>
          </div>
          <h2 class="font-heading text-2xl md:text-3xl font-bold mb-5 text-gray-900 dark:text-white">
            {{ t('contactPage.whoWeAre') }}
          </h2>
          <p class="whitespace-pre-line leading-relaxed text-gray-700 dark:text-gray-200 text-base md:text-lg max-w-3xl">
            {{ info.who_we_are }}
          </p>
        </div>
      </article>

      <!-- * Map block — full-width with floating address pill + branded header strip. -->
      <div class="rounded-card overflow-hidden border border-gray-100 dark:border-sidebar shadow-card-md bg-white dark:bg-sidebar-surface">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-sidebar">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center">
              <UIcon name="i-lucide-navigation" class="w-4 h-4" />
            </div>
            <div>
              <p class="font-heading font-semibold text-gray-900 dark:text-white">{{ t('contactPage.findUs') }}</p>
              <p v-if="info?.address" class="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs md:max-w-md">
                {{ info.address.split('\n')[0] }}
              </p>
            </div>
          </div>
          <a
            v-if="directionsHref"
            :href="directionsHref"
            target="_blank"
            rel="noopener noreferrer"
            class="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark transition-colors"
          >
            <UIcon name="i-lucide-arrow-up-right" class="w-4 h-4" />
            {{ t('contactPage.directions') }}
          </a>
        </div>

        <div class="relative">
          <iframe
            v-if="info?.google_maps_embed_url"
            :src="info.google_maps_embed_url"
            class="w-full h-[420px] md:h-[500px] block"
            loading="lazy"
            allowfullscreen
            referrerpolicy="no-referrer-when-downgrade"
          />
          <div
            v-else
            class="w-full h-[420px] md:h-[500px] bg-gradient-to-br from-gray-50 to-gray-100 dark:from-sidebar dark:to-sidebar-bg flex flex-col items-center justify-center text-gray-400 gap-3"
          >
            <UIcon name="i-lucide-map" class="w-14 h-14" />
            <p class="text-sm">—</p>
          </div>
        </div>
      </div>

      <!-- * Social — refined section: small label + chip row, centered. -->
      <div v-if="info?.social_media?.length" class="text-center pt-4">
        <div class="inline-flex items-center gap-3 mb-5">
          <span class="h-px w-8 bg-gray-300 dark:bg-sidebar" />
          <span class="text-xs uppercase tracking-[0.2em] font-medium text-gray-500 dark:text-gray-400">
            {{ t('contactPage.social') }}
          </span>
          <span class="h-px w-8 bg-gray-300 dark:bg-sidebar" />
        </div>
        <div class="flex justify-center">
          <ContactSocialMediaIcons :links="info.social_media" />
        </div>
      </div>
    </section>
  </div>
</template>
