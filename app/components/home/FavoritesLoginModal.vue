<script setup lang="ts">
// * Global login prompt shown when a logged-out visitor taps the heart on a
// * product card. We DON'T redirect to the login page automatically — this
// * modal just proposes signing in or creating an account. State lives in the
// * favorites store so any card can open it without prop drilling.
import { useFavoritesStore } from '~/stores/favorites'

const { t } = useI18n()
const favorites = useFavoritesStore()

function goSignIn() {
  favorites.closePrompt()
  navigateTo('/account/login')
}
function goSignUp() {
  favorites.closePrompt()
  navigateTo('/account/login?mode=signup')
}
</script>

<template>
  <Transition name="flm-fade">
    <div
      v-if="favorites.promptOpen"
      class="fixed inset-0 z-[60] flex items-center justify-center px-4"
      @click.self="favorites.closePrompt()"
    >
      <div class="absolute inset-0 bg-black/55 backdrop-blur-sm" @click="favorites.closePrompt()" />

      <Transition name="flm-pop" appear>
        <div
          v-if="favorites.promptOpen"
          class="relative w-full max-w-sm bg-white dark:bg-sidebar-surface rounded-3xl shadow-card-lg border border-black/5 dark:border-white/10 p-7 text-center"
        >
          <button
            type="button"
            class="absolute top-3 right-3 w-8 h-8 grid place-items-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition"
            :aria-label="t('common.close')"
            @click="favorites.closePrompt()"
          >
            <UIcon name="i-lucide-x" class="w-4 h-4" />
          </button>

          <div class="w-14 h-14 rounded-full bg-brand-secondary/10 grid place-items-center mx-auto">
            <AppHeartIcon filled class="w-7 h-7 text-brand-secondary" />
          </div>

          <h3 class="font-heading text-2xl font-bold text-brand-primary mt-4">
            {{ t('favorites.loginPrompt.title') }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
            {{ t('favorites.loginPrompt.subtitle') }}
          </p>

          <div class="mt-6 space-y-2.5">
            <button
              type="button"
              class="w-full py-3 rounded-xl bg-brand-secondary text-white font-semibold hover:brightness-95 transition shadow-card-sm"
              @click="goSignIn"
            >
              {{ t('favorites.loginPrompt.signin') }}
            </button>
            <button
              type="button"
              class="w-full py-3 rounded-xl border-2 border-brand-primary text-brand-primary font-semibold hover:bg-brand-primary hover:text-white transition"
              @click="goSignUp"
            >
              {{ t('favorites.loginPrompt.signup') }}
            </button>
          </div>

          <button
            type="button"
            class="mt-4 text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
            @click="favorites.closePrompt()"
          >
            {{ t('favorites.loginPrompt.later') }}
          </button>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.flm-fade-enter-active,
.flm-fade-leave-active {
  transition: opacity 220ms ease;
}
.flm-fade-enter-from,
.flm-fade-leave-to {
  opacity: 0;
}
.flm-pop-enter-active {
  transition: transform 360ms cubic-bezier(0.2, 1.2, 0.3, 1), opacity 260ms ease;
}
.flm-pop-leave-active {
  transition: transform 180ms ease, opacity 180ms ease;
}
.flm-pop-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.95);
}
.flm-pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
</style>
