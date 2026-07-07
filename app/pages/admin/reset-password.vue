<script setup lang="ts">
// * Landing page for the back-office password-recovery link (sent from the
// * "forgot password" form on /admin/login). The link signs the user in with a
// * recovery session — deliberately NOT routed through /confirm, which tears
// * down back-office sessions (that page is the customer magic-link surface).
// *
// * The email template links here with `?token_hash={{ .TokenHash }}&type=recovery`
// * and this page consumes it via verifyOtp — no PKCE flow state, so the link
// * works from any browser/device (not just the one that requested the reset)
// * and isn't invalidated by requesting a second reset. The legacy
// * `{{ .ConfirmationURL }}` flow (session exchanged by the auth module after
// * mount) still works as a fallback.
// *
// * A recovery session carries no "password" amr, so _shared/auth.ts keeps it
// * away from every admin/employee edge function; all this session can do is
// * set a new password. Accounts with 2FA enrolled must clear their TOTP code
// * first — Supabase requires AAL2 to change the password once MFA is verified.
// * After the update we sign out and send the user back to /admin/login.
definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const client = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()

type Step = 'checking' | 'mfa' | 'form' | 'invalid'
const step = ref<Step>('checking')

const password = ref('')
const passwordConfirm = ref('')
const errorMsg = ref<string | null>(null)
const loading = ref(false)

// * MFA challenge state (only for accounts with a verified TOTP factor).
const mfaFactorId = ref<string | null>(null)
const mfaCode = ref('')
const mfaError = ref<string | null>(null)

// * The link may come back with an error instead of a code (expired, reused…).
// * Supabase puts it in the hash or the query depending on the flow.
function linkHasError(): boolean {
  const hash = import.meta.client ? window.location.hash : ''
  return (
    hash.includes('error=') ||
    typeof route.query.error === 'string' ||
    typeof route.query.error_code === 'string'
  )
}

let initialized = false
async function init() {
  if (initialized) return
  initialized = true

  // * Customers must never see the back-office reset form — a recovery link is
  // * effectively a magic link, so route them to their account area instead.
  const { data: profile } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.value!.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'employee') {
    await navigateTo('/account', { replace: true })
    return
  }

  // * 2FA-enrolled accounts: the password update below is rejected at AAL1,
  // * so clear the TOTP challenge first.
  const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
    const { data } = await client.auth.mfa.listFactors()
    const totp = data?.totp?.find((f) => f.status === 'verified') ?? null
    if (totp) {
      mfaFactorId.value = totp.id
      step.value = 'mfa'
      return
    }
  }
  step.value = 'form'
}

// * The recovery session appears asynchronously (the module exchanges the URL
// * code after mount). Wait for it; give up after a few seconds → invalid link.
watchEffect(() => {
  if (user.value?.id) init()
})

onMounted(async () => {
  if (linkHasError()) {
    step.value = 'invalid'
    initialized = true
    return
  }
  // * token_hash flow: consume the OTP here, on this page's own JS — immune to
  // * email-scanner prefetches and to the PKCE same-browser constraint.
  const tokenHash = typeof route.query.token_hash === 'string' ? route.query.token_hash : null
  if (tokenHash) {
    const { error } = await client.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
    if (error && !initialized) {
      step.value = 'invalid'
      initialized = true
      return
    }
    // * Success: the recovery session lands in useSupabaseUser() and the
    // * watchEffect above runs init(). Timeout below stays as a safety net.
  }
  setTimeout(() => {
    if (step.value === 'checking' && !initialized) step.value = 'invalid'
  }, 6000)
})

async function onVerifyMfa() {
  if (!mfaFactorId.value) return
  mfaError.value = null
  loading.value = true
  try {
    const { error } = await client.auth.mfa.challengeAndVerify({
      factorId: mfaFactorId.value,
      code: mfaCode.value.trim(),
    })
    if (error) {
      mfaError.value = t('auth.mfa.invalidCode')
      return
    }
    step.value = 'form'
  } catch (err: any) {
    mfaError.value = err?.message || t('auth.errors.generic')
  } finally {
    loading.value = false
  }
}

