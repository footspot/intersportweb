<script setup lang="ts">
// * Vertical "slot machine" carousel of clubs. Entering items spring in from
// * below with a staggered cubic-bezier timing — matches the wireframe feel.
import type { Club } from '~/stores/clubs'

interface Props {
  clubs: Club[]
}
const props = defineProps<Props>()
defineEmits<{ (e: 'select', club: Club): void }>()

const client = useSupabaseClient()
const { t } = useI18n()

function logoUrl(path: string | null) {
  if (!path) return null
  const { data } = client.storage.from('club-logos').getPublicUrl(path)
  return data?.publicUrl ?? null
}
</script>

<template>
  <transition-group
    tag="ul"
    class="flex flex-col gap-3"
    enter-active-class="transition duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
    enter-from-class="opacity-0 translate-y-10"
    enter-to-class="opacity-100 translate-y-0"
    appear
  >
    <li
      v-for="(c, i) in props.clubs"
      :key="c.id"
      :style="{ transitionDelay: `${i * 60}ms` }"
    >
      <button
        type="button"
        class="w-full text-left bg-white dark:bg-sidebar-surface shadow-card-sm hover:shadow-card-md rounded-card px-4 py-3 flex items-center gap-4 hover:-translate-y-0.5 transition-all"
        @click="$emit('select', c)"
      >
        <div class="w-14 h-14 rounded-lg bg-gray-100 dark:bg-sidebar flex items-center justify-center overflow-hidden shrink-0">
          <img v-if="logoUrl(c.logo_path)" :src="logoUrl(c.logo_path)!" class="w-full h-full object-cover" alt="" />
          <UIcon v-else name="i-lucide-shield" class="w-6 h-6 text-gray-400" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-heading font-bold truncate">{{ c.name }}</div>
          <div class="text-xs text-gray-500 flex items-center gap-2">
            <span v-if="c.is_password_protected" class="inline-flex items-center gap-1 text-brand-gold">
              <UIcon name="i-lucide-lock" class="w-3 h-3" />
              {{ t('storefront.protected') }}
            </span>
            <span v-if="(c.product_count ?? 0) > 0">
              {{ t('storefront.productsCount', { n: c.product_count ?? 0 }) }}
            </span>
          </div>
        </div>
        <UIcon name="i-lucide-chevron-right" class="w-5 h-5 text-gray-400" />
      </button>
    </li>
  </transition-group>
</template>
