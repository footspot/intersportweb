<script setup lang="ts">
import type { User } from '~/stores/users'

interface Props {
  user: User
  currentUserId?: string | null
}
const props = defineProps<Props>()
defineEmits<{
  (e: 'edit', u: User): void
  (e: 'delete', u: User): void
  (e: 'toggle', u: User): void
}>()

const { t } = useI18n()

const isSelf = computed(() => !!props.currentUserId && props.user.id === props.currentUserId)
// * Employees can be disabled (toggled). Admins cannot be disabled — neither
// * other admins nor oneself.
const canToggle = computed(() => props.user.role === 'employee')
// * Delete: any employee, or the caller's own admin account. Other admins are
// * protected.
const canDelete = computed(() => props.user.role === 'employee' || isSelf.value)

const initials = computed(() => {
  const n = props.user.full_name?.trim() || props.user.email
  return n
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
})

const roleClass = computed(() =>
  props.user.role === 'admin'
    ? 'bg-brand-primary/10 text-brand-primary'
    : 'bg-brand-purple/10 text-brand-purple',
)
</script>

<template>
  <article class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5 space-y-4 flex flex-col" :class="!user.active ? 'opacity-60' : ''">
    <div class="flex items-start gap-3">
      <div class="w-12 h-12 rounded-full bg-gradient-to-br from-brand-primary to-brand-primary-light flex items-center justify-center text-white font-heading font-bold shrink-0">
        {{ initials }}
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="font-heading text-base font-bold truncate">{{ user.full_name || user.email }}</h3>
        <p class="text-xs text-gray-500 truncate">{{ user.email }}</p>
        <div class="flex items-center gap-2 mt-2">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs" :class="roleClass">
            {{ t(`admin.users.role.${user.role}`) }}
          </span>
          <span
            v-if="!user.active"
            class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-brand-secondary/10 text-brand-secondary"
          >
            {{ t('admin.users.inactive') }}
          </span>
        </div>
      </div>
    </div>

    <div class="flex justify-end gap-1 pt-2 border-t border-gray-100 dark:border-sidebar">
      <button
        v-if="canToggle"
        type="button"
        class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
        :title="user.active ? t('admin.users.deactivate') : t('admin.users.reactivate')"
        @click="$emit('toggle', user)"
      >
        <UIcon :name="user.active ? 'i-lucide-user-x' : 'i-lucide-user-check'" class="w-4 h-4" />
      </button>
      <button
        type="button"
        class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
        :aria-label="t('common.edit')"
        @click="$emit('edit', user)"
      >
        <UIcon name="i-lucide-pencil" class="w-4 h-4" />
      </button>
      <button
        v-if="canDelete"
        type="button"
        class="p-2 rounded-lg hover:bg-brand-secondary/10 text-brand-secondary"
        :title="isSelf ? t('admin.users.deleteSelf') : t('common.delete')"
        :aria-label="isSelf ? t('admin.users.deleteSelf') : t('common.delete')"
        @click="$emit('delete', user)"
      >
        <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
      </button>
    </div>
  </article>
</template>
