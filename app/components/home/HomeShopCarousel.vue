<script setup lang="ts">
// * Shop flow — a 2-slide vertical carousel (sports → clubs) that appears once
// * the visitor enters the shop via the "Boutique Club" entry card. Keeps the
// * dynamic slide-height measurement so the viewport grows/shrinks per slide.
import { useHomeFlowCtx } from '~/composables/useHomeFlow'
import type { Sport } from '~/stores/sports'

const flow = useHomeFlowCtx()
const { t } = flow

// * Readable text color (dark ink vs white) for a given background hex, picked
// * by perceived luminance so the sport name + icon stay legible on any tile.
function readableText(hex: string): string {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#111827' : '#ffffff'
}

// * Inline style for a tile that has a custom background. Selected tiles frame
// * themselves with the contrast color; unselected use the background itself.
function sportTileStyle(s: Sport): Record<string, string> {
  if (!s.background_color) return {}
  const text = readableText(s.background_color)
  const selected = flow.selectedSportId.value === s.id
  return { backgroundColor: s.background_color, color: text, borderColor: selected ? text : s.background_color }
}

// * currentSlide 1 = sports, 2 = clubs. Only show during the actual shop flow
// * (browsing sports/clubs = 'idle', or a club selected = 'products') — never
// * while the catalog / clearance / link panels are open.
const open = computed(
  () =>
    flow.currentSlide.value >= 1 &&
    (flow.mode.value === 'idle' || flow.mode.value === 'products'),
)

const slideSportsEl = ref<HTMLElement | null>(null)
const slideClubsEl = ref<HTMLElement | null>(null)
const viewportHeight = ref(0)
const trackOffset = ref(0)

function measure() {
  const sportsH = slideSportsEl.value?.offsetHeight ?? 0
  const clubsH = slideClubsEl.value?.offsetHeight ?? 0
  if (flow.currentSlide.value <= 1) {
    viewportHeight.value = sportsH
    trackOffset.value = 0
  } else {
    viewportHeight.value = clubsH
    trackOffset.value = sportsH
  }
}

