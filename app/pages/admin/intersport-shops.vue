<script setup lang="ts">
// * /admin/intersport-shops — physical pickup points for shop_pickup deliveries.
// * Admin-only (RLS allows direct INSERT/UPDATE/DELETE for admins on this table).
definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const { t } = useI18n()
const client = useSupabaseClient()

interface Shop {
  id: string
  name: string
  address: string
  postal_code: string
  city: string
  phone: string | null
  is_active: boolean
  sort_order: number
}

const shops = ref<Shop[]>([])
const loading = ref(true)
const editing = ref<Partial<Shop> | null>(null)
const showForm = ref(false)
const saving = ref(false)
const formError = ref<string | null>(null)

async function fetchAll() {
  loading.value = true
  const { data, error } = await client
    .from('intersport_shops')
    .select('*')
    .order('sort_order')
    .order('name')
  if (!error) shops.value = (data ?? []) as Shop[]
  loading.value = false
}
await useAsyncData('admin-shops', fetchAll)

function openCreate() {
  editing.value = { name: '', address: '', postal_code: '', city: '', phone: '', is_active: true, sort_order: 0 }
  showForm.value = true
  formError.value = null
}
function openEdit(s: Shop) {
  editing.value = { ...s }
  showForm.value = true
  formError.value = null
}

async function save() {
  if (!editing.value) return
  saving.value = true
  formError.value = null
  const payload = {
    name: editing.value.name?.trim(),
    address: editing.value.address?.trim(),
    postal_code: editing.value.postal_code?.trim(),
    city: editing.value.city?.trim(),
    phone: editing.value.phone?.trim() || null,
    is_active: !!editing.value.is_active,
    sort_order: Number(editing.value.sort_order ?? 0),
  }
  if (!payload.name || !payload.address || !payload.postal_code || !payload.city) {
    formError.value = 'Tous les champs sont requis'
    saving.value = false
    return
  }
  try {
    if (editing.value.id) {
      const { error } = await client.from('intersport_shops').update(payload).eq('id', editing.value.id)
      if (error) throw error
    } else {
      const { error } = await client.from('intersport_shops').insert(payload)
      if (error) throw error
    }
    showForm.value = false
    editing.value = null
    await fetchAll()
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'save_failed'
  } finally {
    saving.value = false
  }
}

async function remove(s: Shop) {
  if (!confirm(`Supprimer "${s.name}" ?`)) return
  await client.from('intersport_shops').delete().eq('id', s.id)
  await fetchAll()
}
</script>

<template>
  <section class="px-4 py-6 max-w-5xl mx-auto space-y-4">
    <header class="flex items-center justify-between gap-3">
      <h1 class="font-heading text-2xl font-bold">{{ t('admin.shops.title') }}</h1>
      <button class="px-3 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark" @click="openCreate">
        {{ t('admin.shops.addShop') }}
      </button>
    </header>

    <div v-if="loading" class="text-gray-400 text-sm">…</div>
    <div v-else-if="shops.length === 0" class="text-sm text-gray-500 italic p-6 bg-gray-50 dark:bg-sidebar-surface rounded-card">
      {{ t('admin.shops.noShops') }}
    </div>
    <div v-else class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar/40 text-left text-xs uppercase text-gray-500">
          <tr>
            <th class="px-4 py-2">{{ t('admin.shops.name') }}</th>
            <th class="px-4 py-2">{{ t('admin.shops.address') }}</th>
            <th class="px-4 py-2">{{ t('admin.shops.city') }}</th>
            <th class="px-4 py-2">{{ t('admin.shops.phone') }}</th>
            <th class="px-4 py-2 text-center">{{ t('admin.shops.active') }}</th>
            <th class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-sidebar">
          <tr v-for="s in shops" :key="s.id">
            <td class="px-4 py-2 font-medium">{{ s.name }}</td>
            <td class="px-4 py-2 text-gray-600">{{ s.address }}</td>
            <td class="px-4 py-2 text-gray-600">{{ s.postal_code }} {{ s.city }}</td>
            <td class="px-4 py-2 text-gray-600">{{ s.phone || '—' }}</td>
            <td class="px-4 py-2 text-center">
              <UIcon v-if="s.is_active" name="i-lucide-check" class="w-4 h-4 text-brand-primary" />
              <UIcon v-else name="i-lucide-x" class="w-4 h-4 text-gray-400" />
            </td>
            <td class="px-4 py-2 text-right">
              <button class="text-xs text-brand-primary hover:underline mr-3" @click="openEdit(s)">{{ t('admin.shops.editShop') }}</button>
              <button class="text-xs text-brand-secondary hover:underline" @click="remove(s)">{{ t('admin.shops.deleteShop') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal v-model:open="showForm">
      <template #content>
      <div v-if="editing" class="p-5 space-y-3 bg-white dark:bg-sidebar-surface rounded-card">
        <h2 class="font-heading font-bold">{{ editing.id ? t('admin.shops.editShop') : t('admin.shops.addShop') }}</h2>
        <label class="block text-sm">
          <span class="font-medium">{{ t('admin.shops.name') }}</span>
          <input v-model="editing.name" class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent" />
        </label>
        <label class="block text-sm">
          <span class="font-medium">{{ t('admin.shops.address') }}</span>
          <input v-model="editing.address" class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent" />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm">
            <span class="font-medium">{{ t('admin.shops.postalCode') }}</span>
            <input v-model="editing.postal_code" class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent" />
          </label>
          <label class="block text-sm">
            <span class="font-medium">{{ t('admin.shops.city') }}</span>
            <input v-model="editing.city" class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent" />
          </label>
        </div>
        <label class="block text-sm">
          <span class="font-medium">{{ t('admin.shops.phone') }}</span>
          <input v-model="editing.phone" class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent" />
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="editing.is_active" type="checkbox" />
          <span>{{ t('admin.shops.active') }}</span>
        </label>
        <p v-if="formError" class="text-xs text-brand-secondary">{{ formError }}</p>
        <div class="flex justify-end gap-2 pt-3">
          <button class="px-3 py-2 text-sm" @click="showForm = false">Annuler</button>
          <button :disabled="saving" class="px-3 py-2 rounded-lg bg-brand-primary text-white text-sm disabled:opacity-60" @click="save">
            {{ saving ? '…' : 'Enregistrer' }}
          </button>
        </div>
      </div>
      </template>
    </UModal>
  </section>
</template>
