<script setup lang="ts">
// * Customer login — passwordless. We email a magic link; clicking it lands on
// * /confirm, which routes the (now signed-in) customer to /account. No
// * password, no registration step: the email IS the account. Guest checkout
// * and magic-link order pages are unaffected by this.
definePageMeta({ ssr: false })

const { t } = useI18n()
const client = useSupabaseClient()
const user = useSupabaseUser()

const email = ref('')
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
</script>

<template>
  <section class="max-w-md mx-auto px-4 py-12">
    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-md p-8 border border-black/5 dark:border-sidebar">
      <div class="text-center mb-6">
        <UIcon name="i-lucide-user-round" class="w-8 h-8 text-brand-primary mx-auto" />
        <h1 class="font-heading text-2xl font-bold mt-2">{{ t('account.login.title') }}</h1>
        <p class="text-sm text-gray-500 mt-1">{{ t('account.login.subtitle') }}</p>
      </div>

      <!-- Magic link sent -->
      <div v-if="sent" class="text-center space-y-3">
        <UIcon name="i-lucide-mail-check" class="w-10 h-10 text-brand-primary mx-auto" />
        <p class="text-sm">{{ t('account.login.sent', { email }) }}</p>
        <button
          type="button"
          class="text-xs text-brand-primary hover:underline"
          @click="sent = false"
        >
          {{ t('account.login.useAnother') }}
        </button>
      </div>

      <!-- Email form -->
      <form v-else class="space-y-4" @submit.prevent="onSubmit">
        <label class="block">
          <span class="text-sm font-medium">{{ t('auth.email') }}</span>
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 dark:border-sidebar bg-white dark:bg-sidebar focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>

        <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2.5 rounded-card bg-brand-primary text-white font-medium hover:bg-brand-primary-dark disabled:opacity-60"
        >
          {{ loading ? t('common.loading') : t('account.login.send') }}
        </button>

        <p class="text-xs text-gray-400 text-center">{{ t('account.login.hint') }}</p>
      </form>
    </div>
  </section>
</template>
