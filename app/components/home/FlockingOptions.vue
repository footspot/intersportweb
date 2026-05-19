<script setup lang="ts">
// * Flocking customisation for the product page. Two modes depending on
// * product.flocking_kind:
// *   - members    : two independent priced toggles (name-on-back, initials).
// *                  Each revealed toggle shows its own input.
// *   - supporters : a single priced toggle that unlocks two inputs
// *                  (name-on-back + jersey number). Either or both can be filled.
// *
// * The component emits the full selection via v-model (CartFlocking) and the
// * computed addon price via update:addon.
import type { FlockingKind } from '~/stores/products'
import type { FlockingOptions } from '~/stores/cart'

interface Props {
  modelValue: FlockingOptions
  kind: FlockingKind
  // * Individual option prices (members)
  namePrice: number
  initialsPrice: number
  // * Fixed supporter flocking price
  supporterPrice: number
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: FlockingOptions): void
  (e: 'update:addon', v: number): void
}>()

const { t } = useI18n()

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

// * Track which options the user has picked. Non-picked options clear their text.
const selectedName = ref(!!props.modelValue.name)
const selectedInitials = ref(!!props.modelValue.initial)
const supporterOn = ref(
  !!(props.modelValue.name || props.modelValue.number) && props.kind === 'supporters',
)

// * Reset local toggle state if the flocking kind switches at runtime.
watch(
  () => props.kind,
  () => {
    selectedName.value = false
    selectedInitials.value = false
    supporterOn.value = false
    push({ name: null, initial: null, number: null })
  },
)

function push(next: FlockingOptions) {
  emit('update:modelValue', next)
  emit('update:addon', computeAddon(next))
}

function computeAddon(v: FlockingOptions): number {
  if (props.kind === 'members') {
    return (v.name ? props.namePrice : 0) + (v.initial ? props.initialsPrice : 0)
  }
  if (props.kind === 'supporters') {
    return supporterOn.value ? props.supporterPrice : 0
  }
  return 0
}

function setName(raw: string) {
  const trimmed = raw.trim()
  push({ ...props.modelValue, name: trimmed || null })
}
function setInitial(raw: string) {
  const trimmed = raw.toUpperCase().slice(0, 3).trim()
  push({ ...props.modelValue, initial: trimmed || null })
}
function setNumber(raw: string) {
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 3)
  push({ ...props.modelValue, number: digits || null })
}

function toggleMembersName() {
  selectedName.value = !selectedName.value
  if (!selectedName.value) push({ ...props.modelValue, name: null })
  else emit('update:addon', computeAddon(props.modelValue))
}
function toggleMembersInitials() {
  selectedInitials.value = !selectedInitials.value
  if (!selectedInitials.value) push({ ...props.modelValue, initial: null })
  else emit('update:addon', computeAddon(props.modelValue))
}
function toggleSupporter() {
  supporterOn.value = !supporterOn.value
  if (!supporterOn.value) push({ name: null, initial: null, number: null })
  else emit('update:addon', computeAddon(props.modelValue))
}
</script>

<template>
  <div class="space-y-3">
    <div class="inline-flex items-center gap-2 text-sm font-medium">
      <UIcon name="i-lucide-shirt" class="w-4 h-4 text-brand-primary" />
      <span class="uppercase tracking-wider text-xs">{{ t('storefront.product.flocking.title') }}</span>
    </div>

    <!-- * MEMBERS: two independent priced toggles -->
    <template v-if="kind === 'members'">
      <div class="space-y-2">
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            class="w-4 h-4 accent-brand-primary"
            :checked="selectedName"
            @change="toggleMembersName"
          />
          <span class="font-medium uppercase tracking-wide text-xs">{{ t('storefront.product.flocking.nameOnBack') }}</span>
          <span class="text-brand-secondary text-xs">(+{{ fmt(namePrice) }})</span>
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            class="w-4 h-4 accent-brand-primary"
            :checked="selectedInitials"
            @change="toggleMembersInitials"
          />
          <span class="font-medium uppercase tracking-wide text-xs">{{ t('storefront.product.flocking.initials') }}</span>
          <span class="text-brand-secondary text-xs">(+{{ fmt(initialsPrice) }})</span>
        </label>
      </div>

      <label v-if="selectedName" class="block">
        <span class="text-xs font-medium uppercase tracking-wide text-gray-500">{{ t('storefront.product.flocking.nameLabel') }}</span>
        <input
          :value="modelValue.name ?? ''"
          type="text"
          maxlength="20"
          :placeholder="t('storefront.product.flocking.namePlaceholder')"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          @input="setName(($event.target as HTMLInputElement).value)"
        />
      </label>

      <label v-if="selectedInitials" class="block">
        <span class="text-xs font-medium uppercase tracking-wide text-gray-500">{{ t('storefront.product.flocking.initialsLabel') }}</span>
        <input
          :value="modelValue.initial ?? ''"
          type="text"
          maxlength="4"
          :placeholder="t('storefront.product.flocking.initialsPlaceholder')"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none uppercase"
          @input="setInitial(($event.target as HTMLInputElement).value)"
        />
      </label>
    </template>

    <!-- * SUPPORTERS: single toggle, two inputs -->
    <template v-if="kind === 'supporters'">
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          class="w-4 h-4 accent-brand-primary"
          :checked="supporterOn"
          @change="toggleSupporter"
        />
        <span class="font-medium uppercase tracking-wide text-xs">{{ t('storefront.product.flocking.supporter') }}</span>
        <span class="text-brand-secondary text-xs">(+{{ fmt(supporterPrice) }})</span>
      </label>

      <template v-if="supporterOn">
        <label class="block">
          <span class="text-xs font-medium uppercase tracking-wide text-gray-500">{{ t('storefront.product.flocking.nameLabel') }}</span>
          <input
            :value="modelValue.name ?? ''"
            type="text"
            maxlength="20"
            :placeholder="t('storefront.product.flocking.namePlaceholder')"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
            @input="setName(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="block">
          <span class="text-xs font-medium uppercase tracking-wide text-gray-500">{{ t('storefront.product.flocking.numberLabel') }}</span>
          <input
            :value="modelValue.number ?? ''"
            type="text"
            inputmode="numeric"
            maxlength="4"
            :placeholder="t('storefront.product.flocking.numberPlaceholder')"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none text-center font-mono"
            @input="setNumber(($event.target as HTMLInputElement).value)"
          />
        </label>
      </template>
    </template>
  </div>
</template>
