<script setup lang="ts">
import { useUsersStore, type User, type Role } from '~/stores/users'

interface Props {
  modelValue: boolean
  user: User | null        // * null = create
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const users = useUsersStore()

const firstName = ref('')
const lastName = ref('')
const email = ref('')
const role = ref<Role>('employee')
const active = ref(true)
const saving = ref(false)
const errorMsg = ref<string | null>(null)

const isEdit = computed(() => !!props.user)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const u = props.user
    const [first, ...rest] = (u?.full_name ?? '').split(' ')
    firstName.value = first ?? ''
    lastName.value = rest.join(' ')
    email.value = u?.email ?? ''
    role.value = (u?.role as Role) ?? 'employee'
    active.value = u?.active ?? true
    errorMsg.value = null
  },
  { immediate: true },
)

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function save() {
  errorMsg.value = null
  if (!isEdit.value && !email.value.trim()) {
    errorMsg.value = t('admin.users.errors.emailRequired')
    return
  }

  const fullName = `${firstName.value.trim()} ${lastName.value.trim()}`.trim()

  saving.value = true
  try {
    if (props.user) {
      await users.update({
        id: props.user.id,
        full_name: fullName || undefined,
        role: role.value,
        active: active.value,
      })
    } else {
      await users.create({
        email: email.value.trim(),
        full_name: fullName || undefined,
        role: role.value,
        active: active.value,
      })
    }
    emit('saved')
    emit('update:modelValue', false)
  } catch (err: any) {
    if (err?.message === 'last_admin') {
      errorMsg.value = t('admin.users.errors.lastAdmin')
    } else {
      errorMsg.value = edgeErrorMessage(err)
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="close"
  >
    <div class="w-full max-w-lg bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4">
      <h3 class="font-heading text-xl font-bold">
        {{ isEdit ? t('admin.users.edit') : t('admin.users.new') }}
      </h3>

      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.users.firstName') }}</span>
          <input
            v-model="firstName"
            type="text"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.users.lastName') }}</span>
          <input
            v-model="lastName"
            type="text"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>
      </div>

      <label class="block">
        <span class="text-sm font-medium">{{ t('auth.email') }}</span>
        <input
          v-model="email"
          type="email"
          :disabled="isEdit"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none disabled:opacity-60"
        />
        <p v-if="isEdit" class="text-xs text-gray-500 mt-1">{{ t('admin.users.emailLocked') }}</p>
      </label>

      <div>
        <span class="text-sm font-medium">{{ t('admin.users.role.label') }}</span>
        <div class="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            class="px-3 py-2 rounded-lg border text-sm font-medium"
            :class="role === 'admin' ? 'border-brand-primary bg-brand-primary/5 text-brand-primary' : 'border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar'"
            @click="role = 'admin'"
          >
            <div class="font-semibold">{{ t('admin.users.role.admin') }}</div>
            <div class="text-xs text-gray-500">{{ t('admin.users.role.adminHint') }}</div>
          </button>
          <button
            type="button"
            class="px-3 py-2 rounded-lg border text-sm font-medium"
            :class="role === 'employee' ? 'border-brand-purple bg-brand-purple/5 text-brand-purple' : 'border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar'"
            @click="role = 'employee'"
          >
            <div class="font-semibold">{{ t('admin.users.role.employee') }}</div>
            <div class="text-xs text-gray-500">{{ t('admin.users.role.employeeHint') }}</div>
          </button>
        </div>
      </div>

      <label class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-sidebar cursor-pointer">
        <input v-model="active" type="checkbox" class="w-4 h-4 accent-brand-primary" />
        <div>
          <div class="text-sm font-medium">{{ t('admin.users.active') }}</div>
          <div class="text-xs text-gray-500">{{ t('admin.users.activeHint') }}</div>
        </div>
      </label>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar"
          :disabled="saving"
          @click="close"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>
