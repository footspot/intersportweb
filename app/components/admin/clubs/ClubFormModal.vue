<script setup lang="ts">
import { useClubsStore, type Club } from '~/stores/clubs'
import { useSportsStore } from '~/stores/sports'

interface Props {
  modelValue: boolean
  club: Club | null              // * null = create
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'saved'): void
}>()

const { t, locale } = useI18n()
const clubs = useClubsStore()
const sports = useSportsStore()

const name = ref('')
const sportId = ref('')
const logoPath = ref<string | null>(null)
const logoFile = ref<File | null>(null)
const protectedFlag = ref(false)
const password = ref('')
const useAccent = ref(false)
const accentColorValue = ref('#3B82F6')
const slogan = ref('')
const saving = ref(false)
const errorMsg = ref<string | null>(null)

const isEdit = computed(() => !!props.club)
const hasExistingPassword = computed(
  () => isEdit.value && !!props.club?.is_password_protected,
)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    name.value = props.club?.name ?? ''
    sportId.value = props.club?.sport_id ?? (sports.sorted[0]?.id ?? '')
    logoPath.value = props.club?.logo_path ?? null
    logoFile.value = null
    protectedFlag.value = props.club?.is_password_protected ?? false
    password.value = ''
    useAccent.value = !!props.club?.accent_color
    accentColorValue.value = props.club?.accent_color ?? '#3B82F6'
    slogan.value = props.club?.slogan ?? ''
    errorMsg.value = null
  },
  { immediate: true },
)

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function save() {
  errorMsg.value = null
  if (!name.value.trim()) {
    errorMsg.value = t('admin.clubs.errors.nameRequired')
    return
  }
  if (!sportId.value) {
    errorMsg.value = t('admin.clubs.errors.sportRequired')
    return
  }
  if (protectedFlag.value && !isEdit.value && !password.value) {
    errorMsg.value = t('admin.clubs.errors.passwordRequired')
    return
  }

  saving.value = true
  try {
    const clearLogo = !logoFile.value && !logoPath.value && !!props.club?.logo_path
    const base = {
      sport_id: sportId.value,
      name: name.value.trim(),
      is_password_protected: protectedFlag.value,
      password: password.value || null,
      clear_logo: clearLogo,
      file: logoFile.value,
      accent_color: useAccent.value ? accentColorValue.value : null,
      slogan: slogan.value.trim() || null,
    }
    if (props.club) {
      await clubs.update({ id: props.club.id, ...base })
    } else {
      await clubs.create(base)
    }
    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : t('auth.errors.generic')
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
        {{ isEdit ? t('admin.clubs.edit') : t('admin.clubs.new') }}
      </h3>

      <div v-if="sports.sorted.length === 0" class="p-4 rounded-lg bg-brand-gold/10 text-sm text-brand-gold">
        <UIcon name="i-lucide-alert-circle" class="w-4 h-4 inline mr-1" />
        {{ t('admin.clubs.noSportsHint') }}
      </div>

      <template v-else>
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.clubs.name') }}</span>
          <input
            v-model="name"
            type="text"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.clubs.sport') }}</span>
          <select
            v-model="sportId"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-white dark:bg-sidebar-surface focus:ring-2 focus:ring-brand-primary focus:outline-none"
          >
            <option v-for="s in sports.sorted" :key="s.id" :value="s.id">
              {{ s.name[locale as 'fr' | 'en'] ?? s.name.fr }}
            </option>
          </select>
        </label>

        <AdminImageUploader
          v-model:path="logoPath"
          v-model:file="logoFile"
          bucket="club-logos"
          :label="t('admin.clubs.logo')"
        />

        <!-- * Accent colour -->
        <div class="space-y-2">
          <label class="flex items-center gap-3 cursor-pointer">
            <input v-model="useAccent" type="checkbox" class="w-4 h-4 accent-brand-primary" />
            <span class="text-sm font-medium">{{ t('admin.clubs.accentColor') }}</span>
          </label>
          <div v-if="useAccent" class="flex items-center gap-3 pl-7">
            <input
              v-model="accentColorValue"
              type="color"
              class="h-9 w-14 rounded-lg cursor-pointer border border-gray-300 dark:border-sidebar p-0.5 bg-transparent"
            />
            <span class="text-xs text-gray-500 font-mono">{{ accentColorValue }}</span>
            <p class="text-xs text-gray-400">{{ t('admin.clubs.accentColorHint') }}</p>
          </div>
        </div>

        <!-- * Slogan -->
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.clubs.slogan') }}</span>
          <input
            v-model="slogan"
            type="text"
            maxlength="80"
            :placeholder="t('admin.clubs.sloganPlaceholder')"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none text-sm"
          />
          <p class="text-xs text-gray-400 mt-1">{{ slogan.length }}/80</p>
        </label>

        <label class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-sidebar cursor-pointer">
          <input v-model="protectedFlag" type="checkbox" class="w-4 h-4 accent-brand-primary" />
          <div>
            <div class="text-sm font-medium">{{ t('admin.clubs.passwordProtect') }}</div>
            <div class="text-xs text-gray-500">{{ t('admin.clubs.passwordProtectHint') }}</div>
          </div>
        </label>

        <AdminClubsClubPasswordField
          v-if="protectedFlag"
          v-model="password"
          :has-existing="hasExistingPassword"
          :required="!isEdit || !hasExistingPassword"
        />
      </template>

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
          :disabled="saving || sports.sorted.length === 0"
          @click="save"
        >
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>
