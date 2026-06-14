<script setup lang="ts">
// * Hero card deck — the signature interaction. A stack of admin-managed slides
// * (see stores/carousel + admin Carousel tab). The front card auto-throws to the
// * right every few seconds, the next surfaces, and the thrown card recycles to
// * the back. Each slide is either a plain image card or a product card linked to
// * a product + sport. Clicking the front card throws it; clicking a product
// * card's "add" opens the product.
import type { HomeSlide } from '~/stores/carousel'
import { useProductsStore, primaryImagePath, type Product } from '~/stores/products'
import { useSportsStore, type Sport } from '~/stores/sports'
import { useProductDiscountsStore } from '~/stores/productDiscounts'
import { computeUnitPricing, applyClubDiscount } from '~/composables/usePricingPreview'

interface Props {
  slides: HomeSlide[]
  // * Dwell time per card before the auto-throw, in seconds (admin-configurable).
  interval?: number
  // * Preview mode (admin) suppresses click-through navigation.
  preview?: boolean
}
const props = withDefaults(defineProps<Props>(), { interval: 3, preview: false })

// * Self-contained: resolves products / sports / pricing from the stores so it
// * works both on the storefront and inside the admin carousel preview.
const { t, locale } = useI18n()
const router = useRouter()
const client = useSupabaseClient()
const productsStore = useProductsStore()
const sportsStore = useSportsStore()
const discounts = useProductDiscountsStore()

function slideImageUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('home-carousel').getPublicUrl(path)
  return data?.publicUrl ?? null
}
function productImageUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(path)
  return data?.publicUrl ?? null
}
function sportName(s: Sport) {
  return s.name[locale.value as 'fr' | 'en'] ?? s.name.fr
}
function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}
function clubDiscountPct(p: Product) {
  return discounts.pctFor(p.club_id, p.reference)
}
function finalPrice(p: Product) {
  const unit = computeUnitPricing({
    buying_price: Number(p.buying_price),
    selling_price: Number(p.selling_price),
    discount_percent: Number(p.discount_percent ?? 0),
    discount_source: p.discount_source ?? null,
  }).unit_price_paid
  return applyClubDiscount(unit, clubDiscountPct(p))
}
function displayDiscount(p: Product) {
  const fs = clubDiscountPct(p)
  return fs > 0 ? fs : Number(p.discount_percent ?? 0)
}
function goToProduct(p: Product) {
  router.push(`/product/${p.id}`)
}

// * Resolved display model for one slide (image vs product card).
interface DeckCard {
  slide: HomeSlide
  kind: 'image' | 'product'
  image: string | null
  badge: string | null
  name: string | null
  sub: string | null
  price: string | null
  old: string | null
  disc: number
  productId: string | null
}

const cards = computed<DeckCard[]>(() =>
  props.slides.map((slide) => {
    if (slide.card_kind === 'product') {
      const product = slide.product_id ? productsStore.byId(slide.product_id) : null
      const sport = slide.sport_id ? sportsStore.byId(slide.sport_id) : null
      const img = slideImageUrl(slide.image_path) || productImageUrl(primaryImagePath(product))
      const disc = product ? displayDiscount(product) : 0
      return {
        slide,
        kind: 'product',
        image: img,
        badge: sport ? sportName(sport) : null,
        name: slide.title || (product ? product.name[locale.value as 'fr' | 'en'] ?? product.name.fr : null),
        sub: slide.subtitle,
        price: product ? fmt(finalPrice(product)) : null,
        old: product && disc > 0 ? fmt(Number(product.selling_price)) : null,
        disc,
        productId: product?.id ?? null,
      }
    }
    return {
      slide,
      kind: 'image',
      image: slideImageUrl(slide.image_path),
      badge: null,
      name: slide.title,
      sub: null,
      price: null,
      old: null,
      disc: 0,
      productId: null,
    }
  }),
)

// * ── Deck stacking + throw animation (ported from the design prototype) ──
const deckEl = ref<HTMLElement | null>(null)
// * Hidden until the cards have been fanned out in onMounted, then faded in —
// * avoids the "flat stack → fan" pop on first load.
const ready = ref(false)
let els: HTMLElement[] = []
let order: HTMLElement[] = []
let busy = false
let auto = true
let timer: ReturnType<typeof setInterval> | null = null
let reduced = false

