<script setup lang="ts">
// * Color variants editor (optional). Each color = display name + hex from the
// * native color picker. Variants and gallery images reference a color by its
// * client-side `key` (its id for existing colors, a random uuid for new ones),
// * which the edge function resolves to a product_colors id on save.
export interface DraftColor {
  id?: string
  key: string
  name: string
  hex: string
}

interface Props {
  modelValue: DraftColor[]
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'update:modelValue', v: DraftColor[]): void }>()

const { t } = useI18n()

function update(next: DraftColor[]) {
  emit('update:modelValue', next)
}

function addColor() {
  update([...props.modelValue, { key: crypto.randomUUID(), name: '', hex: '#000000' }])
}

function removeColor(i: number) {
  const next = [...props.modelValue]
  next.splice(i, 1)
  update(next)
}

function setField<K extends keyof DraftColor>(i: number, key: K, value: DraftColor[K]) {
  update(props.modelValue.map((c, idx) => (idx === i ? { ...c, [key]: value } : c)))
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <div>
        <h4 class="font-heading font-bold">{{ t('admin.products.colors.title') }}</h4>
        <p class="text-xs text-gray-500">{{ t('admin.products.colors.hint') }}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-brand-primary text-brand-primary hover:bg-brand-primary/5"
        @click="addColor"
      >
        <UIcon name="i-lucide-plus" class="w-4 h-4" />
        {{ t('admin.products.colors.add') }}
      </button>
    </div>

    <p v-if="modelValue.length === 0" class="text-sm text-gray-400">
      {{ t('admin.products.colors.empty') }}
    </p>

    <div
      v-for="(c, i) in modelValue"
      :key="c.key"
      class="flex items-end gap-2"
    >
      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.products.colors.swatch') }}</span>
        <input
          :value="c.hex"
          type="color"
          class="mt-1 h-10 w-14 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent cursor-pointer"
          @input="setField(i, 'hex', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="block flex-1">
        <span class="text-sm font-medium">{{ t('admin.products.colors.name') }}</span>
        <input
          :value="c.name"
          type="text"
          :placeholder="t('admin.products.colors.namePlaceholder')"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          @input="setField(i, 'name', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <button
        type="button"
        class="p-2 mb-0.5 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-brand-secondary/5"
        :title="t('common.delete')"
        @click="removeColor(i)"
      >
        <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
