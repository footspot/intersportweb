<script setup lang="ts">
// * Password gate for protected clubs. Calls clubAccess.unlock() which hits
// * the public club-access edge function.
import type { Club } from '~/stores/clubs'
import { useClubAccessStore } from '~/stores/clubAccess'

interface Props {
  modelValue: boolean
  club: Club | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'unlocked'): void
  (e: 'cancel'): void
}>()

const { t } = useI18n()
const access = useClubAccessStore()
const supa = useSupabaseClient()

const password = ref('')
const show = ref(false)
const submitting = ref(false)
const errorMsg = ref<string | null>(null)
const shake = ref(false)
const justUnlocked = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)

// * Fallback to the brand primary so the visual still feels intentional
// * for clubs that didn't pick a custom color.
const accent = computed(() => props.club?.accent_color || '#0331f9')

const logoUrl = computed(() => {
  const path = props.club?.logo_path
  if (!path) return null
  const { data } = supa.storage.from('club-logos').getPublicUrl(path)
  return data?.publicUrl ?? null
})

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    password.value = ''
    show.value = false
    errorMsg.value = null
    shake.value = false
    justUnlocked.value = false
    await nextTick()
    inputEl.value?.focus()
  },
  { immediate: true },
)

function cancel() {
  if (submitting.value) return
  emit('update:modelValue', false)
  emit('cancel')
}

function triggerShake() {
  shake.value = false
  requestAnimationFrame(() => {
    shake.value = true
    window.setTimeout(() => (shake.value = false), 450)
  })
}

