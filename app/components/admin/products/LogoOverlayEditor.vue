<script setup lang="ts">
// * Admin-only logo/text overlay editor (destructive bake).
// * Loads an article photo as a locked background, lets staff drop the club
// * logo (or an uploaded one) and short text onto it, with drag / scale /
// * rotate handles (Konva Transformer). "Apply" flattens the canvas to a PNG
// * File at the photo's native resolution and hands it back to the gallery —
// * it then rides the existing product-image upload pipeline unchanged.
import type Konva from 'konva'

interface Props {
  modelValue: boolean
  backgroundUrl: string | null   // * the article photo to draw on
  clubLogoUrl: string | null     // * selected club's logo (club-logos bucket), if any
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'applied', file: File): void
}>()

const { t } = useI18n()

// * One overlay element (logo image or text). Transform lives on the node;
// * we mirror it back here on drag/transform end so re-renders don't reset it.
interface OverlayItem {
  id: string
  type: 'image' | 'text'
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
  draggable: true
  // * image — what Konva actually draws (the source <img>, or a canvas with
  // * the white background knocked out when the effect is on).
  image?: HTMLImageElement | HTMLCanvasElement
  // * original source kept so the white-key effect is non-destructive and
  // * re-runnable (toggle off / re-tune strength without re-uploading).
  originalImage?: HTMLImageElement
  removeWhite?: boolean
  tolerance?: number
  // * text
  text?: string
  fontSize?: number
  fill?: string
  fontFamily?: string
  fontStyle?: string
}

const MAX_STAGE = 520
const DEFAULT_TOLERANCE = 30

const bgImage = ref<HTMLImageElement | null>(null)
const stageWidth = ref(MAX_STAGE)
const stageHeight = ref(MAX_STAGE)
const displayScale = ref(1) // * stage px ÷ native px (≤ 1)

const items = ref<OverlayItem[]>([])
const selectedId = ref<string | null>(null)
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const exporting = ref(false)

// * text controls
const textValue = ref('')
const textColor = ref('#f59e0b') // * brand gold, like the client's mockup
const textSize = ref(48)

// * Konva node refs, keyed by item id, plus stage + transformer.
const nodeMap = new Map<string, Konva.Node>()
const stageRef = ref<any>(null)
const transformerRef = ref<any>(null)

function setNodeRef(id: string, comp: any) {
  if (comp && comp.getNode) nodeMap.set(id, comp.getNode())
  else nodeMap.delete(id)
}

// * Load an <img> with CORS enabled so the exported canvas isn't tainted
// * (Supabase public buckets send Access-Control-Allow-Origin).
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
}

