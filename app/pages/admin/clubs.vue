<script setup lang="ts">
// * /admin/clubs — grid of ClubCards, admin-only. Creating a club requires a sport.
import { useClubsStore, type Club } from '~/stores/clubs'
import { useSportsStore } from '~/stores/sports'

definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const { t } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const clubs = useClubsStore()
const sports = useSportsStore()

const showForm = ref(false)
const editing = ref<Club | null>(null)

const confirmOpen = ref(false)
const deleting = ref<Club | null>(null)
const confirmBusy = ref(false)
const deleteError = ref<string | null>(null)

const pwdModalOpen = ref(false)
const pwdTarget = ref<Club | null>(null)
const pwdValue = ref('')
const pwdSaving = ref(false)
const pwdError = ref<string | null>(null)

const filterSport = ref<'all' | string>('all')

const filteredClubs = computed<Club[]>(() => {
  const list = clubs.items
  if (filterSport.value === 'all') return list
  return list.filter((c) => c.sport_id === filterSport.value)
})

await useAsyncData('admin-clubs-page', async () => {
  await Promise.all([sports.fetchAll(), clubs.fetchAll()])
  return true
})

function openCreate() {
  editing.value = null
  showForm.value = true
}
function openEdit(c: Club) {
  editing.value = c
  showForm.value = true
}

function askDelete(c: Club) {
  deleting.value = c
  deleteError.value = null
  confirmOpen.value = true
}
async function doDelete() {
  if (!deleting.value) return
  confirmBusy.value = true
  deleteError.value = null
  try {
    await clubs.remove(deleting.value.id)
    confirmOpen.value = false
    deleting.value = null
  } catch (err: any) {
    if (err?.message === 'club_has_products') {
      deleteError.value = t('admin.clubs.errors.hasProducts')
    } else {
      deleteError.value = edgeErrorMessage(err)
    }
  } finally {
    confirmBusy.value = false
  }
}

function openPwd(c: Club) {
  pwdTarget.value = c
  pwdValue.value = ''
  pwdError.value = null
  pwdModalOpen.value = true
}
async function savePwd(action: 'set' | 'clear') {
  if (!pwdTarget.value) return
  pwdSaving.value = true
  pwdError.value = null
  try {
    if (action === 'clear') {
      await clubs.resetPassword(pwdTarget.value.id, null)
    } else {
      if (!pwdValue.value || pwdValue.value.length < 4) {
        pwdError.value = t('admin.clubs.errors.passwordTooShort')
        return
      }
      await clubs.resetPassword(pwdTarget.value.id, pwdValue.value)
    }
    pwdModalOpen.value = false
    pwdTarget.value = null
  } catch (err) {
    pwdError.value = edgeErrorMessage(err)
  } finally {
    pwdSaving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('admin.clubs.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.clubs.subtitle') }}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark"
        @click="openCreate"
      >
        <UIcon name="i-lucide-plus" class="w-4 h-4" />
        <span>{{ t('admin.clubs.new') }}</span>
      </button>
    </div>

    <div v-if="sports.sorted.length === 0" class="bg-brand-gold/10 border border-brand-gold/30 text-brand-gold rounded-card p-4 text-sm">
      <UIcon name="i-lucide-info" class="w-4 h-4 inline mr-1" />
      {{ t('admin.clubs.noSportsHint') }}
      <NuxtLink to="/admin/sports" class="underline ml-2">{{ t('admin.clubs.goCreateSport') }}</NuxtLink>
    </div>

    <div v-if="sports.sorted.length > 0" class="flex flex-wrap gap-2">
      <button
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium"
        :class="filterSport === 'all' ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
        @click="filterSport = 'all'"
      >
        {{ t('admin.clubs.filterAll') }}
      </button>
      <button
        v-for="s in sports.sorted"
        :key="s.id"
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium"
        :class="filterSport === s.id ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
        @click="filterSport = s.id"
      >
        {{ s.name.fr }}
      </button>
    </div>

    <div v-if="clubs.loading" class="p-10 text-center text-gray-500">
      {{ t('common.loading') }}
    </div>
    <div v-else-if="filteredClubs.length === 0" class="p-10 text-center bg-white dark:bg-sidebar-surface rounded-card">
      <UIcon name="i-lucide-shield" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p class="text-gray-500">{{ t('admin.clubs.empty') }}</p>
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <AdminClubsClubCard
        v-for="c in filteredClubs"
        :key="c.id"
        :club="c"
        :sport="sports.byId(c.sport_id)"
        @edit="openEdit"
        @delete="askDelete"
        @reset-password="openPwd"
      />
    </div>

    <AdminClubsClubFormModal
      v-model="showForm"
      :club="editing"
      @saved="clubs.fetchAll()"
    />

    <AdminConfirmDialog
      v-model="confirmOpen"
      :title="t('admin.clubs.deleteTitle')"
      :message="deleteError || t('admin.clubs.deleteConfirm', { name: deleting?.name ?? '' })"
      :busy="confirmBusy"
      require-typed
      @confirm="doDelete"
    />

    <!-- * Reset password modal -->
    <div
      v-if="pwdModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      @click.self="pwdModalOpen = false"
    >
      <div class="w-full max-w-md bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4">
        <h3 class="font-heading text-lg font-bold">
          {{ t('admin.clubs.resetPasswordFor', { name: pwdTarget?.name ?? '' }) }}
        </h3>
        <AdminClubsClubPasswordField
          v-model="pwdValue"
          :has-existing="!!pwdTarget?.is_password_protected"
          :label="t('admin.clubs.newPassword')"
        />
        <p v-if="pwdError" class="text-sm text-brand-secondary">{{ pwdError }}</p>
        <div class="flex items-center justify-between gap-2 pt-2">
          <button
            v-if="pwdTarget?.is_password_protected"
            type="button"
            class="text-xs text-brand-secondary hover:underline"
            :disabled="pwdSaving"
            @click="savePwd('clear')"
          >
            {{ t('admin.clubs.clearPassword') }}
          </button>
          <div v-else></div>
          <div class="flex gap-2">
            <button
              type="button"
              class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar"
              :disabled="pwdSaving"
              @click="pwdModalOpen = false"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              type="button"
              class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
              :disabled="pwdSaving"
              @click="savePwd('set')"
            >
              {{ pwdSaving ? t('common.loading') : t('common.save') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