async function submit() {
  if (!props.club) return
  if (!password.value.trim()) {
    errorMsg.value = t('storefront.password.required')
    triggerShake()
    return
  }
  submitting.value = true
  errorMsg.value = null
  try {
    const res = await access.unlock(props.club.id, password.value)
    if (!res.ok) {
      errorMsg.value =
        res.error === 'invalid_password'
          ? t('storefront.password.invalid')
          : res.error ?? t('auth.errors.generic')
      triggerShake()
      return
    }
    // * Brief success flourish before closing — the lock icon swaps to "unlocked".
    justUnlocked.value = true
    window.setTimeout(() => {
      emit('unlocked')
      emit('update:modelValue', false)
    }, 520)
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : t('auth.errors.generic')
    triggerShake()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Transition name="cpm-fade">
    <div
      v-if="modelValue"
      class="cpm-root fixed inset-0 z-50 flex items-center justify-center px-4"
      :style="{ '--accent': accent }"
      @click.self="cancel"
    >
      <!-- * Layered backdrop: dark wash + accent radial glow + soft drifting orbs -->
      <div class="cpm-backdrop" />
      <div class="cpm-glow" aria-hidden="true" />
      <div class="cpm-orb cpm-orb--a" aria-hidden="true" />
      <div class="cpm-orb cpm-orb--b" aria-hidden="true" />

      <Transition name="cpm-pop" appear>
        <form
          v-if="modelValue"
          class="cpm-card relative w-full max-w-md"
          :class="{ 'cpm-shake': shake }"
          @submit.prevent="submit"
        >
          <!-- * Animated gradient ring border (accent → translucent → accent) -->
          <div class="cpm-ring" aria-hidden="true" />

          <div class="relative px-6 pt-7 pb-6">
            <!-- * Hero block: logo with halo + floating lock badge -->
            <div class="flex flex-col items-center text-center">
              <div class="cpm-logo-wrap">
                <div class="cpm-halo" aria-hidden="true" />
                <div class="cpm-logo-frame">
                  <img
                    v-if="logoUrl"
                    :src="logoUrl"
                    :alt="club?.name ?? ''"
                    class="w-full h-full object-cover"
                  />
                  <UIcon
                    v-else
                    name="i-lucide-shield"
                    class="w-10 h-10 text-white/70"
                  />
                </div>
                <div
                  class="cpm-lock-badge"
                  :class="{ 'cpm-lock-badge--open': justUnlocked }"
                >
                  <UIcon
                    :name="justUnlocked ? 'i-lucide-lock-open' : 'i-lucide-lock'"
                    class="w-3.5 h-3.5"
                  />
                </div>
              </div>

              <h3 class="mt-4 font-heading text-xl font-bold text-white tracking-tight">
                {{ club?.name }}
              </h3>
              <p
                v-if="club?.slogan"
                class="mt-1 text-xs italic text-white/60 max-w-xs"
              >
                « {{ club.slogan }} »
              </p>

              <div class="cpm-pill mt-3">
                <UIcon name="i-lucide-shield-check" class="w-3.5 h-3.5" />
                {{ t('storefront.password.title') }}
              </div>

              <p class="mt-3 text-sm text-white/70 leading-relaxed max-w-sm">
                {{ t('storefront.password.hint') }}
              </p>
            </div>

            <!-- * Password input -->
            <div class="mt-6">
              <label class="block">
                <span class="text-xs font-semibold uppercase tracking-wider text-white/60">
                  {{ t('auth.password') }}
                </span>
                <div class="cpm-input-wrap mt-2">
                  <UIcon
                    name="i-lucide-key-round"
                    class="cpm-input-icon w-4 h-4"
                  />
                  <input
                    ref="inputEl"
                    v-model="password"
                    :type="show ? 'text' : 'password'"
                    autocomplete="current-password"
                    class="cpm-input"
                    :placeholder="t('auth.password')"
                    :disabled="submitting || justUnlocked"
                    @input="errorMsg = null"
                  />
                  <button
                    type="button"
                    class="cpm-eye"
                    :aria-label="show ? 'Hide password' : 'Show password'"
                    @click="show = !show"
                  >
                    <UIcon :name="show ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="w-4 h-4" />
                  </button>
                </div>
              </label>

              <Transition name="cpm-err">
                <p v-if="errorMsg" class="cpm-error">
                  <UIcon name="i-lucide-alert-circle" class="w-4 h-4 shrink-0" />
                  <span>{{ errorMsg }}</span>
                </p>
              </Transition>
            </div>

            <!-- * Actions -->
            <div class="mt-6 flex items-center gap-3">
              <button
                type="button"
                class="cpm-btn-ghost"
                :disabled="submitting"
                @click="cancel"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                type="submit"
                class="cpm-btn-primary"
                :disabled="submitting || justUnlocked"
              >
                <span class="cpm-btn-shine" aria-hidden="true" />
                <UIcon
                  v-if="submitting"
                  name="i-lucide-loader-2"
                  class="w-4 h-4 animate-spin"
                />
                <UIcon
                  v-else-if="justUnlocked"
                  name="i-lucide-check"
                  class="w-4 h-4"
                />
                <UIcon
                  v-else
                  name="i-lucide-lock-open"
                  class="w-4 h-4"
                />
                <span>
                  {{
                    justUnlocked
                      ? t('storefront.password.unlocked')
                      : submitting
                        ? t('common.loading')
                        : t('storefront.password.unlock')
                  }}
                </span>
              </button>
            </div>
          </div>
        </form>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.cpm-root {
  isolation: isolate;
}

/* * Layered backdrop ------------------------------------------------------ */
.cpm-backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% 40%, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.78)),
    rgba(4, 6, 18, 0.65);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
}
.cpm-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 50% 45%,
    color-mix(in oklab, var(--accent) 38%, transparent) 0%,
    color-mix(in oklab, var(--accent) 12%, transparent) 28%,
    transparent 60%
  );
  pointer-events: none;
  filter: blur(8px);
}
.cpm-orb {
  position: absolute;
  width: 320px;
  height: 320px;
  border-radius: 9999px;
  filter: blur(60px);
  opacity: 0.55;
  pointer-events: none;
  background: radial-gradient(
    circle,
    color-mix(in oklab, var(--accent) 70%, transparent),
    transparent 65%
  );
  animation: cpm-drift 14s ease-in-out infinite;
}
.cpm-orb--a {
  top: 10%;
  left: 12%;
}
.cpm-orb--b {
  bottom: 8%;
  right: 10%;
  animation-delay: -7s;
  animation-duration: 18s;
  background: radial-gradient(
    circle,
    color-mix(in oklab, var(--accent) 50%, #ffffff 0%),
    transparent 65%
  );
}
@keyframes cpm-drift {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50%      { transform: translate3d(20px, -30px, 0) scale(1.08); }
}

/* * Card ------------------------------------------------------------------ */
.cpm-card {
  background:
    linear-gradient(180deg, rgba(20, 26, 48, 0.92), rgba(10, 14, 35, 0.94));
  border-radius: 22px;
  box-shadow:
    0 30px 80px -20px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(255, 255, 255, 0.04),
    0 0 60px -10px color-mix(in oklab, var(--accent) 35%, transparent);
  overflow: hidden;
}
.cpm-ring {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: conic-gradient(
    from 140deg,
    color-mix(in oklab, var(--accent) 80%, transparent),
    rgba(255, 255, 255, 0.04) 30%,
    rgba(255, 255, 255, 0.04) 70%,
    color-mix(in oklab, var(--accent) 80%, transparent)
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  pointer-events: none;
  animation: cpm-spin 9s linear infinite;
}
@keyframes cpm-spin {
  to { transform: rotate(1turn); }
}

/* * Logo / halo ----------------------------------------------------------- */
.cpm-logo-wrap {
  position: relative;
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cpm-halo {
  position: absolute;
  inset: -14px;
  border-radius: 9999px;
  background: radial-gradient(
    circle,
    color-mix(in oklab, var(--accent) 55%, transparent) 0%,
    transparent 70%
  );
  filter: blur(10px);
  animation: cpm-pulse 3.2s ease-in-out infinite;
}
@keyframes cpm-pulse {
  0%, 100% { transform: scale(1);    opacity: 0.85; }
  50%      { transform: scale(1.08); opacity: 1;    }
}
.cpm-logo-frame {
  position: relative;
  width: 84px;
  height: 84px;
  border-radius: 9999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  border: 2px solid color-mix(in oklab, var(--accent) 70%, transparent);
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.06),
    0 10px 30px -8px color-mix(in oklab, var(--accent) 50%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cpm-lock-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 30px;
  height: 30px;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(
    135deg,
    var(--accent),
    color-mix(in oklab, var(--accent) 60%, #000)
  );
  border: 2px solid rgba(10, 14, 35, 0.95);
  box-shadow: 0 6px 14px -2px color-mix(in oklab, var(--accent) 60%, transparent);
  transition: transform 350ms cubic-bezier(.5,1.6,.4,1), background 250ms;
}
.cpm-lock-badge--open {
  transform: rotate(-12deg) scale(1.1);
  background: linear-gradient(135deg, #10b981, #059669);
}

/* * Pill ------------------------------------------------------------------ */
.cpm-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: color-mix(in oklab, var(--accent) 30%, #ffffff);
  background: color-mix(in oklab, var(--accent) 18%, transparent);
  border: 1px solid color-mix(in oklab, var(--accent) 35%, transparent);
}

/* * Input ----------------------------------------------------------------- */
.cpm-input-wrap {
  position: relative;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: border-color 150ms, box-shadow 150ms, background 150ms;
}
.cpm-input-wrap:focus-within {
  background: rgba(255, 255, 255, 0.06);
  border-color: color-mix(in oklab, var(--accent) 70%, transparent);
  box-shadow:
    0 0 0 3px color-mix(in oklab, var(--accent) 25%, transparent),
    0 8px 24px -10px color-mix(in oklab, var(--accent) 45%, transparent);
}
.cpm-input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: color-mix(in oklab, var(--accent) 40%, #ffffff);
}
.cpm-input {
  width: 100%;
  padding: 12px 44px 12px 38px;
  background: transparent;
  color: #fff;
  font-size: 15px;
  letter-spacing: 0.04em;
  border: none;
  outline: none;
}
.cpm-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 0.04em;
}
.cpm-eye {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.55);
  transition: color 150ms, background 150ms;
}
.cpm-eye:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}

/* * Error ----------------------------------------------------------------- */
.cpm-error {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #fecaca;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  padding: 8px 12px;
  border-radius: 10px;
}

/* * Buttons --------------------------------------------------------------- */
.cpm-btn-ghost {
  padding: 11px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: background 150ms, color 150ms, border-color 150ms;
}
.cpm-btn-ghost:hover:not(:disabled) {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.18);
}
.cpm-btn-ghost:disabled {
  opacity: 0.5;
}

.cpm-btn-primary {
  position: relative;
  overflow: hidden;
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 18px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #fff;
  background: linear-gradient(
    135deg,
    var(--accent),
    color-mix(in oklab, var(--accent) 55%, #000)
  );
  box-shadow:
    0 10px 24px -8px color-mix(in oklab, var(--accent) 60%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
  transition: transform 150ms, box-shadow 200ms, filter 150ms;
}
.cpm-btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow:
    0 14px 28px -8px color-mix(in oklab, var(--accent) 70%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
}
.cpm-btn-primary:active:not(:disabled) {
  transform: translateY(0);
}
.cpm-btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.cpm-btn-shine {
  position: absolute;
  top: 0;
  left: -120%;
  width: 60%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.35),
    transparent
  );
  transform: skewX(-20deg);
  pointer-events: none;
}
.cpm-btn-primary:hover:not(:disabled) .cpm-btn-shine {
  animation: cpm-shine 900ms ease;
}
@keyframes cpm-shine {
  to { left: 130%; }
}

/* * Transitions ----------------------------------------------------------- */
.cpm-fade-enter-active,
.cpm-fade-leave-active {
  transition: opacity 220ms ease;
}
.cpm-fade-enter-from,
.cpm-fade-leave-to {
  opacity: 0;
}

.cpm-pop-enter-active {
  transition: transform 380ms cubic-bezier(.2, 1.2, .3, 1), opacity 280ms ease;
}
.cpm-pop-leave-active {
  transition: transform 200ms ease, opacity 200ms ease;
}
.cpm-pop-enter-from {
  opacity: 0;
  transform: translateY(18px) scale(0.94);
}
.cpm-pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}

.cpm-err-enter-active,
.cpm-err-leave-active {
  transition: opacity 180ms, transform 180ms;
}
.cpm-err-enter-from,
.cpm-err-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* * Shake ----------------------------------------------------------------- */
.cpm-shake {
  animation: cpm-shake 420ms cubic-bezier(.36, .07, .19, .97);
}
@keyframes cpm-shake {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px);  }
  30%, 50%, 70% { transform: translateX(-7px); }
  40%, 60% { transform: translateX(7px);  }
}

@media (prefers-reduced-motion: reduce) {
  .cpm-orb,
  .cpm-halo,
  .cpm-ring {
    animation: none;
  }
}
</style>
