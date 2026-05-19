<script setup lang="ts">
// * Password input with show/hide toggle + keep-existing hint in edit mode.
interface Props {
  modelValue: string
  hasExisting?: boolean          // * edit mode: hash already stored, empty input = keep
  required?: boolean
  label?: string
}
const props = withDefaults(defineProps<Props>(), {
  hasExisting: false,
  required: false,
  label: '',
})
defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()

const { t } = useI18n()
const show = ref(false)
</script>

<template>
  <label class="block">
    <span class="text-sm font-medium">
      {{ label || t('admin.clubs.password') }}
      <span v-if="required" class="text-brand-secondary">*</span>
    </span>
    <div class="relative mt-1">
      <input
        :type="show ? 'text' : 'password'"
        :value="modelValue"
        :placeholder="hasExisting ? '••••••' : ''"
        autocomplete="new-password"
        class="w-full pr-10 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @input="(e) => $emit('update:modelValue', (e.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600"
        :aria-label="show ? t('admin.clubs.hidePassword') : t('admin.clubs.showPassword')"
        @click="show = !show"
      >
        <UIcon :name="show ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="w-4 h-4" />
      </button>
    </div>
    <p v-if="hasExisting" class="text-xs text-gray-500 mt-1">
      {{ t('admin.clubs.keepExistingHint') }}
    </p>
  </label>
</template>
