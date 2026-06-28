<script setup lang="ts">
// * Customer login / sign-up — passwordless. We email a magic link; clicking it
// * lands on /confirm, which routes the (now signed-in) customer to /account. No
// * password: the email IS the account. "Créer un compte" just captures a first
// * name (stored as full_name metadata) before sending the same magic link.
// * Guest checkout and magic-link order pages are unaffected by this.
definePageMeta({ ssr: false })

const { t } = useI18n()
const client = useSupabaseClient()
const user = useSupabaseUser()

// * Right-hand card: which tab is active ('signin' | 'signup'). Honors a
// * ?mode=signup query so the favorites prompt can land straight on sign-up.
const route = useRoute()
const mode = ref<'signin' | 'signup'>(route.query.mode === 'signup' ? 'signup' : 'signin')
// * Left teaser: which preview is shown ('orders' | 'favorites' | 'offers').
const previewTab = ref<'orders' | 'favorites' | 'offers'>('orders')

const email = ref('')
const firstName = ref('')
const loading = ref(false)
const sent = ref(false)
const errorMsg = ref<string | null>(null)

// * Already signed in → straight to the account area.
watchEffect(() => {
  if (user.value) navigateTo('/account', { replace: true })
})

async function onSubmit() {
  errorMsg.value = null
  loading.value = true
  try {
    const { error } = await client.auth.signInWithOtp({
      email: email.value.trim(),
      options: {
        // * shouldCreateUser defaults to true → first-time emails get an
        // * account automatically (role 'customer' via handle_new_user).
        // * On sign-up we also persist the first name as full_name metadata.
        data: mode.value === 'signup' && firstName.value.trim()
          ? { full_name: firstName.value.trim() }
          : undefined,
        emailRedirectTo: `${window.location.origin}/confirm`,
      },
    })
    if (error) throw error
    sent.value = true
  } catch (err: any) {
    errorMsg.value = err?.message || t('auth.errors.generic')
  } finally {
    loading.value = false
  }
}

// * Preview tab descriptors for the left marketing teaser.
const previewTabs = [
  { key: 'orders' as const, icon: 'i-lucide-package' },
  { key: 'favorites' as const, icon: 'i-lucide-heart' },
  { key: 'offers' as const, icon: 'i-lucide-tag' },
]
const featureChips = [
  { key: 'orders', icon: 'i-lucide-package' },
  { key: 'favorites', icon: 'i-lucide-heart' },
  { key: 'offers', icon: 'i-lucide-tag' },
  { key: 'secure', icon: 'i-lucide-shield-check' },
]
</script>

