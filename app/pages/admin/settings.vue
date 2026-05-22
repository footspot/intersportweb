<script setup lang="ts">
// * /admin/settings — the signed-in admin manages their OWN account:
// * display name, email, password and two-factor authentication.
// * Profile / email / password writes go through the admin-account edge
// * function (service role); 2FA runs against the caller's own session via
// * the supabase.auth.mfa.* APIs.
import { useAuthStore } from '~/stores/auth'
import { invokeEdge } from '~/composables/useEdgeFunction'

definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const { t } = useI18n()
const client = useSupabaseClient()
const auth = useAuthStore()

type Msg = { type: 'ok' | 'err'; text: string } | null

// * Translate an edge-function error code into a localized message.
function mapError(code?: string): string {
  switch (code) {
    case 'wrong_password': return t('admin.settings.wrongPassword')
    case 'email_taken': return t('admin.settings.email.taken')
    case 'invalid_email': return t('admin.settings.email.invalid')
    case 'weak_password': return t('admin.settings.password.tooShort')
    default: return t('admin.settings.genericError')
  }
}

// * `auth.profile` is null during SSR but populated on the client (the admin
// * middleware fetches it client-side only). Reading it straight into render
// * trips a hydration mismatch — so session-derived values stay empty until
// * `mounted` flips true, after which they update reactively.
const mounted = ref(false)

/* ----------------------------- Profile -------------------------------- */
const fullName = ref('')
const savingProfile = ref(false)
const profileMsg = ref<Msg>(null)

async function saveProfile() {
  profileMsg.value = null
  savingProfile.value = true
  const { data, error } = await invokeEdge<{ profile: any }>('admin-account', {
    method: 'POST',
    body: { action: 'profile', full_name: fullName.value },
  })
  if (error) {
    profileMsg.value = { type: 'err', text: mapError(error.code) }
  } else {
    if (data?.profile) auth.profile = data.profile
    profileMsg.value = { type: 'ok', text: t('admin.settings.profile.saved') }
  }
  savingProfile.value = false
}

/* ------------------------------ Email --------------------------------- */
// * Hydration-safe: empty until mounted, then reactive to auth.profile.
const currentEmail = computed(() => (mounted.value ? auth.profile?.email ?? '' : ''))
const newEmail = ref('')
const emailPassword = ref('')
const savingEmail = ref(false)
const emailMsg = ref<Msg>(null)

async function saveEmail() {
  emailMsg.value = null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.value.trim())) {
    emailMsg.value = { type: 'err', text: t('admin.settings.email.invalid') }
    return
  }
  savingEmail.value = true
  const { data, error } = await invokeEdge<{ profile: any }>('admin-account', {
    method: 'POST',
    body: {
      action: 'email',
      email: newEmail.value.trim(),
      current_password: emailPassword.value,
    },
  })
  if (error) {
    emailMsg.value = { type: 'err', text: mapError(error.code) }
  } else {
    if (data?.profile) auth.profile = data.profile
    // * Refresh the JWT so it carries the new email straight away.
    await client.auth.refreshSession()
    newEmail.value = ''
    emailPassword.value = ''
    emailMsg.value = { type: 'ok', text: t('admin.settings.email.saved') }
  }
  savingEmail.value = false
}

/* ----------------------------- Password ------------------------------- */
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const savingPassword = ref(false)
const passwordMsg = ref<Msg>(null)

async function savePassword() {
  passwordMsg.value = null
  if (newPassword.value.length < 8) {
    passwordMsg.value = { type: 'err', text: t('admin.settings.password.tooShort') }
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordMsg.value = { type: 'err', text: t('admin.settings.password.mismatch') }
    return
  }
  savingPassword.value = true
  const { error } = await invokeEdge<{ ok: true }>('admin-account', {
    method: 'POST',
    body: {
      action: 'password',
      current_password: currentPassword.value,
      new_password: newPassword.value,
    },
  })
  if (error) {
    passwordMsg.value = { type: 'err', text: mapError(error.code) }
  } else {
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    passwordMsg.value = { type: 'ok', text: t('admin.settings.password.saved') }
  }
  savingPassword.value = false
}

/* -------------------------- Two-factor auth --------------------------- */
const loading2fa = ref(true)
const has2fa = ref(false)
const verifiedFactorId = ref<string | null>(null)
const twoFaMsg = ref<Msg>(null)

// * Enrollment sub-flow
const enrollData = ref<{ factorId: string; qr: string; secret: string } | null>(null)
const enrollCode = ref('')
const enrollBusy = ref(false)
const enrollError = ref<string | null>(null)

