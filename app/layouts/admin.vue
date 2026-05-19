<template>
  <div class="min-h-screen flex bg-gray-50 dark:bg-sidebar-bg text-gray-900 dark:text-gray-100">
    <AdminSidebar />
    <div class="flex-1 flex flex-col min-w-0">
      <AdminTopbar />
      <main class="flex-1 p-6 overflow-auto">
        <slot />
      </main>
    </div>
  </div>
</template>