// * Build a canvas from an image with near-white pixels knocked out to
// * transparent. `tolerance` (0–100) widens how far from pure white still
// * counts as background; a small soft band fades alpha at the edge so the
// * cut-out doesn't look jagged. Reads pixels, so the source must be CORS-clean
// * (same condition the final export already relies on).
function whiteKeyCanvas(img: HTMLImageElement, tolerance: number): HTMLCanvasElement {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  const imageData = ctx.getImageData(0, 0, w, h)
  const px = imageData.data
  // * Higher tolerance lowers the cutoff so off-white / light grey also go.
  const cutoff = 255 - tolerance * 1.6
  const band = 24
  for (let i = 0; i < px.length; i += 4) {
    const m = Math.min(px[i], px[i + 1], px[i + 2])
    if (m >= cutoff) {
      px[i + 3] = 0
    } else if (m >= cutoff - band) {
      // * linear alpha fade across the soft band
      px[i + 3] = Math.round((px[i + 3] * (cutoff - m)) / band)
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

// * Re-derive an image item's drawn pixels from its original source and the
// * current effect state, then nudge Konva to repaint.
function applyWhiteKey(item: OverlayItem) {
  if (item.type !== 'image' || !item.originalImage) return
  try {
    item.image = item.removeWhite
      ? whiteKeyCanvas(item.originalImage, item.tolerance ?? DEFAULT_TOLERANCE)
      : item.originalImage
    nodeMap.get(item.id)?.getLayer()?.batchDraw()
  } catch {
    // * Tainted canvas (CORS) or read failure — revert and report.
    item.removeWhite = false
    item.image = item.originalImage
    errorMsg.value = t('admin.products.overlay.exportError')
  }
}

function toggleWhiteKey() {
  const item = selectedItem.value
  if (!item || item.type !== 'image') return
  item.removeWhite = !item.removeWhite
  applyWhiteKey(item)
}

// * Re-run the cut-out when the strength slider is released.
function onToleranceChange() {
  const item = selectedItem.value
  if (item?.type === 'image' && item.removeWhite) applyWhiteKey(item)
}

// * Step the strength up/down (− / + buttons), clamped to 0–100, then re-run.
function stepTolerance(delta: number) {
  const item = selectedItem.value
  if (!item || item.type !== 'image') return
  const next = Math.min(100, Math.max(0, (item.tolerance ?? DEFAULT_TOLERANCE) + delta))
  item.tolerance = next
  if (item.removeWhite) applyWhiteKey(item)
}

async function initBackground() {
  errorMsg.value = null
  items.value = []
  selectedId.value = null
  nodeMap.clear()
  if (!props.backgroundUrl) return
  loading.value = true
  try {
    const img = await loadImage(props.backgroundUrl)
    const scale = Math.min(MAX_STAGE / img.naturalWidth, MAX_STAGE / img.naturalHeight, 1)
    displayScale.value = scale
    stageWidth.value = Math.round(img.naturalWidth * scale)
    stageHeight.value = Math.round(img.naturalHeight * scale)
    bgImage.value = img
  } catch {
    errorMsg.value = t('admin.products.overlay.loadError')
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) initBackground()
  },
  { immediate: true },
)

// * Attach the transformer to whichever node is selected.
watch(selectedId, async (id) => {
  await nextTick()
  const tr = transformerRef.value?.getNode?.() as Konva.Transformer | undefined
  if (!tr) return
  const node = id ? nodeMap.get(id) : null
  tr.nodes(node ? [node] : [])
  tr.getLayer()?.batchDraw()
})

function addLogoFromUrl(url: string | null) {
  if (!url) return
  loadImage(url)
    .then((img) => {
      // * Scale the logo to ~⅓ of the stage width by default.
      const target = stageWidth.value / 3
      const s = target / img.naturalWidth
      const id = crypto.randomUUID()
      items.value.push({
        id,
        type: 'image',
        x: stageWidth.value / 2 - target / 2,
        y: stageHeight.value / 2 - (img.naturalHeight * s) / 2,
        rotation: 0,
        scaleX: s,
        scaleY: s,
        draggable: true,
        image: img,
        originalImage: img,
        removeWhite: false,
        tolerance: DEFAULT_TOLERANCE,
      })
      selectedId.value = id
    })
    .catch(() => {
      errorMsg.value = t('admin.products.overlay.loadError')
    })
}

function onUploadLogo(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    errorMsg.value = t('admin.common.imageTooLarge')
    return
  }
  const url = URL.createObjectURL(file)
  // * Object URLs are same-origin, so no taint; load directly.
  loadImage(url)
    .then((img) => {
      const target = stageWidth.value / 3
      const s = target / img.naturalWidth
      const id = crypto.randomUUID()
      items.value.push({
        id, type: 'image',
        x: stageWidth.value / 2 - target / 2,
        y: stageHeight.value / 2 - (img.naturalHeight * s) / 2,
        rotation: 0, scaleX: s, scaleY: s, draggable: true,
        image: img, originalImage: img, removeWhite: false, tolerance: DEFAULT_TOLERANCE,
      })
      selectedId.value = id
    })
    .finally(() => URL.revokeObjectURL(url))
}

function addText() {
  const value = textValue.value.trim()
  if (!value) return
  const id = crypto.randomUUID()
  items.value.push({
    id,
    type: 'text',
    x: stageWidth.value / 2 - 80,
    y: stageHeight.value / 2 - textSize.value / 2,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    draggable: true,
    text: value,
    fontSize: Number(textSize.value) || 48,
    fill: textColor.value,
    fontFamily: 'Arial, sans-serif',
    fontStyle: 'bold',
  })
  selectedId.value = id
  textValue.value = ''
}

// * Mirror position/rotation back into our model after a drag.
function syncFromNode(item: OverlayItem) {
  const node = nodeMap.get(item.id)
  if (!node) return
  item.x = node.x()
  item.y = node.y()
  item.rotation = node.rotation()
}

// * On resize, bake the transformer scale into a real value: fontSize for text
// * (so it stays crisp and the size input reflects it), node scale for images.
function onTransformEnd(item: OverlayItem) {
  const node = nodeMap.get(item.id)
  if (!node) return
  item.x = node.x()
  item.y = node.y()
  item.rotation = node.rotation()
  if (item.type === 'text') {
    item.fontSize = Math.max(4, Math.round((item.fontSize ?? 48) * node.scaleX()))
    item.scaleX = 1
    item.scaleY = 1
    node.scaleX(1)
    node.scaleY(1)
  } else {
    item.scaleX = node.scaleX()
    item.scaleY = node.scaleY()
  }
}

// * The currently selected element (live-edited by the side controls).
const selectedItem = computed(() => items.value.find((i) => i.id === selectedId.value) ?? null)

// * When the selected text's font size changes via the input, the node resizes
// * but the transformer box won't follow until we refresh it.
watch(
  () => (selectedItem.value?.type === 'text' ? selectedItem.value.fontSize : null),
  async () => {
    await nextTick()
    const tr = transformerRef.value?.getNode?.() as Konva.Transformer | undefined
    tr?.forceUpdate()
    tr?.getLayer()?.batchDraw()
  },
)

function removeSelected() {
  if (!selectedId.value) return
  items.value = items.value.filter((i) => i.id !== selectedId.value)
  nodeMap.delete(selectedId.value)
  selectedId.value = null
}

// * Clicking empty canvas / background deselects.
function onStageMouseDown(e: any) {
  const target = e.target
  if (target === target.getStage() || target.name?.() === 'background') {
    selectedId.value = null
  }
}

function close() {
  if (!exporting.value) emit('update:modelValue', false)
}

async function apply() {
  const stage = stageRef.value?.getNode?.() as Konva.Stage | undefined
  if (!stage) return
  exporting.value = true
  errorMsg.value = null
  try {
    // * Detach the transformer synchronously so its handles/box aren't baked
    // * into the PNG (relying on the selectedId watcher alone races the export).
    const tr = transformerRef.value?.getNode?.() as Konva.Transformer | undefined
    if (tr) {
      tr.nodes([])
      tr.getLayer()?.batchDraw()
    }
    selectedId.value = null
    await nextTick()
    // * Render at native photo resolution (pixelRatio undoes the display fit).
    const pixelRatio = displayScale.value > 0 ? 1 / displayScale.value : 1
    const dataUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio })
    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], `overlay-${Date.now()}.png`, { type: 'image/png' })
    emit('applied', file)
    emit('update:modelValue', false)
  } catch {
    errorMsg.value = t('admin.products.overlay.exportError')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 overflow-y-auto"
  >
    <div class="w-full max-w-4xl my-8 bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-heading text-xl font-bold">{{ t('admin.products.overlay.title') }}</h3>
        <button type="button" class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar" @click="close">
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>

      <p class="text-xs text-gray-500">{{ t('admin.products.overlay.hint') }}</p>

      <div class="flex flex-col lg:flex-row gap-5">
        <!-- Canvas -->
        <div class="shrink-0 mx-auto">
          <div
            class="rounded-lg border border-gray-200 dark:border-sidebar bg-gray-50 dark:bg-sidebar overflow-hidden"
            :style="{ width: stageWidth + 'px', height: stageHeight + 'px' }"
          >
            <div v-if="loading" class="w-full h-full flex items-center justify-center text-gray-400 text-sm">
              {{ t('common.loading') }}
            </div>
            <v-stage
              v-else-if="bgImage"
              ref="stageRef"
              :config="{ width: stageWidth, height: stageHeight }"
              @mousedown="onStageMouseDown"
              @touchstart="onStageMouseDown"
            >
              <v-layer>
                <v-image
                  :config="{ image: bgImage, width: stageWidth, height: stageHeight, name: 'background', listening: true }"
                />
                <template v-for="item in items" :key="item.id">
                  <v-image
                    v-if="item.type === 'image'"
                    :ref="(c: any) => setNodeRef(item.id, c)"
                    :config="{
                      image: item.image, x: item.x, y: item.y, rotation: item.rotation,
                      scaleX: item.scaleX, scaleY: item.scaleY, draggable: item.draggable,
                    }"
                    @click="selectedId = item.id"
                    @tap="selectedId = item.id"
                    @dragend="syncFromNode(item)"
                    @transformend="onTransformEnd(item)"
                  />
                  <v-text
                    v-else
                    :ref="(c: any) => setNodeRef(item.id, c)"
                    :config="{
                      text: item.text, x: item.x, y: item.y, rotation: item.rotation,
                      scaleX: item.scaleX, scaleY: item.scaleY, draggable: item.draggable,
                      fontSize: item.fontSize, fill: item.fill, fontFamily: item.fontFamily, fontStyle: item.fontStyle,
                    }"
                    @click="selectedId = item.id"
                    @tap="selectedId = item.id"
                    @dragend="syncFromNode(item)"
                    @transformend="onTransformEnd(item)"
                  />
                </template>
                <v-transformer ref="transformerRef" :config="{ rotateEnabled: true, keepRatio: true }" />
              </v-layer>
            </v-stage>
          </div>
        </div>

        <!-- Controls -->
        <div class="flex-1 space-y-4 min-w-[240px]">
          <!-- Logo -->
          <div class="space-y-2">
            <p class="text-sm font-medium">{{ t('admin.products.overlay.logoSection') }}</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-if="clubLogoUrl"
                type="button"
                class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark"
                @click="addLogoFromUrl(clubLogoUrl)"
              >
                <UIcon name="i-lucide-shield" class="w-4 h-4" />
                {{ t('admin.products.overlay.addClubLogo') }}
              </button>
              <label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-sidebar text-sm font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-sidebar">
                <UIcon name="i-lucide-upload" class="w-4 h-4" />
                {{ t('admin.products.overlay.uploadLogo') }}
                <input type="file" accept="image/*" class="hidden" @change="onUploadLogo" />
              </label>
            </div>
            <p v-if="!clubLogoUrl" class="text-xs text-gray-500">{{ t('admin.products.overlay.noClubLogo') }}</p>
          </div>

          <!-- Text -->
          <div class="space-y-2 border-t border-gray-100 dark:border-sidebar pt-4">
            <p class="text-sm font-medium">{{ t('admin.products.overlay.textSection') }}</p>
            <div class="flex gap-2">
              <input
                v-model="textValue"
                type="text"
                :placeholder="t('admin.products.overlay.textPlaceholder')"
                class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
                @keyup.enter="addText"
              />
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-sidebar text-sm font-medium hover:bg-gray-50 dark:hover:bg-sidebar disabled:opacity-50"
                :disabled="!textValue.trim()"
                @click="addText"
              >
                <UIcon name="i-lucide-type" class="w-4 h-4" />
                {{ t('admin.products.overlay.addText') }}
              </button>
            </div>
          </div>

          <!-- Selected element -->
          <div class="border-t border-gray-100 dark:border-sidebar pt-4 space-y-3">
            <p class="text-sm font-medium">{{ t('admin.products.overlay.selectedSection') }}</p>
            <p v-if="!selectedItem" class="text-xs text-gray-500">{{ t('admin.products.overlay.selectHint') }}</p>

            <!-- Live text controls -->
            <div v-if="selectedItem?.type === 'text'" class="flex items-center gap-3 flex-wrap">
              <label class="flex items-center gap-1.5 text-xs text-gray-500">
                {{ t('admin.products.overlay.color') }}
                <input v-model="selectedItem.fill" type="color" class="w-8 h-8 rounded cursor-pointer border border-gray-300 dark:border-sidebar bg-transparent" />
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-500">
                {{ t('admin.products.overlay.size') }}
                <input
                  v-model.number="selectedItem.fontSize"
                  type="range"
                  min="8"
                  max="300"
                  class="w-32 accent-brand-primary"
                />
                <input
                  v-model.number="selectedItem.fontSize"
                  type="number"
                  min="8"
                  max="300"
                  class="w-16 px-2 py-1 rounded border border-gray-300 dark:border-sidebar bg-transparent text-sm"
                />
              </label>
            </div>

            <!-- Logo white-background removal (opt-in per logo) -->
            <div v-if="selectedItem?.type === 'image'" class="space-y-2">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
                :class="selectedItem.removeWhite
                  ? 'bg-brand-primary text-white border-brand-primary hover:bg-brand-primary-dark'
                  : 'border-gray-300 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar'"
                @click="toggleWhiteKey"
              >
                <UIcon name="i-lucide-eraser" class="w-4 h-4" />
                {{ selectedItem.removeWhite ? t('admin.products.overlay.removeWhiteOn') : t('admin.products.overlay.removeWhite') }}
              </button>
              <template v-if="selectedItem.removeWhite">
                <label class="flex items-center gap-2 text-xs text-gray-500">
                  {{ t('admin.products.overlay.tolerance') }}
                  <button
                    type="button"
                    class="w-6 h-6 shrink-0 inline-flex items-center justify-center rounded border border-gray-300 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar disabled:opacity-40"
                    :disabled="(selectedItem.tolerance ?? 0) <= 0"
                    @click="stepTolerance(-5)"
                  >
                    <UIcon name="i-lucide-minus" class="w-3.5 h-3.5" />
                  </button>
                  <input
                    v-model.number="selectedItem.tolerance"
                    type="range"
                    min="0"
                    max="100"
                    class="w-28 accent-brand-primary"
                    @change="onToleranceChange"
                  />
                  <button
                    type="button"
                    class="w-6 h-6 shrink-0 inline-flex items-center justify-center rounded border border-gray-300 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar disabled:opacity-40"
                    :disabled="(selectedItem.tolerance ?? 0) >= 100"
                    @click="stepTolerance(5)"
                  >
                    <UIcon name="i-lucide-plus" class="w-3.5 h-3.5" />
                  </button>
                  <span class="w-8 text-right tabular-nums">{{ selectedItem.tolerance }}</span>
                </label>
                <p class="text-xs text-gray-400">{{ t('admin.products.overlay.removeWhiteHint') }}</p>
              </template>
            </div>

            <button
              v-if="selectedItem"
              type="button"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-brand-secondary hover:bg-brand-secondary/10"
              @click="removeSelected"
            >
              <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
              {{ t('admin.products.overlay.removeSelected') }}
            </button>
          </div>
        </div>
      </div>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

      <div class="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-sidebar">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar"
          :disabled="exporting"
          @click="close"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
          :disabled="exporting || items.length === 0"
          @click="apply"
        >
          {{ exporting ? t('common.loading') : t('admin.products.overlay.apply') }}
        </button>
      </div>
    </div>
  </div>
</template>