async function onSubmit() {
  errorMsg.value = null
  if (password.value.length < 8) {
    errorMsg.value = t('auth.reset.tooShort')
    return
  }
  if (password.value !== passwordConfirm.value) {
    errorMsg.value = t('auth.errors.passwordMismatch')
    return
  }
  loading.value = true
  try {
    const { error } = await client.auth.updateUser({ password: password.value })
    if (error) throw error
    // * Drop the recovery session — the user re-logs in with the new password
    // * (and their 2FA), so the back office is only ever reached through the
    // * normal password gate.
    await client.auth.signOut()
    await navigateTo('/admin/login?reset=success', { replace: true })
  } catch (err: any) {
    errorMsg.value = err?.message || t('auth.errors.generic')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="min-h-[80vh] flex items-center justify-center px-4 bg-sidebar-bg text-gray-100">
    <!-- Waiting for the recovery session -->
    <div v-if="step === 'checking'" class="text-center text-sm text-gray-400">
      {{ t('common.loading') }}
    </div>

    <!-- Expired / invalid link -->
    <div
      v-else-if="step === 'invalid'"
      class="w-full max-w-md space-y-4 bg-sidebar-surface rounded-card shadow-card-md p-8 border border-sidebar text-center"
    >
      <UIcon name="i-lucide-link-2-off" class="w-8 h-8 text-brand-secondary mx-auto" />
      <h1 class="font-heading text-2xl font-bold">{{ t('auth.reset.invalidTitle') }}</h1>
      <p class="text-sm text-gray-400">{{ t('auth.reset.invalidBody') }}</p>
      <NuxtLink
        to="/admin/login"
        class="block w-full py-2.5 rounded-card bg-brand-primary text-white font-medium hover:bg-brand-primary-dark"
      >
        {{ t('auth.reset.backToLogin') }}
      </NuxtLink>
    </div>

    <!-- 2FA gate before the password can be changed -->
    <form
      v-else-if="step === 'mfa'"
      class="w-full max-w-md space-y-4 bg-sidebar-surface rounded-card shadow-card-md p-8 border border-sidebar"
      @submit.prevent="onVerifyMfa"
    >
      <div class="text-center">
        <UIcon name="i-lucide-smartphone" class="w-8 h-8 text-brand-primary mx-auto" />
        <h1 class="font-heading text-2xl font-bold mt-2">{{ t('auth.mfa.title') }}</h1>
        <p class="text-sm text-gray-400">{{ t('auth.mfa.subtitle') }}</p>
      </div>

      <label class="block">
        <span class="text-sm font-medium">{{ t('auth.mfa.code') }}</span>
        <input
          v-model="mfaCode"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          required
          autofocus
          placeholder="000000"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-sidebar bg-sidebar text-gray-100 text-center text-2xl tracking-[0.5em] font-mono focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
      </label>

      <p v-if="mfaError" class="text-sm text-brand-secondary">{{ mfaError }}</p>

      <button
        type="submit"
        :disabled="loading || mfaCode.length < 6"
        class="w-full py-2.5 rounded-card bg-brand-primary text-white font-medium hover:bg-brand-primary-dark disabled:opacity-60"
      >
        {{ loading ? t('common.loading') : t('auth.mfa.verify') }}
      </button>
    </form>

    <!-- New password form -->
    <form
      v-else
      class="w-full max-w-md space-y-4 bg-sidebar-surface rounded-card shadow-card-md p-8 border border-sidebar"
      @submit.prevent="onSubmit"
    >
      <div class="text-center">
        <UIcon name="i-lucide-key-round" class="w-8 h-8 text-brand-primary mx-auto" />
        <h1 class="font-heading text-2xl font-bold mt-2">{{ t('auth.reset.title') }}</h1>
        <p class="text-sm text-gray-400">{{ t('auth.reset.subtitle') }}</p>
      </div>

      <label class="block">
        <span class="text-sm font-medium">{{ t('auth.reset.newPassword') }}</span>
        <input
          v-model="password"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-sidebar bg-sidebar text-gray-100 focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
      </label>

      <label class="block">
        <span class="text-sm font-medium">{{ t('auth.confirmPassword') }}</span>
        <input
          v-model="passwordConfirm"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-sidebar bg-sidebar text-gray-100 focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
      </label>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

      <button
        type="submit"
        :disabled="loading"
        class="w-full py-2.5 rounded-card bg-brand-primary text-white font-medium hover:bg-brand-primary-dark disabled:opacity-60"
      >
        {{ loading ? t('common.loading') : t('auth.reset.submit') }}
      </button>
    </form>
  </section>
</template>
