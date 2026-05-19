<script setup lang="ts">
interface Row {
  product_id: string
  name: { fr: string; en: string }
  reference: string
  club_name: string | null
  qty: number
  revenue: number
  margin: number
}
defineProps<{ rows: Row[] }>()

const { t, locale } = useI18n()

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}
</script>

<template>
  <div>
    <h4 class="font-heading font-bold mb-2">{{ t('admin.stats.bestSellers') }}</h4>
    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div v-if="rows.length === 0" class="py-12 text-center text-sm text-gray-500">
        {{ t('admin.stats.noData') }}
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th class="px-4 py-3">{{ t('admin.stats.col.product') }}</th>
            <th class="px-4 py-3">{{ t('admin.stats.col.club') }}</th>
            <th class="px-4 py-3 text-right">{{ t('admin.stats.col.qty') }}</th>
            <th class="px-4 py-3 text-right">{{ t('admin.stats.col.revenue') }}</th>
            <th class="px-4 py-3 text-right">{{ t('admin.stats.col.margin') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.product_id" class="border-t border-gray-100 dark:border-sidebar">
            <td class="px-4 py-3">
              <div class="font-medium">{{ r.name[locale as 'fr' | 'en'] ?? r.name.fr }}</div>
              <div class="text-xs text-gray-500">{{ r.reference }}</div>
            </td>
            <td class="px-4 py-3 text-gray-600 dark:text-gray-300">{{ r.club_name ?? '—' }}</td>
            <td class="px-4 py-3 text-right font-medium">{{ r.qty }}</td>
            <td class="px-4 py-3 text-right">{{ fmt(r.revenue) }}</td>
            <td class="px-4 py-3 text-right text-brand-green">{{ fmt(r.margin) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
