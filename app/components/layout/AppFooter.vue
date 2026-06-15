<script setup lang="ts">
const { t } = useI18n()
const year = new Date().getFullYear()
</script>

<template>
  <footer class="bg-ink-deep text-white/60">
    <div class="max-w-7xl mx-auto px-6 md:px-10 py-7">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-7">
        <!-- Contact -->
        <div>
          <h3 class="font-heading text-[13px] font-bold uppercase tracking-[0.08em] text-white">
            {{ t('footer.contactTitle') }}
          </h3>
          <div class="w-7 h-0.5 bg-accent mt-1.5 mb-3.5"></div>
          <p class="text-[13px] leading-[1.9]">
            <span class="text-white font-semibold">INTERSPORT CLUB IDF</span><br>
            Impasse des Broderies<br>
            78310 Coignières<br>
            Tél : 01 30 49 14 99
          </p>
        </div>

        <!-- Opening hours -->
        <div>
          <h3 class="font-heading text-[13px] font-bold uppercase tracking-[0.08em] text-white">
            {{ t('footer.hoursTitle') }}
          </h3>
          <div class="w-7 h-0.5 bg-accent mt-1.5 mb-3.5"></div>
          <p class="text-[13px] leading-[1.9]">
            <span class="text-white/90">{{ t('footer.weekdays') }}</span><br>
            09.30 - 12.30<br>
            14.00 - 19.00
          </p>
          <p class="text-[13px] leading-[1.9] mt-3">
            <span class="text-white/90">{{ t('footer.saturday') }}</span><br>
            {{ t('footer.byAppointment') }}
          </p>
        </div>

        <!-- Information links -->
        <div>
          <h3 class="font-heading text-[13px] font-bold uppercase tracking-[0.08em] text-white">
            {{ t('footer.infoTitle') }}
          </h3>
          <div class="w-7 h-0.5 bg-accent mt-1.5 mb-3.5"></div>
          <ul class="space-y-2.5 text-[13px]">
            <li>
              <NuxtLink to="/livraison-et-retour" class="inline-flex items-center gap-1.5 hover:text-white transition-colors">
                <UIcon name="i-lucide-chevron-right" class="w-3.5 h-3.5 text-accent" />
                {{ t('legal.delivery') }}
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/cgv" class="inline-flex items-center gap-1.5 hover:text-white transition-colors">
                <UIcon name="i-lucide-chevron-right" class="w-3.5 h-3.5 text-accent" />
                {{ t('legal.cgvLong') }}
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/confidentialite" class="inline-flex items-center gap-1.5 hover:text-white transition-colors">
                <UIcon name="i-lucide-chevron-right" class="w-3.5 h-3.5 text-accent" />
                {{ t('legal.privacy') }}
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Trust badges -->
        <div class="flex flex-col gap-3 sm:items-start lg:items-end">
          <div class="bg-white rounded-lg px-2 py-1 inline-flex items-center justify-center">
            <img src="/colissimo-logo.avif" alt="Colissimo" class="h-10 w-auto">
          </div>
          <div class="bg-white rounded-lg px-4 py-2.5 inline-flex items-center justify-center">
            <img src="/PayPal-Monogram-FullColor-RGB.png" alt="PayPal" class="h-7 w-auto">
          </div>
        </div>
      </div>
    </div>

    <!-- Copyright bar -->
    <div class="border-t border-white/10">
      <div class="max-w-7xl mx-auto px-6 md:px-10 py-3 flex items-center justify-center gap-1.5 text-[12px] text-white/45">
        <span>© {{ year }} {{ t('footer.copyright') }}</span>
        <span>·</span>
        <a
          href="https://footspot.co"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 hover:text-white/80 transition-colors"
        >
          {{ t('footer.madeBy') }}
          <img src="/footspot-logo.jpg" alt="FootSpot" class="h-4 w-4 rounded object-cover">
        </a>
      </div>
    </div>
  </footer>
</template>
