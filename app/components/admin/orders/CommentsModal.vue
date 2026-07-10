<script setup lang="ts">
// * Internal comments modal — admin/employee notes attached to an order.
// * Comments live in order_comments (service-role only) and are NEVER visible
// * on the shop side. A comment can optionally mention a staff member's name.
import { useOrdersStore, type Order, type OrderComment, type StaffOption } from '~/stores/orders'
import { useAuthStore } from '~/stores/auth'

interface Props {
  modelValue: boolean
  order: Order | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
}>()

const { t } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const orders = useOrdersStore()
const auth = useAuthStore()

const comments = ref<OrderComment[]>([])
const staff = ref<StaffOption[]>([])
const loading = ref(false)
const saving = ref(false)
const deletingId = ref<string | null>(null)
const errorMsg = ref<string | null>(null)

const body = ref('')
const staffName = ref('')

watch(
  () => [props.modelValue, props.order?.id],
  async () => {
    if (!props.modelValue || !props.order) return
    loading.value = true
    errorMsg.value = null
    try {
      const res = await orders.fetchComments(props.order.id)
      comments.value = res.comments
      staff.value = res.staff
    } catch (err) {
      errorMsg.value = edgeErrorMessage(err)
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

function close() {
  body.value = ''
  staffName.value = ''
  errorMsg.value = null
  emit('update:modelValue', false)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

async function submit() {
  if (!props.order || !body.value.trim() || saving.value) return
  saving.value = true
  errorMsg.value = null
  try {
    const c = await orders.addComment(props.order.id, body.value.trim(), staffName.value || null)
    if (c) comments.value.unshift(c)
    body.value = ''
    staffName.value = ''
  } catch (err) {
    errorMsg.value = edgeErrorMessage(err)
  } finally {
    saving.value = false
  }
}

function canDelete(c: OrderComment) {
  return auth.isAdmin || c.author_id === auth.profile?.id
}

async function remove(c: OrderComment) {
  if (deletingId.value) return
  deletingId.value = c.id
  errorMsg.value = null
  try {
    await orders.deleteComment(c.id)
    comments.value = comments.value.filter((x) => x.id !== c.id)
  } catch (err) {
    errorMsg.value = edgeErrorMessage(err)
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/50" @click="close" />
    <div class="relative w-full max-w-lg bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg max-h-[85vh] flex flex-col">
      <div class="px-5 py-4 border-b border-gray-100 dark:border-sidebar flex items-center justify-between">
        <div>
          <h3 class="font-heading font-bold">{{ t('admin.orders.comments.title', { n: order?.order_number ?? '' }) }}</h3>
          <p class="text-xs text-gray-500">{{ t('admin.orders.comments.internalHint') }}</p>
        </div>
        <button type="button" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar" :aria-label="t('common.cancel')" @click="close">
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>

      <!-- Add form -->
      <form class="px-5 py-4 border-b border-gray-100 dark:border-sidebar space-y-2" @submit.prevent="submit">
        <textarea
          v-model="body"
          rows="3"
          :placeholder="t('admin.orders.comments.placeholder')"
          class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none resize-none"
        />
        <div class="flex items-center gap-2">
          <select
            v-model="staffName"
            class="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
          >
            <option value="">{{ t('admin.orders.comments.noStaff') }}</option>
            <option v-for="s in staff" :key="s.id" :value="s.name">{{ s.name }}</option>
          </select>
          <button
            type="submit"
            class="px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium disabled:opacity-60"
            :disabled="saving || !body.trim()"
          >
            {{ saving ? t('common.loading') : t('admin.orders.comments.add') }}
          </button>
        </div>
        <p v-if="errorMsg" class="text-xs text-brand-secondary">{{ errorMsg }}</p>
      </form>

      <!-- List -->
      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        <div v-if="loading" class="text-sm text-gray-500">{{ t('common.loading') }}</div>
        <div v-else-if="comments.length === 0" class="text-sm text-gray-500 italic">
          {{ t('admin.orders.comments.empty') }}
        </div>
        <div v-for="c in comments" :key="c.id" class="p-3 rounded-lg bg-gray-50 dark:bg-sidebar text-sm space-y-1">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-medium truncate">{{ c.author_name }}</span>
              <span
                v-if="c.staff_name"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-brand-primary/10 text-brand-primary shrink-0"
              >
                <UIcon name="i-lucide-user" class="w-3 h-3" />
                {{ c.staff_name }}
              </span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <span class="text-xs text-gray-500">{{ fmtDate(c.created_at) }}</span>
              <button
                v-if="canDelete(c)"
                type="button"
                class="p-1 rounded hover:bg-brand-secondary/10 text-gray-400 hover:text-brand-secondary disabled:opacity-60"
                :disabled="deletingId === c.id"
                :aria-label="t('common.delete')"
                @click="remove(c)"
              >
                <UIcon name="i-lucide-trash-2" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p class="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{{ c.body }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
