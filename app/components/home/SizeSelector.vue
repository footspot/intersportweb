<script setup lang="ts">
// * Pill selector for a size axis. Parent supplies already-computed options
// * with an optional `disabled` flag (sold out / unavailable combo).
interface Option {
  value: string
  disabled?: boolean
  backorder?: boolean
}

interface Props {
  options: Option[]
  modelValue: string | null
  label?: string
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void }>()

const { t } = useI18n()

function pick(value: string, disabled: boolean) {
  if (disabled) return
  emit('update:modelValue', props.modelValue === value ? null : value)
}

const heading = computed(() => props.label || t('storefront.product.size'))
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <span class="text-sm font-medium">{{ heading }}</span>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        class="min-w-14 px-4 py-2 rounded-lg border text-sm font-medium transition-colors relative"
        :class="[
          modelValue === o.value
            ? 'border-brand-primary bg-brand-primary text-white'
            : o.backorder
              ? 'border-brand-gold/60 hover:bg-brand-gold/10'
              : 'border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar',
          o.disabled ? 'line-through opacity-40 cursor-not-allowed' : '',
        ]"
        :disabled="!!o.disabled"
        :title="o.disabled ? t('storefront.product.outOfStock') : o.backorder ? t('storefront.backorder') : ''"
        @click="pick(o.value, !!o.disabled)"
      >
        {{ o.value }}
        <span
          v-if="o.backorder"
          class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-brand-gold"
        />
      </button>
    </div>
  </div>
</template>