onMounted(() => {
  requestAnimationFrame(measure)
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => window.removeEventListener('resize', measure))

watch(
  [() => flow.currentSlide.value, () => flow.selectedSportId.value, open],
  () => nextTick(() => requestAnimationFrame(measure)),
)

const header = computed(() => {
  if (flow.currentSlide.value <= 1) {
    return { step: '1', title: t('storefront.home.stepSportsTitle'), hint: t('storefront.home.stepSportsHint') }
  }
  const sport = flow.selectedSportId.value ? flow.sports.byId(flow.selectedSportId.value) : null
  const count = sport ? flow.clubs.items.filter((c) => c.sport_id === sport.id).length : 0
  return {
    step: '2',
    title: t('storefront.home.stepClubsTitle'),
    hint: sport ? `${flow.sportName(sport)} — ${count} ${t('storefront.home.clubsWord')}` : '',
  }
})
</script>

<template>
  <Transition name="panel">
    <div v-if="open" data-home-shop class="px-6 md:px-10 lg:px-12 pt-5 pb-6 bg-page dark:bg-sidebar-bg">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-8 h-8 rounded-lg bg-ink text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
          {{ header.step }}
        </div>
        <h2 class="font-heading text-xl md:text-[22px] font-extrabold uppercase tracking-[0.02em] text-ink dark:text-white">
          {{ header.title }}
        </h2>
        <span class="text-xs md:text-[13px] text-gray-500 ml-auto hidden sm:inline">{{ header.hint }}</span>
      </div>

      <div
        class="relative overflow-hidden rounded-2xl bg-white dark:bg-sidebar-surface border border-gray-200 dark:border-sidebar shadow-card-sm transition-[height] duration-[700ms]"
        :style="{ height: viewportHeight ? viewportHeight + 'px' : 'auto' }"
      >
        <div class="transition-transform duration-[700ms]" :style="{ transform: `translateY(-${trackOffset}px)` }">
          <!-- Slide 1 — Sports -->
          <div ref="slideSportsEl" class="px-6 py-4 md:px-8">
            <div class="flex items-center gap-3 mb-4">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink dark:text-gray-200 px-3.5 py-1.5 rounded-lg bg-ink/10 dark:bg-white/10 hover:bg-ink/20 transition"
                @click="flow.goHome()"
              >
                ← {{ t('storefront.home.backToHome') }}
              </button>
            </div>
            <div class="flex gap-4 overflow-x-auto pt-1 pb-2 no-scrollbar">
              <button
                v-for="s in flow.sports.sorted"
                :key="s.id"
                type="button"
                class="group relative flex-[0_0_180px] h-[110px] rounded-[14px] border-2 flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden transition-all select-none"
                :class="
                  s.background_color
                    ? (flow.selectedSportId.value === s.id ? 'shadow-lg' : 'hover:-translate-y-1')
                    : (flow.selectedSportId.value === s.id
                        ? 'border-ink bg-ink text-white shadow-lg'
                        : 'border-gray-200 dark:border-sidebar bg-page dark:bg-sidebar hover:border-ink dark:hover:border-accent hover:-translate-y-1')
                "
                :style="sportTileStyle(s)"
                @click="flow.pickSport(s)"
              >
                <div v-if="flow.sportIconUrl(s.icon_path)" class="relative z-[1] w-10 h-10 flex items-center justify-center">
                  <img
                    :src="flow.sportIconUrl(s.icon_path)!"
                    class="w-9 h-9 object-contain rounded-lg"
                    :alt="flow.sportName(s)"
                  >
                </div>
                <span class="text-[13px] font-semibold relative z-[1]">{{ flow.sportName(s) }}</span>
              </button>
            </div>
          </div>

          <!-- Slide 2 — Clubs -->
          <div ref="slideClubsEl" class="px-6 py-4 md:px-8">
            <div class="flex items-center gap-2 mb-4">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink dark:text-gray-200 px-3.5 py-1.5 rounded-lg bg-ink/10 dark:bg-white/10 hover:bg-ink/20 transition"
                @click="flow.goBackToSports()"
              >
                ← {{ t('storefront.home.backToSports') }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent px-3.5 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition"
                @click="flow.goHome()"
              >
                ← {{ t('storefront.home.backToHome') }}
              </button>
            </div>
            <div v-if="flow.sportClubs.value.length" class="flex gap-3.5 overflow-x-auto py-1 no-scrollbar">
              <button
                v-for="c in flow.sportClubs.value"
                :key="c.id"
                type="button"
                class="flex-[0_0_220px] p-4 rounded-[14px] border-2 flex items-center gap-3.5 cursor-pointer transition-all select-none text-left"
                :class="
                  flow.selectedClubId.value === c.id
                    ? 'border-ink bg-gradient-to-br from-ink/5 to-ink/[0.02] shadow-md'
                    : 'border-gray-200 dark:border-sidebar bg-page dark:bg-sidebar hover:border-ink dark:hover:border-accent hover:-translate-y-1 hover:shadow-md'
                "
                @click="flow.pickClub(c)"
              >
                <div
                  class="w-[46px] h-[46px] rounded-xl flex items-center justify-center text-[22px] flex-shrink-0 overflow-hidden transition"
                  :class="
                    flow.selectedClubId.value === c.id
                      ? 'bg-gradient-to-br from-ink to-ink-deep text-white'
                      : 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-sidebar dark:to-sidebar-surface'
                  "
                >
                  <img
                    v-if="flow.clubLogoUrl(c.logo_path)"
                    :src="flow.clubLogoUrl(c.logo_path)!"
                    class="w-full h-full object-cover"
                    :alt="c.name"
                  >
                  <UIcon v-else name="i-lucide-shield" class="w-5 h-5" />
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-semibold text-sm truncate">{{ c.name }}</span>
                  <span class="text-xs text-gray-500">
                    {{ flow.products.items.filter((p) => p.club_id === c.id && p.is_visible).length }}
                    {{ t('storefront.home.productsWord') }}
                  </span>
                </div>
                <span v-if="c.is_password_protected" class="ml-auto text-sm opacity-40">🔒</span>
              </button>
            </div>
            <div v-else class="py-10 text-center text-gray-500 text-sm">
              {{ t('storefront.home.noClubsForSport') }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.no-scrollbar {
  scrollbar-width: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.panel-enter-active {
  transition: opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
.panel-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.panel-enter-from {
  opacity: 0;
  transform: translateY(-30px);
}
.panel-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