// * Disable sub-flow
const disabling = ref(false)
const disableCode = ref('')
const disableBusy = ref(false)
const disableError = ref<string | null>(null)

// * supabase-js may hand back the QR as a data URI or as raw SVG markup —
// * normalize both into something an <img src> accepts.
const qrSrc = computed(() => {
  const q = enrollData.value?.qr ?? ''
  if (!q) return ''
  if (q.startsWith('data:')) return q
  return `data:image/svg+xml;utf-8,${encodeURIComponent(q)}`
})

async function refresh2fa() {
  loading2fa.value = true
  const { data, error } = await client.auth.mfa.listFactors()
  if (!error && data) {
    const verified = data.totp?.find((f) => f.status === 'verified') ?? null
    has2fa.value = !!verified
    verifiedFactorId.value = verified?.id ?? null
  }
  loading2fa.value = false
}

async function startEnroll() {
  enrollError.value = null
  twoFaMsg.value = null
  enrollBusy.value = true
  try {
    // * Clear any leftover unverified TOTP factors so enroll doesn't pile up.
    const { data: list } = await client.auth.mfa.listFactors()
    const stale = (list?.all ?? []).filter(
      (f) => f.factor_type === 'totp' && f.status !== 'verified',
    )
    for (const f of stale) await client.auth.mfa.unenroll({ factorId: f.id })

    const { data, error } = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Authenticator ${Date.now()}`,
    })
    if (error) throw error
    enrollData.value = {
      factorId: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
    }
    enrollCode.value = ''
  } catch (err: any) {
    enrollError.value = err?.message || t('admin.settings.twoFactor.genericError')
  } finally {
    enrollBusy.value = false
  }
}

async function confirmEnroll() {
  if (!enrollData.value) return
  enrollError.value = null
  enrollBusy.value = true
  try {
    const { error } = await client.auth.mfa.challengeAndVerify({
      factorId: enrollData.value.factorId,
      code: enrollCode.value.trim(),
    })
    if (error) {
      enrollError.value = t('admin.settings.twoFactor.invalidCode')
      return
    }
    enrollData.value = null
    enrollCode.value = ''
    twoFaMsg.value = { type: 'ok', text: t('admin.settings.twoFactor.enabled') }
    await refresh2fa()
  } catch (err: any) {
    enrollError.value = err?.message || t('admin.settings.twoFactor.genericError')
  } finally {
    enrollBusy.value = false
  }
}

function cancelEnroll() {
  // * Drop the unverified factor we just created.
  if (enrollData.value) {
    client.auth.mfa.unenroll({ factorId: enrollData.value.factorId }).catch(() => {})
  }
  enrollData.value = null
  enrollCode.value = ''
  enrollError.value = null
}

function startDisable() {
  twoFaMsg.value = null
  disableError.value = null
  disableCode.value = ''
  disabling.value = true
}

async function confirmDisable() {
  if (!verifiedFactorId.value) return
  disableError.value = null
  disableBusy.value = true
  try {
    // * Require a fresh code before tearing the factor down.
    const { error: vErr } = await client.auth.mfa.challengeAndVerify({
      factorId: verifiedFactorId.value,
      code: disableCode.value.trim(),
    })
    if (vErr) {
      disableError.value = t('admin.settings.twoFactor.invalidCode')
      return
    }
    const { error } = await client.auth.mfa.unenroll({ factorId: verifiedFactorId.value })
    if (error) throw error
    disabling.value = false
    disableCode.value = ''
    twoFaMsg.value = { type: 'ok', text: t('admin.settings.twoFactor.disabled') }
    await refresh2fa()
  } catch (err: any) {
    disableError.value = err?.message || t('admin.settings.twoFactor.genericError')
  } finally {
    disableBusy.value = false
  }
}

function cancelDisable() {
  disabling.value = false
  disableCode.value = ''
  disableError.value = null
}

onMounted(() => {
  mounted.value = true
  fullName.value = auth.profile?.full_name ?? ''
  refresh2fa()
})

const inputClass =
  'mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none'
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <div>
      <h1 class="font-heading text-2xl font-bold">{{ t('admin.settings.title') }}</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.settings.subtitle') }}</p>
    </div>

    <!-- ============================ Profile ============================ -->
    <section class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-6 space-y-4">
      <div class="flex items-center gap-3">
        <span class="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-primary/10 text-brand-primary">
          <UIcon name="i-lucide-user" class="w-5 h-5" />
        </span>
        <div>
          <h2 class="font-heading font-semibold">{{ t('admin.settings.profile.title') }}</h2>
          <p class="text-xs text-gray-500">{{ t('admin.settings.profile.desc') }}</p>
        </div>
      </div>

      <form class="space-y-4" @submit.prevent="saveProfile">
        <label class="block">
          <span class="text-sm font-medium">{{ t('auth.fullName') }}</span>
          <input v-model="fullName" type="text" autocomplete="name" :class="inputClass" />
        </label>

        <p v-if="profileMsg" class="text-sm" :class="profileMsg.type === 'ok' ? 'text-brand-green' : 'text-brand-secondary'">
          {{ profileMsg.text }}
        </p>

        <div class="flex justify-end">
          <button
            type="submit"
            :disabled="savingProfile"
            class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
          >
            {{ savingProfile ? t('common.loading') : t('common.save') }}
          </button>
        </div>
      </form>
    </section>

    <!-- ============================= Email ============================= -->
    <section class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-6 space-y-4">
      <div class="flex items-center gap-3">
        <span class="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-primary/10 text-brand-primary">
          <UIcon name="i-lucide-mail" class="w-5 h-5" />
        </span>
        <div>
          <h2 class="font-heading font-semibold">{{ t('admin.settings.email.title') }}</h2>
          <p class="text-xs text-gray-500">{{ t('admin.settings.email.desc') }}</p>
        </div>
      </div>

      <form class="space-y-4" @submit.prevent="saveEmail">
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.settings.email.current') }}</span>
          <input
            :value="currentEmail"
            type="email"
            disabled
            :class="[inputClass, 'opacity-60']"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.settings.email.new') }}</span>
          <input v-model="newEmail" type="email" autocomplete="email" required :class="inputClass" />
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.settings.password.current') }}</span>
          <input
            v-model="emailPassword"
            type="password"
            autocomplete="current-password"
            required
            :class="inputClass"
          />
        </label>

        <p v-if="emailMsg" class="text-sm" :class="emailMsg.type === 'ok' ? 'text-brand-green' : 'text-brand-secondary'">
          {{ emailMsg.text }}
        </p>

        <div class="flex justify-end">
          <button
            type="submit"
            :disabled="savingEmail"
            class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
          >
            {{ savingEmail ? t('common.loading') : t('common.save') }}
          </button>
        </div>
      </form>
    </section>

    <!-- =========================== Password ============================ -->
    <section class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-6 space-y-4">
      <div class="flex items-center gap-3">
        <span class="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-primary/10 text-brand-primary">
          <UIcon name="i-lucide-key-round" class="w-5 h-5" />
        </span>
        <div>
          <h2 class="font-heading font-semibold">{{ t('admin.settings.password.title') }}</h2>
          <p class="text-xs text-gray-500">{{ t('admin.settings.password.desc') }}</p>
        </div>
      </div>

      <form class="space-y-4" @submit.prevent="savePassword">
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.settings.password.current') }}</span>
          <input
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            required
            :class="inputClass"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.settings.password.new') }}</span>
          <input
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            required
            :class="inputClass"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.settings.password.confirm') }}</span>
          <input
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            required
            :class="inputClass"
          />
        </label>

        <p v-if="passwordMsg" class="text-sm" :class="passwordMsg.type === 'ok' ? 'text-brand-green' : 'text-brand-secondary'">
          {{ passwordMsg.text }}
        </p>

        <div class="flex justify-end">
          <button
            type="submit"
            :disabled="savingPassword"
            class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
          >
            {{ savingPassword ? t('common.loading') : t('common.save') }}
          </button>
        </div>
      </form>
    </section>

    <!-- ======================= Two-factor auth ========================= -->
    <section class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-6 space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <span class="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-primary/10 text-brand-primary">
            <UIcon name="i-lucide-shield-check" class="w-5 h-5" />
          </span>
          <div>
            <h2 class="font-heading font-semibold">{{ t('admin.settings.twoFactor.title') }}</h2>
            <p class="text-xs text-gray-500">{{ t('admin.settings.twoFactor.desc') }}</p>
          </div>
        </div>
        <span
          v-if="!loading2fa"
          class="shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold"
          :class="has2fa ? 'bg-brand-green/15 text-brand-green' : 'bg-gray-100 dark:bg-sidebar text-gray-500'"
        >
          {{ has2fa ? t('admin.settings.twoFactor.statusOn') : t('admin.settings.twoFactor.statusOff') }}
        </span>
      </div>

      <div v-if="loading2fa" class="text-sm text-gray-500">{{ t('common.loading') }}</div>

      <template v-else>
        <p
          v-if="twoFaMsg"
          class="text-sm"
          :class="twoFaMsg.type === 'ok' ? 'text-brand-green' : 'text-brand-secondary'"
        >
          {{ twoFaMsg.text }}
        </p>

        <!-- ----- 2FA enabled ----- -->
        <template v-if="has2fa">
          <p class="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
            <UIcon name="i-lucide-check-circle-2" class="w-4 h-4 text-brand-green shrink-0" />
            {{ t('admin.settings.twoFactor.enabledNote') }}
          </p>

          <div v-if="!disabling" class="flex justify-end">
            <button
              type="button"
              class="px-4 py-2 rounded-lg text-sm font-medium border border-brand-secondary text-brand-secondary hover:bg-brand-secondary/5"
              @click="startDisable"
            >
              {{ t('admin.settings.twoFactor.disable') }}
            </button>
          </div>

          <form
            v-else
            class="space-y-3 p-4 rounded-lg bg-gray-50 dark:bg-sidebar"
            @submit.prevent="confirmDisable"
          >
            <p class="text-sm font-medium">{{ t('admin.settings.twoFactor.disableConfirm') }}</p>
            <input
              v-model="disableCode"
              type="text"
              inputmode="numeric"
              maxlength="6"
              autocomplete="one-time-code"
              placeholder="000000"
              class="w-40 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-center text-lg tracking-[0.3em] font-mono focus:ring-2 focus:ring-brand-primary focus:outline-none"
            />
            <p v-if="disableError" class="text-sm text-brand-secondary">{{ disableError }}</p>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar-surface"
                :disabled="disableBusy"
                @click="cancelDisable"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                type="submit"
                class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-secondary text-white hover:opacity-90 disabled:opacity-60"
                :disabled="disableBusy || disableCode.length < 6"
              >
                {{ disableBusy ? t('common.loading') : t('admin.settings.twoFactor.disable') }}
              </button>
            </div>
          </form>
        </template>

        <!-- ----- 2FA disabled ----- -->
        <template v-else>
          <template v-if="!enrollData">
            <p class="text-sm text-gray-600 dark:text-gray-300">
              {{ t('admin.settings.twoFactor.disabledNote') }}
            </p>
            <div class="flex justify-end">
              <button
                type="button"
                :disabled="enrollBusy"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
                @click="startEnroll"
              >
                <UIcon name="i-lucide-shield-plus" class="w-4 h-4" />
                {{ enrollBusy ? t('common.loading') : t('admin.settings.twoFactor.enable') }}
              </button>
            </div>
            <p v-if="enrollError" class="text-sm text-brand-secondary text-right">{{ enrollError }}</p>
          </template>

          <!-- ----- Enrollment in progress ----- -->
          <form
            v-else
            class="space-y-4 p-4 rounded-lg bg-gray-50 dark:bg-sidebar"
            @submit.prevent="confirmEnroll"
          >
            <div>
              <p class="text-sm font-medium">{{ t('admin.settings.twoFactor.step1') }}</p>
              <p class="text-xs text-gray-500 mb-3">{{ t('admin.settings.twoFactor.step1desc') }}</p>
              <div class="inline-block bg-white p-3 rounded-lg border border-gray-200">
                <img :src="qrSrc" alt="2FA QR code" class="w-44 h-44" />
              </div>
              <p class="text-xs text-gray-500 mt-3">{{ t('admin.settings.twoFactor.manualKey') }}</p>
              <code class="inline-block mt-1 px-2 py-1 rounded bg-white dark:bg-sidebar-surface text-brand-primary font-mono text-sm break-all">
                {{ enrollData.secret }}
              </code>
            </div>

            <div>
              <p class="text-sm font-medium mb-1">{{ t('admin.settings.twoFactor.step2') }}</p>
              <input
                v-model="enrollCode"
                type="text"
                inputmode="numeric"
                maxlength="6"
                autocomplete="one-time-code"
                placeholder="000000"
                class="w-40 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-center text-lg tracking-[0.3em] font-mono focus:ring-2 focus:ring-brand-primary focus:outline-none"
              />
            </div>

            <p v-if="enrollError" class="text-sm text-brand-secondary">{{ enrollError }}</p>

            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar-surface"
                :disabled="enrollBusy"
                @click="cancelEnroll"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                type="submit"
                class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
                :disabled="enrollBusy || enrollCode.length < 6"
              >
                {{ enrollBusy ? t('common.loading') : t('admin.settings.twoFactor.verify') }}
              </button>
            </div>
          </form>
        </template>
      </template>
    </section>
  </div>
</template>