const VIS = 3
const OPA = [1, 1, 0.82, 0.5]
const THROW = 'translate(480px,-26px) scale(.96) rotate(15deg)'
const tf = (d: number) => {
  const v = Math.min(d, VIS)
  return `translate(${v * 20}px, ${-v * 13}px) scale(${1 - v * 0.05}) rotate(${v * 2}deg)`
}
const op = (d: number) => (d > VIS ? 0 : OPA[d]!)

function place(card: HTMLElement, d: number, animate: boolean) {
  card.style.transition = animate
    ? 'transform .58s cubic-bezier(.45,0,.18,1), opacity .5s ease'
    : 'none'
  card.style.transform = tf(d)
  card.style.opacity = String(op(d))
  card.style.zIndex = String(120 - d)
}

function flick(targetDepth: number) {
  if (busy || targetDepth <= 0 || targetDepth >= order.length) return
  busy = true
  const front = order[0]!
  const target = order[targetDepth]!
  const middle = order.slice(1, targetDepth)
  // * Fling the current front card off to the right.
  front.style.transition = 'transform .62s cubic-bezier(.5,0,.15,1), opacity .55s ease'
  front.style.transform = THROW
  front.style.opacity = '0'
  front.style.zIndex = '220'
  // * New order: target surfaces, skipped cards drop behind, thrown card to back.
  order = [target, ...order.slice(targetDepth + 1), ...middle, front]
  order.forEach((c, i) => {
    if (c !== front) place(c, i, true)
  })
  setTimeout(() => {
    place(front, order.length - 1, false) // * drop the flung card to the back (still hidden)
    void front.offsetWidth // * reflow so it doesn't animate from off-screen
    front.style.transition = 'transform .5s ease, opacity .5s ease'
    front.style.opacity = String(op(order.length - 1))
    busy = false
  }, 640)
}
const cycle = () => flick(1)

function startTimer() {
  stopTimer()
  if (reduced || order.length <= 1) return
  const ms = Math.max(1, props.interval || 3) * 1000
  timer = setInterval(() => {
    if (auto && !busy) cycle()
  }, ms)
}
function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function setup() {
  if (!deckEl.value) return
  els = [...deckEl.value.querySelectorAll<HTMLElement>('.dcard')]
  order = [...els]
  order.forEach((c, i) => place(c, i, false))
  ready.value = true
  startTimer()
}

function onCardClick(card: DeckCard, e: MouseEvent) {
  if (props.preview) return
  const el = (e.currentTarget as HTMLElement) ?? null
  // * "Add" / product cards: open the product instead of throwing.
  if ((e.target as HTMLElement)?.closest('.deck-add') && card.productId) {
    const p = productsStore.byId(card.productId)
    if (p) goToProduct(p)
    return
  }
  // * Only the front card throws on tap.
  if (el && el === order[0]) {
    auto = false
    cycle()
  }
}

onMounted(() => {
  if (import.meta.client) {
    reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  }
  nextTick(setup)
})
onBeforeUnmount(stopTimer)

// * Rebuild the stack when the slide set changes (e.g. admin live preview).
watch(
  () => props.slides.map((s) => s.id).join(','),
  () => {
    stopTimer()
    nextTick(setup)
  },
)
watch(() => props.interval, startTimer)
</script>

