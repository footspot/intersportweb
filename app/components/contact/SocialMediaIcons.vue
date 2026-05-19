<script setup lang="ts">
import type { SocialLink } from '~/stores/contact'

interface Props {
  links: SocialLink[]
}
defineProps<Props>()

const ICON_MAP: Record<string, string> = {
  facebook: 'i-lucide-facebook',
  instagram: 'i-lucide-instagram',
  twitter: 'i-lucide-twitter',
  linkedin: 'i-lucide-linkedin',
  youtube: 'i-lucide-youtube',
  tiktok: 'i-lucide-music-2',
  other: 'i-lucide-link',
}
function iconFor(link: SocialLink): string {
  return link.icon ?? ICON_MAP[link.platform] ?? 'i-lucide-link'
}
</script>

<template>
  <ul v-if="links.length" class="flex flex-wrap gap-2">
    <li v-for="(s, i) in links" :key="i">
      <a
        :href="s.url"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-sidebar hover:bg-brand-primary hover:text-white text-sm transition-colors capitalize"
        :aria-label="s.platform"
      >
        <UIcon :name="iconFor(s)" class="w-4 h-4" />
        <span>{{ s.platform }}</span>
      </a>
    </li>
  </ul>
</template>
