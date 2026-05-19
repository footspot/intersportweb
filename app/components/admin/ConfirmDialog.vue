<script setup lang="ts">
// * Minimal confirm modal — used before destructive actions (delete sport / club).
// * Set `require-typed` to force the user to type the localized keyword
// * (common.deleteKeyword → "supprimer" / "delete") before the confirm button activates.
interface Props {
  modelValue: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  requireTyped?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  danger: true,
  busy: false,
  confirmLabel: '',
  cancelLabel: '',
  requireTyped: false,
})
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'confirm'): void
}>()

const { t } = useI18n()

const typed = ref('')
const keyword = computed(() => t('common.deleteKeyword'))
const typedMatches = computed(
  () => typed.value.trim().toLocaleLowerCase() === keyword.value.toLocaleLowerCase(),
)
const canConfirm = computed(() => !props.requireTyped || typedMatches.value)

// * Reset the input every time the dialog is reopened so a previous match
// * doesn't carry over to the next deletion.
watch(
  () => props.modelValue,
  (open) => {
    if (open) typed.value = ''
  },
)

function close() {
  emit('update:modelValue', false)
}
function confirm() {
  if (!canConfirm.value) return
  emit('confirm')
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="close"
  >
    <div class="w-full max-w-md bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4">
      <h3 class="font-heading text-lg font-bold">{{ title }}</h3>
      <p class="text-sm text-gray-600 dark:text-gray-300">{{ message }}</p>

      <div v-if="requireTyped" class="space-y-1.5">
        <label class="block text-xs text-gray-600 dark:text-gray-300">
          <i18n-t keypath="common.typeToConfirm" tag="span">
            <template #keyword>
              <strong class="font-mono text-brand-secondary">{{ keyword }}</strong>
            </template>
          </i18n-t>
        </label>
        <input
          v-model="typed"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="keyword"
          class="w-full px-3 py-2 rounded-lg border bg-transparent text-sm focus:ring-2 focus:outline-none"
          :class="typedMatches
            ? 'border-brand-green focus:ring-brand-green/40'
            : 'border-gray-300 dark:border-sidebar focus:ring-brand-secondary/40'"
          @keyup.enter="confirm"
        />
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar"
          :disabled="busy"
          @click="close"
        >
          {{ cancelLabel || t('common.cancel') }}
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed"
          :class="danger ? 'bg-brand-secondary hover:opacity-90' : 'bg-brand-primary hover:bg-brand-primary-dark'"
          :disabled="busy || !canConfirm"
          @click="confirm"
        >
          {{ busy ? t('common.loading') : (confirmLabel || t('common.delete')) }}
        </button>
      </div>
    </div>
  </div>
</template>
