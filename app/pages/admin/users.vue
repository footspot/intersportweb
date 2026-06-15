<script setup lang="ts">
// * /admin/users — admin-only. Provisions admin/employee accounts.
// * Customers self-register on the storefront and are NOT listed here.
import { useUsersStore, type User } from '~/stores/users'
import { useAuthStore } from '~/stores/auth'

definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const { t } = useI18n()
const { edgeErrorMessage, notifyEdgeError } = useEdgeError()
const users = useUsersStore()
const auth = useAuthStore()

type FilterValue = 'all' | 'admin' | 'employee' | 'inactive'
const filter = ref<FilterValue>('all')

const showForm = ref(false)
const editing = ref<User | null>(null)

const confirmOpen = ref(false)
const deleting = ref<User | null>(null)
const confirmBusy = ref(false)
const deleteError = ref<string | null>(null)

// * Self-deletion (admin removing their own account) goes through a re-auth modal.
const selfDeleteOpen = ref(false)

await useAsyncData('admin-users-page', async () => { await users.fetchAll(); return true })

const filtered = computed<User[]>(() => {
  if (filter.value === 'all') return users.items
  if (filter.value === 'inactive') return users.items.filter((u) => !u.active)
  return users.items.filter((u) => u.role === filter.value && u.active)
})

function openCreate() {
  editing.value = null
  showForm.value = true
}
function openEdit(u: User) {
  editing.value = u
  showForm.value = true
}

async function toggleActive(u: User) {
  try {
    await users.update({ id: u.id, active: !u.active })
  } catch (err) {
    notifyEdgeError(err)
  }
}

function askDelete(u: User) {
  deleting.value = u
  deleteError.value = null
  // * Deleting one's own admin account requires re-authentication.
  if (u.id === auth.profile?.id) {
    selfDeleteOpen.value = true
  } else {
    confirmOpen.value = true
  }
}
async function doDelete() {
  if (!deleting.value) return
  confirmBusy.value = true
  deleteError.value = null
  try {
    await users.remove(deleting.value.id)
    confirmOpen.value = false
    deleting.value = null
  } catch (err: any) {
    if (err?.message === 'last_admin') {
      deleteError.value = t('admin.users.errors.lastAdmin')
    } else if (err?.message === 'cannot_delete_admin') {
      deleteError.value = t('admin.users.errors.cannotDeleteAdmin')
    } else {
      deleteError.value = edgeErrorMessage(err)
    }
  } finally {
    confirmBusy.value = false
  }
}

// * Re-auth succeeded — delete the caller's own account, then sign out.
async function onSelfDeleteConfirmed() {
  if (!deleting.value) return
  try {
    await users.remove(deleting.value.id)
    selfDeleteOpen.value = false
    deleting.value = null
    await auth.signOut()
  } catch (err: any) {
    // * Re-auth passed but the delete itself failed (e.g. last admin) — close
    // * the modal and surface the reason.
    selfDeleteOpen.value = false
    deleting.value = null
    notifyEdgeError(err)
  }
}

// * Credentials snackbar after a new user is created
const lastCreated = computed(() => users.lastCreated)
function dismissCredentials() {
  users.clearLastCreated()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('admin.users.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.users.subtitle') }}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark"
        @click="openCreate"
      >
        <UIcon name="i-lucide-user-plus" class="w-4 h-4" />
        <span>{{ t('admin.users.new') }}</span>
      </button>
    </div>

    <!-- Credentials banner (shown right after a new user is created) -->
    <div
      v-if="lastCreated"
      class="bg-brand-green/10 border border-brand-green/30 rounded-card p-4 text-sm space-y-2"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-2">
          <UIcon name="i-lucide-check-circle-2" class="w-5 h-5 text-brand-green shrink-0 mt-0.5" />
          <div>
            <div class="font-medium text-brand-green">{{ t('admin.users.created.title') }}</div>
            <!-- Credentials were emailed to the new user -->
            <p v-if="lastCreated.emailed" class="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {{ t('admin.users.created.emailed', { email: lastCreated.email ?? '' }) }}
            </p>
            <!-- Email failed or password supplied by admin — show it as a fallback -->
            <template v-else>
              <div v-if="lastCreated.password" class="mt-1">
                {{ t('admin.users.created.password') }}:
                <code class="font-mono px-2 py-0.5 rounded bg-white dark:bg-sidebar-surface text-brand-primary">{{ lastCreated.password }}</code>
              </div>
              <div v-if="lastCreated.link" class="mt-1 text-xs text-gray-500 break-all">
                {{ t('admin.users.created.magicLink') }}:
                <a :href="lastCreated.link" class="text-brand-primary hover:underline">{{ lastCreated.link }}</a>
              </div>
              <p class="text-xs text-gray-500 mt-1">{{ t('admin.users.created.emailFailed') }}</p>
            </template>
          </div>
        </div>
        <button type="button" class="text-gray-400 hover:text-gray-600" @click="dismissCredentials">
          <UIcon name="i-lucide-x" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="f in (['all', 'admin', 'employee', 'inactive'] as FilterValue[])"
        :key="f"
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium"
        :class="filter === f ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
        @click="filter = f"
      >
        {{ t(`admin.users.filter.${f}`) }}
      </button>
    </div>

    <div v-if="users.loading" class="p-10 text-center text-gray-500">
      {{ t('common.loading') }}
    </div>
    <div v-else-if="filtered.length === 0" class="p-10 text-center bg-white dark:bg-sidebar-surface rounded-card">
      <UIcon name="i-lucide-users" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p class="text-gray-500">{{ t('admin.users.empty') }}</p>
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <AdminUsersUserCard
        v-for="u in filtered"
        :key="u.id"
        :user="u"
        :current-user-id="auth.profile?.id"
        @edit="openEdit"
        @toggle="toggleActive"
        @delete="askDelete"
      />
    </div>

    <AdminUsersUserFormModal v-model="showForm" :user="editing" @saved="users.fetchAll()" />

    <AdminConfirmDialog
      v-model="confirmOpen"
      :title="t('admin.users.deleteTitle')"
      :message="deleteError || t('admin.users.deleteConfirm', { name: deleting?.full_name ?? deleting?.email ?? '' })"
      :busy="confirmBusy"
      require-typed
      @confirm="doDelete"
    />

    <AdminUsersSelfDeleteModal
      v-model="selfDeleteOpen"
      :email="deleting?.email ?? ''"
      @confirmed="onSelfDeleteConfirmed"
    />
  </div>
</template>
