<script setup lang="ts">
// * Supabase redirect target after email confirmation / magic link.
// * Once the session is set, route by role.
import { useAuthStore } from '~/stores/auth'

definePageMeta({ middleware: [] })

const user = useSupabaseUser()
const auth = useAuthStore()

watchEffect(async () => {
  if (!user.value) return
  await auth.fetchProfile()
  if (auth.isBackoffice) await navigateTo('/admin', { replace: true })
  else await navigateTo('/', { replace: true })
})
</script>

<template>
  <section class="min-h-[60vh] flex items-center justify-center text-center">
    <div>
      <p class="text-lg">{{ $t('common.loading') }}</p>
    </div>
  </section>
</template>
