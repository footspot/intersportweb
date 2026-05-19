<script setup lang="ts">
// * UApp wires NuxtUI toasts + modals for the whole tree.
// * Page transitions are configured in nuxt.config.ts via app.pageTransition.
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtRouteAnnouncer />
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<style>
/* * Global page + layout transitions (cubic-bezier matches the HTML demo timing) */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.layout-enter-active,
.layout-leave-active {
  transition: opacity 0.25s ease;
}
.layout-enter-from,
.layout-leave-to {
  opacity: 0;
}
</style>
