<script setup lang="ts">
// * Back-office login — only admin and employee roles may proceed.
// * Customers attempting to log in here are signed out with a helpful error.
import { useAuthStore } from '~/stores/auth'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const client = useSupabaseClient()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const errorMsg = ref<string | null>(null)
const loading = ref(false)

async function onSubmit() {
  errorMsg.value = null
  loading.value = true
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })
    if (error) throw error

    const uid = data.user?.id
    if (!uid) throw new Error('No user returned')

    // * Fetch profile using the freshly returned uid to avoid the reactive-ref race.
    const { data: profile, error: pErr } = await client
      .from('profiles')
      .select('id, email, full_name, role, active, created_at')
      .eq('id', uid)
      .single()
    if (pErr || !profile) throw new Error('Profile not found')

    if (profile.role !== 'admin' && profile.role !== 'employee') {
      await client.auth.signOut()
      errorMsg.value = t('auth.errors.notBackoffice')
      return
    }

    auth.profile = profile as any
    await navigateTo('/admin')
  } catch (err: any) {
    errorMsg.value =
      err?.message === 'Invalid login credentials'
        ? t('auth.errors.invalidCredentials')
        : err?.message || t('auth.errors.generic')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="min-h-[80vh] flex items-center justify-center px-4 bg-sidebar-bg text-gray-100">
    <form
      class="w-full max-w-md space-y-4 bg-sidebar-surface rounded-card shadow-card-md p-8 border border-sidebar"
      @submit.prevent="onSubmit"
    >
      <div class="text-center">
        <UIcon name="i-lucide-shield-check" class="w-8 h-8 text-brand-primary mx-auto" />
        <h1 class="font-heading text-2xl font-bold mt-2">{{ t('auth.admin.title') }}</h1>
        <p class="text-sm text-gray-400">{{ t('auth.admin.subtitle') }}</p>
      </div>

      <label class="block">
        <span class="text-sm font-medium">{{ t('auth.email') }}</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-sidebar bg-sidebar text-gray-100 focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
      </label>

      <label class="block">
        <span class="text-sm font-medium">{{ t('auth.password') }}</span>
        <input
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-sidebar bg-sidebar text-gray-100 focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
      </label>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

      <button
        type="submit"
        :disabled="loading"
        class="w-full py-2.5 rounded-card bg-brand-primary text-white font-medium hover:bg-brand-primary-dark disabled:opacity-60"
      >
        {{ loading ? t('common.loading') : t('auth.signIn') }}
      </button>

      <p class="text-xs text-center text-gray-400">
        {{ t('auth.admin.customerHint') }}
        <NuxtLink to="/login" class="text-brand-primary hover:underline">{{ t('auth.admin.customerLink') }}</NuxtLink>
      </p>
    </form>
  </section>
</template>
