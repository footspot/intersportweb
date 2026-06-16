<script setup lang="ts">
// * Cart drawer lives in the layout so it's available everywhere the customer
// * can browse and shop. The open state is a shared useState flipped by AppHeader.
const cartOpen = useState('customer:cart-open', () => false)
</script>

<template>
  <div class="min-h-screen flex flex-col bg-white dark:bg-sidebar-bg text-gray-900 dark:text-gray-100">
    <ClientOnly>
      <LayoutAppScrollProgress />
    </ClientOnly>

    <LayoutAppHeader />
    <main class="flex-1">
      <slot />
    </main>
    <LayoutAppFooter />

    <CartDrawer v-model="cartOpen" />
  </div>
</template>
