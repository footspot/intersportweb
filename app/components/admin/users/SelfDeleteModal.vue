<script setup lang="ts">
// * Re-authentication gate before an admin deletes their OWN account.
// * Requires the password, or — if a verified 2FA factor exists — the current
// * authenticator code. On success the parent receives @confirmed and performs
// * the deletion + sign-out.
interface Props {
  modelValue: boolean
  email: string
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'confirmed'): void
}>()

const { t } = useI18n()
const client = useSupabaseClient()

const password = ref('')
const code = ref('')
const error = ref<string | null>(null)
const busy = ref(false)
// * Resolved on open: which challenge to show. null = password, otherwise TOTP.
const mfaFactorId = ref<string | null>(null)
const ready = ref(false)

async function detectMfa() {
  ready.value = false
  try {
    const { data } = await client.auth.mfa.listFactors()
    const totp = data?.totp?.find((f) => f.status === 'verified') ?? null
    mfaFactorId.value = totp?.id ?? null
  } catch {
    mfaFactorId.value = null
  } finally {
    ready.value = true
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      password.value = ''
      code.value = ''
      error.value = null
      busy.value = false
      detectMfa()
    }
  },
)

const canSubmit = computed(() =>
  mfaFactorId.value ? code.value.trim().length >= 6 : password.value.length > 0,
)

function close() {
  if (busy.value) return
  emit('update:modelValue', false)
}

async function submit() {
  if (!canSubmit.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    if (mfaFactorId.value) {
      const { error: mErr } = await client.auth.mfa.challengeAndVerify({
        factorId: mfaFactorId.value,
        code: code.value.trim(),
      })
      if (mErr) {
        error.value = t('auth.mfa.invalidCode')
        return
      }
    } else {
      const { error: pErr } = await client.auth.signInWithPassword({
        email: props.email,
        password: password.value,
      })
      if (pErr) {
        error.value = t('admin.users.selfDeleteModal.invalidPassword')
        return
      }
    }
    // * Re-auth ok — let the parent run the actual delete.
    emit('confirmed')
  } catch (err: any) {
    error.value = err?.message || t('auth.errors.generic')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="close"
  >
    <div class="w-full max-w-md bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4">
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-triangle-alert" class="w-6 h-6 text-brand-secondary shrink-0 mt-0.5" />
        <div>
          <h3 class="font-heading text-lg font-bold">{{ t('admin.users.selfDeleteModal.title') }}</h3>
          <p class="text-sm text-gray-600 dark:text-gray-300 mt-1">
            {{ t('admin.users.selfDeleteModal.message') }}
          </p>
        </div>
      </div>

      <form class="space-y-3" @submit.prevent="submit">
        <!-- 2FA code -->
        <label v-if="mfaFactorId" class="block">
          <span class="text-sm font-medium">{{ t('admin.users.selfDeleteModal.code') }}</span>
          <input
            v-model="code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="000000"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-center text-xl tracking-[0.4em] font-mono focus:ring-2 focus:ring-brand-secondary/40 focus:outline-none"
          />
        </label>

        <!-- Password -->
        <label v-else class="block">
          <span class="text-sm font-medium">{{ t('admin.users.selfDeleteModal.password') }}</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-secondary/40 focus:outline-none"
          />
        </label>

        <p v-if="error" class="text-sm text-brand-secondary">{{ error }}</p>

        <div class="flex justify-end gap-2 pt-1">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar"
            :disabled="busy"
            @click="close"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="submit"
            class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-secondary hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="busy || !ready || !canSubmit"
          >
            {{ busy ? t('common.loading') : t('admin.users.selfDeleteModal.confirm') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
