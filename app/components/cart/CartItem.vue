<script setup lang="ts">
import type { CartLine } from '~/stores/cart'
import { useCartStore } from '~/stores/cart'

interface Props {
  line: CartLine
}
const props = defineProps<Props>()

const { t, locale } = useI18n()
const cart = useCartStore()
const client = useSupabaseClient()

const imageUrl = computed(() => {
  if (!props.line.image_path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(props.line.image_path)
  return data?.publicUrl ?? null
})

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

function dec() {
  if (props.line.quantity <= 1) return cart.remove(props.line.line_id)
  cart.setQuantity(props.line.line_id, props.line.quantity - 1)
}
function inc() {
  if (props.line.quantity >= props.line.max_stock) return
  cart.setQuantity(props.line.line_id, props.line.quantity + 1)
}

const flockingLabel = computed(() => {
  const f = props.line.flocking
  const parts: string[] = []
  if (f?.name) parts.push(f.name)
  if (f?.initial) parts.push(f.initial)
  if (f?.number) parts.push(`#${f.number}`)
  return parts.join(' · ')
})
</script>

<template>
  <div class="flex gap-3 p-3 rounded-lg border border-gray-100 dark:border-sidebar">
    <div class="w-16 h-16 rounded-lg bg-gray-100 dark:bg-sidebar flex items-center justify-center overflow-hidden shrink-0">
      <img v-if="imageUrl" :src="imageUrl" class="w-full h-full object-cover" alt="" />
      <UIcon v-else name="i-lucide-image" class="w-5 h-5 text-gray-400" />
    </div>
    <div class="flex-1 min-w-0 flex flex-col">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="font-medium truncate">
            {{ line.name[locale as 'fr' | 'en'] ?? line.name.fr }}
          </div>
          <div class="text-xs text-gray-500 truncate">
            {{ t('cart.size') }} {{ line.size }}
            <span v-if="flockingLabel"> · {{ flockingLabel }}</span>
          </div>
        </div>
        <button
          type="button"
          class="p-1 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-brand-secondary/10"
          :aria-label="t('common.delete')"
          @click="cart.remove(line.line_id)"
        >
          <UIcon name="i-lucide-x" class="w-4 h-4" />
        </button>
      </div>
      <div class="flex items-center justify-between mt-auto pt-2">
        <div class="inline-flex items-center rounded-lg border border-gray-200 dark:border-sidebar">
          <button
            type="button"
            class="px-2 py-1 hover:bg-gray-100 dark:hover:bg-sidebar text-sm"
            @click="dec"
          >
            -
          </button>
          <span class="px-3 text-sm font-medium min-w-8 text-center">{{ line.quantity }}</span>
          <button
            type="button"
            class="px-2 py-1 hover:bg-gray-100 dark:hover:bg-sidebar text-sm disabled:opacity-40"
            :disabled="line.quantity >= line.max_stock"
            @click="inc"
          >
            +
          </button>
        </div>
        <div class="text-right">
          <div class="font-medium">{{ fmt(line.unit_price_paid * line.quantity) }}</div>
          <div
            v-if="line.discount_percent > 0"
            class="text-xs text-gray-400 line-through"
          >
            {{ fmt(line.selling_price * line.quantity) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
