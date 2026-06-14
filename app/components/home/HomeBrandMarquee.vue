<script setup lang="ts">
// * Partner-brand marquee — two rows of big outlined brand names scrolling in
// * opposite directions. Names are grey/outlined by default; as each name passes
// * through the horizontal centre of the section it fills solid primary blue
// * (revealed through a fixed centre-mask over a synced duplicate track) while a
// * light blue-grey band lights up behind it. Clicking a brand opens its Calaméo
// * catalogue in a new tab.
const { t } = useI18n()

interface Brand {
  name: string
  url: string
}

// * Fixed roster of partner brands, each linking to its Calaméo catalogue.
const brands: Brand[] = [
  { name: 'Nike', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/007121996fd9da1773b98' },
  { name: 'adidas', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/007121996865c10e934cd' },
  { name: 'Puma', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/00712199698564688b8f1' },
  { name: 'Kappa', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/books/0071219968715f852ce97' },
  { name: 'Uhlsport', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/books/0071219961a9212e4a00f' },
  { name: 'Hummel', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/0071219965ead90484c6e' },
  { name: 'Joma', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/00712199692afef22cfff' },
  { name: 'Jacko', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/0071219969fcc1118968e' },
  { name: 'Mizuno', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/0071219963b90b1b970d2' },
  { name: 'Errea', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/007121996e47c4880f43f' },
  { name: 'Erima', url: 'https://www.calameo.com/intersport-clubs-et-collectivites/read/007121996ad958ffc18f2' },
]

// * Doubled so the -50% translate loop is seamless.
const loop = [...brands, ...brands]
</script>

<template>
  <section class="brands" aria-label="Marques partenaires">
    <div class="b-lb">{{ t('storefront.home.brandsLabel') }}</div>

    <div class="b-stage">
      <!-- * Light blue-grey band that lights up where names cross the centre -->
      <div class="b-glow" aria-hidden="true" />

      <!-- * Base layer: grey outlined names, the clickable links -->
      <div class="b-layer">
        <div class="b-row a">
          <a
            v-for="(b, i) in loop"
            :key="`a-${i}`"
            :href="b.url"
            target="_blank"
            rel="noopener noreferrer"
            class="b-item font-heading"
          >{{ b.name }}</a>
        </div>
        <div class="b-row b">
          <a
            v-for="(b, i) in loop"
            :key="`b-${i}`"
            :href="b.url"
            target="_blank"
            rel="noopener noreferrer"
            class="b-item font-heading"
          >{{ b.name }}</a>
        </div>
      </div>

      <!-- * Lit layer: solid blue duplicate, masked to the centre only -->
      <div class="b-layer lit" aria-hidden="true">
        <div class="b-row a">
          <span v-for="(b, i) in loop" :key="`la-${i}`" class="b-item font-heading">{{ b.name }}</span>
        </div>
        <div class="b-row b">
          <span v-for="(b, i) in loop" :key="`lb-${i}`" class="b-item font-heading">{{ b.name }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.brands {
  background: #eef2f9;
  padding: 48px 0;
  overflow: hidden;
}
.dark .brands {
  background: var(--color-sidebar-surface);
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

/* * Soft light blue-grey spotlight behind the centre of the rows */
.b-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse 30% 120% at 50% 50%,
    rgba(3, 49, 249, 0.12) 0%,
    rgba(3, 49, 249, 0.06) 40%,
    transparent 72%
  );
}
.dark .b-glow {
  background: radial-gradient(
    ellipse 30% 120% at 50% 50%,
    rgba(120, 150, 255, 0.18) 0%,
    rgba(120, 150, 255, 0.08) 40%,
    transparent 72%
  );
}

/* * Base + lit layers share the exact same row layout so they stay aligned */
.b-layer {
  position: relative;
}
.b-layer.lit {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* * Reveal solid-blue names only as they cross the section centre */
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
}
.b-row.a {
  animation: bmarq 32s linear infinite;
}
.b-row.b {
  animation: bmarq 32s linear infinite reverse;
  margin-top: 6px;
}

.b-item {
  font-weight: 900;
  font-size: 40px;
  line-height: 1.1;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 0 34px;
}

/* * Default: grey outlined characters */
.b-layer:not(.lit) .b-item {
  color: transparent;
  text-decoration: none;
  -webkit-text-stroke: 1.4px rgba(33, 47, 84, 0.28);
  transition: -webkit-text-stroke-color 0.2s, color 0.2s;
  cursor: pointer;
}
.dark .b-layer:not(.lit) .b-item {
  -webkit-text-stroke-color: rgba(255, 255, 255, 0.22);
}
.b-layer:not(.lit) .b-item:hover {
  color: var(--color-brand-primary, #0331f9);
  -webkit-text-stroke-color: var(--color-brand-primary, #0331f9);
}

/* * Centre: filled solid primary blue */
.b-layer.lit .b-item {
  color: var(--color-brand-primary, #0331f9);
  -webkit-text-stroke: 0;
}

@keyframes bmarq {
  to {
    transform: translateX(-50%);
  }
}

@media (max-width: 620px) {
  .brands {
    padding: 32px 0;
  }
  .b-lb {
    margin-bottom: 18px;
  }
  .b-item {
    font-size: 26px;
    padding: 0 20px;
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
