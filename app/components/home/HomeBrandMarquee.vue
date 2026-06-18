<script setup lang="ts">
// * Partner-brand marquee — two rows of brand logos scrolling in opposite
// * directions. Logos are greyscale/dimmed by default; as each one passes through
// * the horizontal centre of the section it lights up to full colour (revealed
// * through a fixed centre-mask over a synced duplicate track) while a light
// * blue-grey band glows behind it. Clicking a logo opens its Calaméo catalogue.
const { t } = useI18n()

interface Brand {
  name: string
  logo: string
  url: string
}

// * Fixed roster of partner brands, each linking to its Calaméo catalogue.
const brands: Brand[] = [
  { name: 'Nike', logo: '/brands-logo/nike-logo.png', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/007121996fd9da1773b98' },
  { name: 'adidas', logo: '/brands-logo/adidas-logo.png', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/007121996865c10e934cd' },
  { name: 'Puma', logo: '/brands-logo/puma-logo.png', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/00712199698564688b8f1' },
  { name: 'Kappa', logo: '/brands-logo/kappa-logo.png', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/books/0071219968715f852ce97' },
  { name: 'Uhlsport', logo: '/brands-logo/uhlsport-logo.png', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/books/0071219961a9212e4a00f' },
  { name: 'Hummel', logo: '/brands-logo/hummel.png', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/0071219965ead90484c6e' },
  { name: 'Joma', logo: '/brands-logo/joma-logo.png', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/00712199692afef22cfff' },
  { name: 'Jako', logo: '/brands-logo/jako-logo.png', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/0071219969fcc1118968e' },
  { name: 'Mizuno', logo: '/brands-logo/mizuno-logo.png', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/0071219963b90b1b970d2' },
  { name: 'Errea', logo: '/brands-logo/errea-logo.svg', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/007121996e47c4880f43f' },
  { name: 'Erima', logo: '/brands-logo/erima-logo.png', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/007121996ad958ffc18f2' },
]

// * Doubled so the -50% translate loop is seamless.
const loop = [...brands, ...brands]
</script>

<template>
  <section class="brands" aria-label="Marques partenaires">
    <div class="b-lb">{{ t('storefront.home.brandsLabel') }}</div>

    <div class="b-stage">
      <!-- * Base layer: dimmed greyscale logos, the clickable links -->
      <div class="b-layer">
        <div class="b-row a">
          <a
            v-for="(b, i) in loop"
            :key="`a-${i}`"
            :href="b.url"
            target="_blank"
            rel="noopener noreferrer"
            class="b-item"
            :aria-label="b.name"
          ><img :src="b.logo" :alt="b.name" class="b-logo"></a>
        </div>
        <div class="b-row b">
          <a
            v-for="(b, i) in loop"
            :key="`b-${i}`"
            :href="b.url"
            target="_blank"
            rel="noopener noreferrer"
            class="b-item"
            :aria-label="b.name"
          ><img :src="b.logo" :alt="b.name" class="b-logo"></a>
        </div>
      </div>

      <!-- * Lit layer: full-colour duplicate, masked to the centre only -->
      <div class="b-layer lit" aria-hidden="true">
        <div class="b-row a">
          <span v-for="(b, i) in loop" :key="`la-${i}`" class="b-item"><img :src="b.logo" alt="" class="b-logo"></span>
        </div>
        <div class="b-row b">
          <span v-for="(b, i) in loop" :key="`lb-${i}`" class="b-item"><img :src="b.logo" alt="" class="b-logo"></span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.brands {
  /* * Soft grey nuance across the whole section */
  background:
    radial-gradient(140% 100% at 50% -20%, rgba(255, 255, 255, 0.9) 0%, transparent 55%),
    linear-gradient(180deg, #f3f5f8 0%, #e6e9ef 50%, #dde1e9 100%);
  padding: 48px 0;
  overflow: hidden;
  border-top: 1px solid rgba(33, 47, 84, 0.06);
  border-bottom: 1px solid rgba(33, 47, 84, 0.06);
}
.dark .brands {
  background:
    radial-gradient(140% 100% at 50% -20%, rgba(255, 255, 255, 0.08) 0%, transparent 55%),
    linear-gradient(180deg, #2a3142 0%, #232838 100%);
  border-color: rgba(255, 255, 255, 0.1);
}
.b-lb {
  text-align: center;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(3, 49, 249, 0.45);
  margin-bottom: 28px;
}
.dark .b-lb {
  color: rgba(255, 255, 255, 0.4);
}

.b-stage {
  position: relative;
}

/* * Base + lit layers share the exact same row layout so they stay aligned */
.b-layer {
  position: relative;
}
.b-layer.lit {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* * Reveal full-colour logos only as they cross the section centre */
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 36%,
    #000 46%,
    #000 54%,
    transparent 64%
  );
  mask-image: linear-gradient(
    to right,
    transparent 36%,
    #000 46%,
    #000 54%,
    transparent 64%
  );
}

.b-row {
  display: flex;
  width: max-content;
  white-space: nowrap;
  align-items: center;
}
.b-row.a {
  animation: bmarq 32s linear infinite;
}
.b-row.b {
  animation: bmarq 32s linear infinite reverse;
  margin-top: 14px;
}

.b-item {
  /* * Fixed width so both layers' rows have identical, stable widths
   * (independent of async logo loading) → the two tracks stay in sync. */
  flex: 0 0 200px;
  width: 200px;
  height: 60px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.b-logo {
  max-height: 46px;
  max-width: 130px;
  width: auto;
  object-fit: contain;
  display: block;
}

/* * Default: dimmed greyscale logos */
.b-layer:not(.lit) .b-item {
  cursor: pointer;
}
.b-layer:not(.lit) .b-logo {
  filter: grayscale(1);
  opacity: 0.5;
  transition: filter 0.2s, opacity 0.2s;
}
.dark .b-layer:not(.lit) .b-logo {
  /* * Black logos would vanish on the dark bg → render as dim white silhouettes */
  filter: brightness(0) invert(1);
  opacity: 0.45;
}
.b-layer:not(.lit) .b-item:hover .b-logo {
  filter: none;
  opacity: 1;
}
.dark .b-layer:not(.lit) .b-item:hover .b-logo {
  filter: brightness(0) invert(1);
  opacity: 1;
}

/* * Centre: full colour */
.b-layer.lit .b-logo {
  filter: none;
  opacity: 1;
}
.dark .b-layer.lit .b-logo {
  filter: brightness(0) invert(1);
  opacity: 1;
}

@keyframes bmarq {
  to {
    transform: translateX(-50%);
  }
}

@media (max-width: 620px) {
  .brands {
    padding: 46px 0;
  }
  .b-lb {
    margin-bottom: 24px;
  }
  .b-logo {
    max-height: 34px;
    max-width: 92px;
  }
  .b-item {
    flex-basis: 130px;
    width: 130px;
    height: 48px;
  }
  .b-row.b {
    margin-top: 16px;
  }
  /* * Wider reveal window on small screens */
  .b-layer.lit {
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 28%,
      #000 42%,
      #000 58%,
      transparent 72%
    );
    mask-image: linear-gradient(
      to right,
      transparent 28%,
      #000 42%,
      #000 58%,
      transparent 72%
    );
  }
}

@media (prefers-reduced-motion: reduce) {
  .b-row.a,
  .b-row.b {
    animation: none;
  }
}
</style>
