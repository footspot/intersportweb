<script setup lang="ts">
// * /admin/sports — admin-only CRUD for sports.
// * Drag-to-reorder uses the HTML5 drag API; the order is committed batch to the edge fn.
import { useSportsStore, type Sport } from '~/stores/sports'

definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const { t, locale } = useI18n()
const sports = useSportsStore()
const client = useSupabaseClient()

const showForm = ref(false)
const editing = ref<Sport | null>(null)
const confirmOpen = ref(false)
const deleting = ref<Sport | null>(null)
const confirmBusy = ref(false)
const deleteError = ref<string | null>(null)

// * Local ordered snapshot, mutated during drag then committed.
const rows = ref<Sport[]>([])
const draggingId = ref<string | null>(null)
const overId = ref<string | null>(null)

watch(
  () => sports.sorted,
  (next) => {
    rows.value = [...next]
  },
  { immediate: true },
)

await useAsyncData('admin-sports-list', async () => { await sports.fetchAll(); return true })

function iconUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('sports-icons').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function openCreate() {
  editing.value = null
  showForm.value = true
}

function openEdit(s: Sport) {
  editing.value = s
  showForm.value = true
}

function askDelete(s: Sport) {
  deleting.value = s
  deleteError.value = null
  confirmOpen.value = true
}

async function doDelete() {
  if (!deleting.value) return
  confirmBusy.value = true
  deleteError.value = null
  try {
    await sports.remove(deleting.value.id)
    confirmOpen.value = false
    deleting.value = null
  } catch (err: any) {
    if (err?.code === 'sport_has_clubs' || err?.message === 'sport_has_clubs') {
      deleteError.value = t('admin.sports.errors.hasClubs')
    } else {
      deleteError.value = err instanceof Error ? err.message : t('auth.errors.generic')
    }
  } finally {
    confirmBusy.value = false
  }
}

function onDragStart(id: string) {
  draggingId.value = id
}
function onDragOver(id: string, e: DragEvent) {
  e.preventDefault()
  overId.value = id
}
function onDrop(targetId: string) {
  if (!draggingId.value || draggingId.value === targetId) {
    draggingId.value = null
    overId.value = null
    return
  }
  const from = rows.value.findIndex((r) => r.id === draggingId.value)
  const to = rows.value.findIndex((r) => r.id === targetId)
  if (from < 0 || to < 0) return
  const moved = rows.value.splice(from, 1)[0]
  rows.value.splice(to, 0, moved)
  draggingId.value = null
  overId.value = null
  commitOrder()
}

const savingOrder = ref(false)
async function commitOrder() {
  savingOrder.value = true
  try {
    const order = rows.value.map((r, idx) => ({ id: r.id, sort_order: idx }))
    await sports.reorder(order)
  } catch (err) {
    console.error(err)
    await sports.fetchAll()
  } finally {
    savingOrder.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('admin.sports.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.sports.subtitle') }}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark"
        @click="openCreate"
      >
        <UIcon name="i-lucide-plus" class="w-4 h-4" />
        <span>{{ t('admin.sports.new') }}</span>
      </button>
    </div>

    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div v-if="sports.loading" class="p-10 text-center text-gray-500">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="rows.length === 0" class="p-10 text-center">
        <UIcon name="i-lucide-trophy" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">{{ t('admin.sports.empty') }}</p>
        <button
          type="button"
          class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark"
          @click="openCreate"
        >
          {{ t('admin.sports.new') }}
        </button>
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th class="px-4 py-3 w-8"></th>
            <th class="px-4 py-3">{{ t('admin.sports.col.icon') }}</th>
            <th class="px-4 py-3">{{ t('admin.sports.col.name') }}</th>
            <th class="px-4 py-3">{{ t('admin.sports.col.order') }}</th>
            <th class="px-4 py-3 text-right">{{ t('admin.sports.col.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(s, idx) in rows"
            :key="s.id"
            draggable="true"
            class="border-t border-gray-100 dark:border-sidebar transition-colors"
            :class="[
              draggingId === s.id ? 'opacity-40' : '',
              overId === s.id ? 'bg-brand-primary/5' : '',
            ]"
            @dragstart="onDragStart(s.id)"
            @dragover="onDragOver(s.id, $event)"
            @drop="onDrop(s.id)"
            @dragend="draggingId = null; overId = null"
          >
            <td class="px-4 py-3 text-gray-400 cursor-grab">
              <UIcon name="i-lucide-grip-vertical" class="w-4 h-4" />
            </td>
            <td class="px-4 py-3">
              <div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-sidebar flex items-center justify-center overflow-hidden">
                <img v-if="iconUrl(s.icon_path)" :src="iconUrl(s.icon_path)!" class="w-full h-full object-cover" alt="" />
                <UIcon v-else name="i-lucide-trophy" class="w-5 h-5 text-gray-400" />
              </div>
            </td>
            <td class="px-4 py-3 font-medium">{{ s.name.fr }}</td>
            <td class="px-4 py-3 text-gray-500">{{ idx + 1 }}</td>
            <td class="px-4 py-3 text-right space-x-1">
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
                :aria-label="t('common.edit')"
                @click="openEdit(s)"
              >
                <UIcon name="i-lucide-pencil" class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-brand-secondary/10 text-brand-secondary"
                :aria-label="t('common.delete')"
                @click="askDelete(s)"
              >
                <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="savingOrder" class="px-4 py-2 text-xs text-gray-500 border-t border-gray-100 dark:border-sidebar">
        {{ t('admin.sports.savingOrder') }}
      </div>
    </div>

    <AdminSportsSportFormModal
      v-model="showForm"
      :sport="editing"
      @saved="sports.fetchAll()"
    />

    <AdminConfirmDialog
      v-model="confirmOpen"
      :title="t('admin.sports.deleteTitle')"
      :message="deleteError || t('admin.sports.deleteConfirm', { name: deleting?.name.fr ?? '' })"
      :busy="confirmBusy"
      require-typed
      @confirm="doDelete"
    />
  </div>
</template>