<template>
  <section class="max-w-6xl mx-auto px-4 py-12 lg:py-16">
    <div class="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
      <!-- ===================== Left: marketing teaser ===================== -->
      <div class="order-2 lg:order-1">
        <p class="text-xs font-bold tracking-[0.18em] uppercase text-brand-secondary">
          {{ t('account.eyebrow') }}
        </p>
        <h1 class="font-heading text-4xl sm:text-5xl font-bold leading-[1.05] text-brand-primary mt-3">
          {{ t('account.hero.title1') }}<br>{{ t('account.hero.title2') }}
        </h1>
        <div class="w-16 h-1 bg-brand-secondary rounded-full mt-4" />
        <p class="text-gray-500 dark:text-gray-400 mt-5 max-w-md leading-relaxed">
          {{ t('account.hero.subtitle') }}
        </p>

        <!-- Preview card with tabs -->
        <div class="mt-8 max-w-lg">
          <!-- Tabs -->
          <div class="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-gray-100 dark:bg-sidebar-surface">
            <button
              v-for="tab in previewTabs"
              :key="tab.key"
              type="button"
              class="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-colors"
              :class="previewTab === tab.key
                ? 'bg-brand-primary text-white shadow-card-sm'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'"
              @click="previewTab = tab.key"
            >
              <UIcon :name="tab.icon" class="w-5 h-5" />
              {{ t(`account.tabs.${tab.key}`) }}
            </button>
          </div>

          <!-- Panel -->
          <div class="mt-3 rounded-2xl bg-white dark:bg-sidebar-surface border border-black/5 dark:border-white/10 shadow-card-md overflow-hidden">
            <!-- Orders preview -->
            <div v-if="previewTab === 'orders'">
              <div class="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/10">
                <span class="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary">
                  <UIcon name="i-lucide-package" class="w-4 h-4" />
                  {{ t('account.preview.ordersTitle') }}
                </span>
                <span class="text-xs font-semibold text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-full">
                  {{ t('account.preview.ordersCount', { count: 4 }) }}
                </span>
              </div>
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-[10px] uppercase tracking-wider text-gray-400">
                    <th class="text-left font-semibold px-5 py-2">Réf.</th>
                    <th class="text-left font-semibold px-2 py-2">Articles</th>
                    <th class="text-left font-semibold px-2 py-2">Montant</th>
                    <th class="text-left font-semibold px-5 py-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="border-t border-black/5 dark:border-white/10">
                    <td class="px-5 py-3 font-semibold text-brand-primary">#ISP-0081</td>
                    <td class="px-2 py-3 text-gray-600 dark:text-gray-300">Maillot × 2, short × 2</td>
                    <td class="px-2 py-3 font-semibold">89,90 €</td>
                    <td class="px-5 py-3">
                      <span class="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <UIcon name="i-lucide-check" class="w-3 h-3" /> Livré
                      </span>
                    </td>
                  </tr>
                  <tr class="border-t border-black/5 dark:border-white/10">
                    <td class="px-5 py-3 font-semibold text-brand-primary">#ISP-0074</td>
                    <td class="px-2 py-3 text-gray-600 dark:text-gray-300">Chaussures running</td>
                    <td class="px-2 py-3 font-semibold">134,50 €</td>
                    <td class="px-5 py-3">
                      <span class="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        <UIcon name="i-lucide-truck" class="w-3 h-3" /> En transit
                      </span>
                    </td>
                  </tr>
                  <tr class="border-t border-black/5 dark:border-white/10 blur-sm select-none">
                    <td class="px-5 py-3 font-semibold text-brand-primary">#ISP-0068</td>
                    <td class="px-2 py-3 text-gray-600 dark:text-gray-300">Kit gardien complet</td>
                    <td class="px-2 py-3 font-semibold">210,00 €</td>
                    <td class="px-5 py-3">
                      <span class="inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Livré</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div class="px-5 py-3 border-t border-black/5 dark:border-white/10 text-center">
                <span class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary">
                  <UIcon name="i-lucide-lock" class="w-3.5 h-3.5" />
                  {{ t('account.preview.lockedOrders') }} →
                </span>
              </div>
            </div>

            <!-- Favorites preview -->
            <div v-else-if="previewTab === 'favorites'">
              <div class="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/10">
                <span class="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary">
                  <UIcon name="i-lucide-heart" class="w-4 h-4" />
                  {{ t('account.preview.favoritesTitle') }}
                </span>
                <span class="text-xs font-semibold text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-full">
                  {{ t('account.preview.favoritesCount', { count: 12 }) }}
                </span>
              </div>
              <div class="grid grid-cols-3 gap-3 p-4">
                <div v-for="(fav, i) in [
                  { name: 'Maillot domicile', meta: 'Nike · Football', price: '44,90 €', icon: 'i-lucide-shirt' },
                  { name: 'Predator Edge', meta: 'Adidas · Football', price: '129,00 €', icon: 'i-lucide-footprints' },
                  { name: 'Ballon Pro Liga', meta: 'Puma · Football', price: '34,95 €', icon: 'i-lucide-volleyball' },
                ]" :key="i"
                  :class="i === 2 ? 'blur-sm select-none' : ''"
                >
                  <div class="aspect-square rounded-xl bg-gray-100 dark:bg-sidebar grid place-items-center mb-2">
                    <UIcon :name="fav.icon" class="w-7 h-7 text-gray-300" />
                  </div>
                  <p class="text-xs font-semibold truncate">{{ fav.name }}</p>
                  <p class="text-[10px] text-gray-400 truncate">{{ fav.meta }}</p>
                  <p class="text-sm font-bold text-brand-primary mt-0.5">{{ fav.price }}</p>
                </div>
              </div>
              <div class="px-5 py-3 border-t border-black/5 dark:border-white/10 text-center">
                <span class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary">
                  <UIcon name="i-lucide-lock" class="w-3.5 h-3.5" />
                  {{ t('account.preview.lockedFavorites') }} →
                </span>
              </div>
            </div>

            <!-- Offers preview -->
            <div v-else>
              <div class="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/10">
                <span class="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary">
                  <UIcon name="i-lucide-tag" class="w-4 h-4" />
                  {{ t('account.preview.offersTitle') }}
                </span>
                <span class="text-xs font-semibold text-brand-secondary bg-brand-secondary/10 px-2.5 py-1 rounded-full">
                  {{ t('account.preview.offersCount', { count: 3 }) }}
                </span>
              </div>
              <ul>
                <li
                  v-for="(offer, i) in [
                    { pct: '−20%', name: 'Vente privée équipements football', meta: 'Offre exclusive membres · Expire le 30 juin', tone: 'rose' },
                    { pct: '−15%', name: 'Déstockage chaussures running', meta: 'Sur articles déjà en promotion · Expire le 15 juil.', tone: 'emerald' },
                    { pct: '−10%', name: 'Offre bienvenue membres', meta: 'Sans minimum d’achat', tone: 'sky' },
                  ]" :key="i"
                  class="flex items-center gap-3 px-5 py-3.5 border-t border-black/5 dark:border-white/10 first:border-t-0"
                  :class="i === 2 ? 'blur-sm select-none' : ''"
                >
                  <span
                    class="shrink-0 w-12 h-12 grid place-items-center rounded-xl text-sm font-bold"
                    :class="{
                      'bg-rose-100 text-rose-600': offer.tone === 'rose',
                      'bg-emerald-100 text-emerald-600': offer.tone === 'emerald',
                      'bg-sky-100 text-sky-600': offer.tone === 'sky',
                    }"
                  >{{ offer.pct }}</span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold truncate">{{ offer.name }}</p>
                    <p class="text-xs text-gray-400 truncate">{{ offer.meta }}</p>
                  </div>
                  <UIcon name="i-lucide-chevron-right" class="w-4 h-4 text-gray-300 shrink-0" />
                </li>
              </ul>
              <div class="px-5 py-3 border-t border-black/5 dark:border-white/10 text-center">
                <span class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary">
                  <UIcon name="i-lucide-lock" class="w-3.5 h-3.5" />
                  {{ t('account.preview.lockedOffers') }} →
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===================== Right: account card ===================== -->
      <div class="order-1 lg:order-2">
        <div class="bg-white dark:bg-sidebar-surface rounded-3xl shadow-card-lg p-8 sm:p-10 border border-black/5 dark:border-white/10 max-w-md mx-auto w-full">
          <div class="text-center mb-7">
            <div class="w-14 h-14 rounded-full bg-gray-100 dark:bg-sidebar grid place-items-center mx-auto">
              <UIcon name="i-lucide-user-round" class="w-6 h-6 text-brand-primary" />
            </div>
            <h2 class="font-heading text-3xl font-bold text-brand-primary mt-4">{{ t('account.card.title') }}</h2>
            <p class="text-sm text-gray-400 mt-1">{{ t('account.card.subtitle') }}</p>
          </div>

          <!-- Confirmation state -->
          <div v-if="sent" class="text-center space-y-4 py-4">
            <div class="w-14 h-14 rounded-full bg-brand-primary/10 grid place-items-center mx-auto">
              <UIcon name="i-lucide-mail-check" class="w-7 h-7 text-brand-primary" />
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-300">{{ t('account.login.sent', { email }) }}</p>
            <button
              type="button"
              class="text-xs font-medium text-brand-primary hover:underline"
              @click="sent = false"
            >
              {{ t('account.login.useAnother') }}
            </button>
          </div>

          <template v-else>
            <!-- Mode toggle -->
            <div class="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-gray-100 dark:bg-sidebar mb-6">
              <button
                type="button"
                class="py-2.5 rounded-xl text-sm font-semibold transition-colors"
                :class="mode === 'signin' ? 'bg-brand-primary text-white shadow-card-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'"
                @click="mode = 'signin'"
              >
                {{ t('account.card.signin') }}
              </button>
              <button
                type="button"
                class="py-2.5 rounded-xl text-sm font-semibold transition-colors"
                :class="mode === 'signup' ? 'bg-brand-primary text-white shadow-card-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'"
                @click="mode = 'signup'"
              >
                {{ t('account.card.signup') }}
              </button>
            </div>

            <!-- Sign-up: feature chips -->
            <div v-if="mode === 'signup'" class="grid grid-cols-2 gap-2 mb-6">
              <div
                v-for="chip in featureChips"
                :key="chip.key"
                class="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-sidebar text-xs font-medium text-gray-600 dark:text-gray-300"
              >
                <UIcon :name="chip.icon" class="w-4 h-4 text-brand-primary shrink-0" />
                {{ t(`account.features.${chip.key}`) }}
              </div>
            </div>

            <form class="space-y-5" @submit.prevent="onSubmit">
              <!-- First name (sign-up only) -->
              <label v-if="mode === 'signup'" class="block">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-200">{{ t('account.login.firstName') }}</span>
                <input
                  v-model="firstName"
                  type="text"
                  autocomplete="given-name"
                  placeholder="Jean"
                  class="mt-1.5 w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-sidebar focus:bg-white dark:focus:bg-sidebar-surface focus:ring-2 focus:ring-brand-primary focus:border-transparent focus:outline-none transition"
                >
              </label>

              <label class="block">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-200">{{ t('auth.email') }}</span>
                <input
                  v-model="email"
                  type="email"
                  required
                  autocomplete="email"
                  placeholder="vous@exemple.com"
                  class="mt-1.5 w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-sidebar focus:bg-white dark:focus:bg-sidebar-surface focus:ring-2 focus:ring-brand-primary focus:border-transparent focus:outline-none transition"
                >
              </label>

              <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

              <button
                type="submit"
                :disabled="loading"
                class="w-full py-3.5 rounded-xl bg-brand-secondary text-white font-semibold hover:brightness-95 disabled:opacity-60 transition shadow-card-sm"
              >
                {{ loading ? t('common.loading') : (mode === 'signup' ? t('account.login.create') : t('account.login.send')) }}
              </button>
            </form>

            <!-- Footer copy -->
            <div class="mt-5 text-center text-sm text-gray-400 space-y-1">
              <template v-if="mode === 'signin'">
                <p>{{ t('account.login.hint') }}</p>
                <p>
                  {{ t('account.login.noAccount') }}
                  <button type="button" class="font-semibold text-brand-primary hover:underline" @click="mode = 'signup'">
                    {{ t('account.login.createFree') }}
                  </button>
                </p>
              </template>
              <template v-else>
                <p>
                  {{ t('account.login.terms') }}
                  <NuxtLink to="/cgv" class="font-semibold text-brand-primary hover:underline">{{ t('account.login.termsLink') }}</NuxtLink>.
                </p>
                <p>
                  {{ t('account.login.haveAccount') }}
                  <button type="button" class="font-semibold text-brand-primary hover:underline" @click="mode = 'signin'">
                    {{ t('account.login.signinLink') }}
                  </button>
                </p>
              </template>
            </div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
