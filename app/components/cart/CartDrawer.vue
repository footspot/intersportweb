<script setup lang="ts">
import { useCartStore } from '~/stores/cart'
import { useSiteSettingsStore } from '~/stores/siteSettings'

interface Props {
  modelValue: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t } = useI18n()
const cart = useCartStore()
const siteSettings = useSiteSettingsStore()

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

// * Shop-wide minimum order amount — checked against the goods subtotal, the
// * same basis create-order enforces. 0 (or a not-yet-loaded row) = no floor.
const minOrder = computed(() => siteSettings.minOrderSubtotal)
const belowMinimum = computed(() => minOrder.value > 0 && cart.subtotal < minOrder.value)
const missingForMinimum = computed(() => Math.max(0, minOrder.value - cart.subtotal))

function close() {
  emit('update:modelValue', false)
}

async function goToCheckout() {
  if (belowMinimum.value) return
  close()
  await navigateTo('/checkout')
}

// * Close on Escape + lock background scroll while the drawer is open, so on
// * mobile (where the panel is near full-width) it can't feel "stuck".
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(
  () => props.modelValue,
  (open) => {
    if (!import.meta.client) return
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <transition
    enter-active-class="transition-opacity duration-200"
    leave-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div v-if="modelValue" class="fixed inset-0 z-40 flex justify-end">
      <!-- * Always-tappable backdrop (kept on mobile so a tap outside dismisses) -->
      <div class="flex-1 min-w-[40px] bg-black/50" @click="close" />
      <aside
        class="w-[88%] max-w-md bg-white dark:bg-sidebar-surface h-full flex flex-col shadow-card-lg"
        @click.stop
      >
        <div class="px-5 py-4 border-b border-gray-100 dark:border-sidebar flex items-center justify-between">
          <h3 class="font-heading text-lg font-bold inline-flex items-center gap-2">
            <UIcon name="i-lucide-shopping-bag" class="w-5 h-5" />
            {{ t('cart.title') }}
            <span v-if="cart.count > 0" class="text-xs text-gray-500">({{ cart.count }})</span>
          </h3>
          <button
            type="button"
            class="p-2 rounded-lg text-gray-700 dark:text-gray-100 bg-gray-100 dark:bg-sidebar hover:bg-gray-200 dark:hover:bg-sidebar-bg transition-colors"
            :aria-label="t('common.cancel')"
            @click="close"
          >
            <UIcon name="i-lucide-x" class="w-5 h-5" />
          </button>
        </div>

        <div v-if="cart.isEmpty" class="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-500">
          <UIcon name="i-lucide-shopping-bag" class="w-12 h-12 mb-3 opacity-40" />
          <p class="font-medium">{{ t('cart.empty') }}</p>
          <p class="text-xs mt-1">{{ t('cart.emptyHint') }}</p>
        </div>

        <div v-else class="flex-1 overflow-y-auto p-4 space-y-3">
          <CartItem v-for="line in cart.lines" :key="line.line_id" :line="line" />
        </div>

        <div v-if="!cart.isEmpty" class="border-t border-gray-100 dark:border-sidebar p-4 space-y-3">
          <CartSummary />
          <p
            v-if="belowMinimum"
            class="text-xs text-brand-secondary bg-brand-secondary/10 border border-brand-secondary/30 rounded-card px-3 py-2"
          >
            {{ t('cart.minOrder', { amount: fmt(minOrder), missing: fmt(missingForMinimum) }) }}
          </p>
          <button
            type="button"
            :disabled="belowMinimum"
            class="w-full py-2.5 rounded-card bg-brand-primary text-white font-medium hover:bg-brand-primary-dark disabled:opacity-50 disabled:hover:bg-brand-primary"
            @click="goToCheckout"
          >
            {{ t('cart.checkout') }}
          </button>
          <button
            type="button"
            class="w-full py-2 text-xs text-gray-500 hover:text-brand-secondary"
            @click="cart.clear()"
          >
            {{ t('cart.clear') }}
          </button>
        </div>
      </aside>
    </div>
  </transition>
</template>
