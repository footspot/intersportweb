<script setup lang="ts">
// * Thin red progress bar fixed at the very top, tracking scroll percentage.
const width = ref(0)

function onScroll() {
  const h = document.documentElement.scrollHeight - window.innerHeight
  width.value = h > 0 ? (window.scrollY / h) * 100 : 0
}

onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
})
</script>

<template>
  <div class="scroll-progress" :style="{ width: width + '%' }" aria-hidden="true"></div>
</template>

<style scoped>
.scroll-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  background: var(--color-accent);
  z-index: 200;
  will-change: width;
}
</style>
