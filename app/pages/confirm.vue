<script setup lang="ts">
// * Supabase redirect target after email confirmation / magic link.
// * This is the CUSTOMER passwordless surface only — once the session is set we
// * route the (customer) user to their order history.
import { useAuthStore } from '~/stores/auth'

definePageMeta({ middleware: [] })

const user = useSupabaseUser()
const client = useSupabaseClient()
const auth = useAuthStore()

watchEffect(async () => {
  if (!user.value) return
  await auth.fetchProfile()

  // * SECURITY: the magic-link flow must NEVER grant back-office access. A
  // * back-office account (admin/employee) reaching here — e.g. someone typed an
  // * admin email on the customer login page — would otherwise bypass the
  // * password + 2FA gate on /admin/login. Tear the session down and send them
  // * to the proper back-office login. (Server-side, verifyAdmin/verifyBackoffice
  // * also reject passwordless sessions, so a stolen magic-link token can't hit
  // * admin endpoints directly either.)
  if (auth.isBackoffice) {
    await client.auth.signOut()
    auth.profile = null
    await navigateTo('/admin/login?error=use_admin_login', { replace: true })
    return
  }

  // * Storefront customers land on their order history after a magic link.
  await navigateTo('/account', { replace: true })
})
</script>

<template>
  <section class="min-h-[60vh] flex items-center justify-center text-center">
    <div>
      <p class="text-lg">{{ $t('common.loading') }}</p>
    </div>
  </section>
</template>