<template>
  <div class="hero-vis relative w-full max-w-[520px] h-[330px] sm:h-[420px] md:h-[460px]">
    <div ref="deckEl" class="deck absolute inset-y-0 inset-x-[6%]" :class="{ 'is-ready': ready }">
      <article
        v-for="card in cards"
        :key="card.slide.id"
        class="dcard"
        @click="onCardClick(card, $event)"
      >
        <!-- * Image card -->
        <template v-if="card.kind === 'image'">
          <div class="kit-ph full">
            <img v-if="card.image" :src="card.image" :alt="card.name ?? ''" class="absolute inset-0 w-full h-full object-cover" />
            <span v-else class="kit-lab">{{ t('storefront.home.deckPlaceholder') }}</span>
            <div v-if="card.name" class="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/80 to-transparent">
              <div class="font-heading font-bold text-white text-xl leading-tight uppercase tracking-wide">
                {{ card.name }}
              </div>
            </div>
          </div>
        </template>

        <!-- * Product card -->
        <template v-else>
          <div class="kit-ph">
            <img v-if="card.image" :src="card.image" :alt="card.name ?? ''" class="absolute inset-0 w-full h-full object-cover" />
            <span v-else class="kit-lab">{{ t('storefront.home.deckPlaceholder') }}</span>
            <span v-if="card.badge" class="kit-sb font-heading">{{ card.badge }}</span>
            <span v-if="card.disc > 0" class="kit-disc">-{{ card.disc }}%</span>
          </div>
          <div class="kit-bd">
            <div class="kit-nm font-heading">{{ card.name }}</div>
            <div v-if="card.sub" class="kit-sub">{{ card.sub }}</div>
            <div class="kit-row">
              <div class="kit-pr font-heading">
                <s v-if="card.old">{{ card.old }}</s>
                <span class="text-accent">{{ card.price }}</span>
              </div>
              <div class="kit-add deck-add">
                <UIcon name="i-lucide-plus" class="w-5 h-5" />
              </div>
            </div>
          </div>
        </template>
      </article>
    </div>
  </div>
</template>

<style scoped>
/* * Deck sits 20% smaller and pushed toward the right of the hero banner. */
.hero-vis {
  transform: scale(0.8);
  transform-origin: center center;
}
@media (min-width: 981px) {
  .hero-vis {
    transform-origin: right center;
    margin-left: auto;
    margin-right: 2%;
  }
}

/* * Deck stays hidden until JS has fanned the cards, then fades in (no pop). */
.deck {
  opacity: 0;
}
.deck.is-ready {
  opacity: 1;
  transition: opacity 0.5s ease;
}
.dcard {
  position: absolute;
  inset: 0;
  background: #fff;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 26px 60px rgba(0, 0, 0, 0.42);
  transform-origin: 50% 60%;
  cursor: pointer;
  will-change: transform, opacity;
}
.dcard::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 18px;
  box-shadow: inset 0 0 0 1px rgba(15, 26, 64, 0.05);
  pointer-events: none;
}
.kit-ph {
  height: 62%;
  position: relative;
  background: repeating-linear-gradient(135deg, #eef0f6 0 12px, #e3e7f1 12px 24px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.kit-ph.full {
  height: 100%;
}
.kit-lab {
  font: 600 11px/1 ui-monospace, Menlo, monospace;
  letter-spacing: 0.1em;
  color: #97a0bd;
  text-transform: uppercase;
}
.kit-sb {
  position: absolute;
  top: 14px;
  left: 14px;
  background: var(--color-ink);
  color: #fff;
  font-weight: 800;
  font-size: 13px;
  text-transform: uppercase;
  padding: 5px 11px;
  border-radius: 7px;
}
.kit-disc {
  position: absolute;
  top: 14px;
  right: 14px;
  background: var(--color-accent);
  color: #fff;
  font-weight: 800;
  font-size: 12px;
  padding: 5px 9px;
  border-radius: 7px;
}
.kit-bd {
  padding: 16px 18px;
}
.kit-nm {
  font-weight: 800;
  font-size: 20px;
  color: var(--color-ink);
  text-transform: uppercase;
  line-height: 1.05;
}
.kit-sub {
  font-size: 12.5px;
  color: #8a8a8a;
  margin-top: 2px;
}
.kit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 13px;
}
.kit-pr {
  font-weight: 900;
  font-size: 25px;
  color: var(--color-ink);
}
.kit-pr s {
  color: #c0c0c0;
  font-size: 14px;
  font-weight: 600;
  margin-right: 6px;
}
.kit-add {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: var(--color-accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.14s;
}
.kit-add:hover {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .st1,
  .st2 {
    animation: none;
  }
}
</style>
