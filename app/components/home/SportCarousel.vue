<script setup lang="ts">
// * Horizontal, swipeable sport carousel — big tile per sport.
import type { Sport } from '~/stores/sports'

interface Props {
  sports: Sport[]
  selectedId?: string | null
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'select', sport: Sport): void }>()

const client = useSupabaseClient()

function iconUrl(path: string | null | undefined) {
  if (!path) return null
  const { data } = client.storage.from('sports-icons').getPublicUrl(path)
  return data?.publicUrl ?? null
}
</script>

<template>
  <div class="overflow-x-auto">
    <ul class="flex gap-4 pb-2 snap-x snap-mandatory">
      <li
        v-for="s in props.sports"
        :key="s.id"
        class="snap-start shrink-0"
      >
        <button
          type="button"
          class="group w-40 sm:w-44 aspect-square rounded-card overflow-hidden relative flex flex-col items-center justify-center transition-transform hover:-translate-y-1"
          :class="props.selectedId === s.id
            ? 'ring-2 ring-brand-primary dark:ring-brand-primary-light shadow-card-md bg-gradient-to-br from-brand-primary/10 to-brand-primary-light/10'
            : 'bg-gray-50 dark:bg-sidebar-surface shadow-card-sm'"
          @click="emit('select', s)"
        >
          <div v-if="iconUrl(s.icon_path)" class="w-20 h-20 rounded-full bg-white dark:bg-sidebar flex items-center justify-center overflow-hidden shadow-card-sm">
            <img :src="iconUrl(s.icon_path)!" class="w-14 h-14 object-contain" alt="" />
          </div>
          <span class="mt-3 font-heading font-semibold text-center px-2">
            {{ s.name.fr }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
