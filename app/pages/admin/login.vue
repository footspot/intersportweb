<script setup lang="ts">
// * Back-office login — only admin and employee roles may proceed.
// * Customers attempting to log in here are signed out with a helpful error.
// *
// * Two-step flow: password first, then — if the account has a verified 2FA
// * factor — a one-time code from the authenticator app. The MFA step also
// * resumes on mount when a half-finished (AAL1) session is already present.
import { useAuthStore, type Profile } from '~/stores/auth'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const client = useSupabaseClient()
const auth = useAuthStore()

type Step = 'credentials' | 'mfa' | 'forgot'
const step = ref<Step>('credentials')

const email = ref('')
const password = ref('')
const errorMsg = ref<string | null>(null)
const successMsg = ref<string | null>(null)
const loading = ref(false)

// * Forgot-password state — the link emails a recovery URL that lands on
// * /admin/reset-password (NOT /confirm, which tears down back-office sessions).
const forgotSent = ref(false)

// * MFA challenge state
const mfaFactorId = ref<string | null>(null)
const mfaCode = ref('')
const mfaError = ref<string | null>(null)

// * Resolve the caller's profile and route into the back office. Shared by the
// * password step (no-MFA accounts) and the MFA step (after a verified code).
async function finishLogin(): Promise<boolean> {
  await auth.fetchProfile()
  const profile = auth.profile
  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    await client.auth.signOut()
    auth.profile = null
    errorMsg.value = t('auth.errors.notBackoffice')
    step.value = 'credentials'
    return false
  }
  await navigateTo('/admin')
  return true
}

// * Switch to the MFA step, picking up the account's verified TOTP factor.
async function enterMfaStep(): Promise<boolean> {
  const { data, error } = await client.auth.mfa.listFactors()
  const totp = data?.totp?.find((f) => f.status === 'verified') ?? null
  if (error || !totp) return false
  mfaFactorId.value = totp.id
  mfaCode.value = ''
  mfaError.value = null
  step.value = 'mfa'
  return true
}

const route = useRoute()

// * On arrival, resume any session that signed in but never cleared 2FA.
onMounted(async () => {
  // * Bounced here from the customer magic-link flow (/confirm) because the
  // * account is back-office — back-office must sign in with a password here.
  if (route.query.error === 'use_admin_login') {
    errorMsg.value = t('auth.errors.useAdminLogin')
  }
  // * Back from a completed password reset on /admin/reset-password.
  if (route.query.reset === 'success') {
    successMsg.value = t('auth.reset.done')
  }
  const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  if (data?.currentLevel === 'aal1' && data?.nextLevel === 'aal2') {
    await enterMfaStep()
  }
})

// * Send the password-recovery email. Success copy is deliberately vague
// * ("if an account exists…") so the form can't be used to probe for emails.
async function onSendReset() {
  errorMsg.value = null
  loading.value = true
  try {
    const { error } = await client.auth.resetPasswordForEmail(email.value.trim(), {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    })
    if (error) throw error
    forgotSent.value = true
  } catch (err: any) {
    errorMsg.value = err?.message || t('auth.errors.generic')
  } finally {
    loading.value = false
  }
}

function openForgot() {
  errorMsg.value = null
  successMsg.value = null
  forgotSent.value = false
  step.value = 'forgot'
}

function backToCredentials() {
  errorMsg.value = null
  forgotSent.value = false
  step.value = 'credentials'
}

async function onSubmit() {
  errorMsg.value = null
  successMsg.value = null
  loading.value = true
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })
    if (error) throw error
    if (!data.user?.id) throw new Error('No user returned')

    // * Role check first — works at AAL1 (RLS keys off auth.uid()).
    const { data: profileRow, error: pErr } = await client
      .from('profiles')
      .select('id, email, full_name, role, active, created_at')
      .eq('id', data.user.id)
      .single()
    if (pErr || !profileRow) throw new Error('Profile not found')
    const profile = profileRow as unknown as Profile

    if (profile.role !== 'admin' && profile.role !== 'employee') {
      await client.auth.signOut()
      errorMsg.value = t('auth.errors.notBackoffice')
      return
    }

    // * If the account has a verified 2FA factor, the session is still AAL1 —
    // * require the authenticator code before letting them into the back office.
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
      if (await enterMfaStep()) return
    }

    auth.profile = profile
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
    // * Session is now AAL2 — load the profile and enter the back office.
    await finishLogin()
  } catch (err: any) {
    mfaError.value = err?.message || t('auth.errors.generic')
  } finally {
    loading.value = false
  }
}

// * "Use a different account" — drop the half-finished session, back to step 1.
async function cancelMfa() {
  await client.auth.signOut()
  auth.profile = null
  mfaFactorId.value = null
  mfaCode.value = ''
  mfaError.value = null
  password.value = ''
  step.value = 'credentials'
}
</script>

<template>
  <section class="min-h-[80vh] flex items-center justify-center px-4 bg-sidebar-bg text-gray-100">
    <!-- Step 1 — credentials -->
    <form
      v-if="step === 'credentials'"
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
      <p v-if="successMsg" class="text-sm text-emerald-400">{{ successMsg }}</p>

      <button
        type="submit"
        :disabled="loading"
        class="w-full py-2.5 rounded-card bg-brand-primary text-white font-medium hover:bg-brand-primary-dark disabled:opacity-60"
      >
        {{ loading ? t('common.loading') : t('auth.signIn') }}
      </button>

      <button
        type="button"
        class="w-full text-xs text-center text-gray-400 hover:text-gray-200"
        @click="openForgot"
      >
        {{ t('auth.forgotPassword') }}
      </button>

    </form>

    <!-- Forgot password — email a recovery link -->
    <form
      v-else-if="step === 'forgot'"
      class="w-full max-w-md space-y-4 bg-sidebar-surface rounded-card shadow-card-md p-8 border border-sidebar"
      @submit.prevent="onSendReset"
    >
      <div class="text-center">
        <UIcon name="i-lucide-key-round" class="w-8 h-8 text-brand-primary mx-auto" />
        <h1 class="font-heading text-2xl font-bold mt-2">{{ t('auth.forgot.title') }}</h1>
        <p class="text-sm text-gray-400">{{ t('auth.forgot.subtitle') }}</p>
      </div>

      <template v-if="!forgotSent">
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

        <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2.5 rounded-card bg-brand-primary text-white font-medium hover:bg-brand-primary-dark disabled:opacity-60"
        >
          {{ loading ? t('common.loading') : t('auth.forgot.send') }}
        </button>
      </template>

      <p v-else class="text-sm text-emerald-400 text-center">
        {{ t('auth.forgot.sent', { email }) }}
      </p>

      <button
        type="button"
        class="w-full text-xs text-center text-gray-400 hover:text-gray-200"
        @click="backToCredentials"
      >
        {{ t('auth.forgot.back') }}
      </button>
    </form>

    <!-- Step 2 — 2FA code -->
    <form
      v-else
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

      <button
        type="button"
        class="w-full text-xs text-center text-gray-400 hover:text-gray-200"
        @click="cancelMfa"
      >
        {{ t('auth.mfa.useAnother') }}
      </button>
    </form>
  </section>
</template>
