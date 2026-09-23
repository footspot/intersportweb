<script setup lang="ts">
// * /mentions-legales — mandatory identification notice.
// *
// * LCEN art. 6-III-1 (loi 2004-575) requires a publicly accessible page naming
// * the publisher, its legal identity and its host. Omission is punishable by
// * up to one year of imprisonment and €75 000 (€375 000 for a company).
// *
// * Company data below is transcribed from the RNE/RCS extract (Pappers,
// * SIREN 919 860 932). Only update it against an official extract.
// * Directeur de la publication (art. 6-III-1-a) : confirmé par le client le
// * 23/09/2026. Ce n'est pas une donnée de l'extrait RCS — ne pas « corriger »
// * depuis Pappers, qui ne liste que les dirigeants.
const PUBLICATION_DIRECTOR = 'Sébastien Ribot'

const { t } = useI18n()
useHead({ title: () => `${t('legal.mentions')} — ${t('app.name')}` })
useSeoMeta({ robots: 'index, follow' })
</script>

<template>
  <LegalDoc :title="t('legal.mentions')">
    <h2>Éditeur du site</h2>
    <p>
      Le site <strong>www.intersportclubidf.com</strong> est édité par&nbsp;:
    </p>
    <ul>
      <li><strong>INTER SPORT CLUBS IDF</strong></li>
      <li>Société par actions simplifiée (SAS) au capital de 50&nbsp;000&nbsp;€</li>
      <li>Siège social&nbsp;: Impasse des Broderies, 78310 Coignières, France</li>
      <li>SIREN&nbsp;: 919&nbsp;860&nbsp;932 — SIRET (siège)&nbsp;: 919&nbsp;860&nbsp;932&nbsp;00012</li>
      <li>RCS Versailles 919&nbsp;860&nbsp;932 (immatriculée le 30 septembre 2022)</li>
      <li>N° de TVA intracommunautaire&nbsp;: FR29&nbsp;919&nbsp;860&nbsp;932</li>
      <li>Code APE&nbsp;: 70.10Z — Activités des sièges sociaux</li>
      <li>Représentants légaux&nbsp;: Sébastien Ribot, Mickaël Cortes</li>
    </ul>

    <h2>Contact</h2>
    <ul>
      <li>Téléphone&nbsp;: <a href="tel:+33130491499">01 30 49 14 99</a></li>
      <li>E-mail&nbsp;: <a href="mailto:shop@intersportclubidf.com">shop@intersportclubidf.com</a></li>
      <li>Formulaire&nbsp;: <NuxtLink to="/contact">page contact</NuxtLink></li>
    </ul>

    <h2>Directeur de la publication</h2>
    <p>{{ PUBLICATION_DIRECTOR }}</p>

    <h2>Hébergement</h2>
    <p>Le site et ses données sont hébergés par&nbsp;:</p>
    <ul>
      <li>
        <strong>Cloudflare, Inc.</strong> — hébergement du site et diffusion des pages.
        101 Townsend Street, San Francisco, CA 94107, États-Unis —
        <a href="https://www.cloudflare.com" target="_blank" rel="noopener noreferrer">cloudflare.com</a>
      </li>
      <li>
        <strong>Supabase, Inc.</strong> — base de données, authentification et stockage des fichiers —
        <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">supabase.com</a>
      </li>
    </ul>
    <p>
      Les conditions de ces hébergements et les garanties encadrant les transferts
      de données hors Union européenne sont détaillées dans notre
      <NuxtLink to="/confidentialite">politique de confidentialité</NuxtLink>.
    </p>

    <h2>Propriété intellectuelle</h2>
    <p>
      L'ensemble des contenus du site (textes, visuels, logos, photographies, mise en
      page) est protégé par le droit d'auteur et le droit des marques. La marque
      INTERSPORT et les marques des fournisseurs présentées sur le site demeurent la
      propriété de leurs titulaires respectifs. Toute reproduction ou représentation,
      totale ou partielle, sans autorisation écrite préalable est interdite.
    </p>

    <h2>Données personnelles et cookies</h2>
    <p>
      Le traitement de vos données personnelles, les durées de conservation et les
      modalités d'exercice de vos droits (accès, rectification, effacement,
      opposition, portabilité) sont décrits dans notre
      <NuxtLink to="/confidentialite">politique de confidentialité</NuxtLink>.
      Le site n'utilise aucun cookie publicitaire ni outil de mesure d'audience
      soumis à consentement.
    </p>

    <h2>Conditions de vente</h2>
    <p>
      Les ventes réalisées sur le site sont régies par nos
      <NuxtLink to="/cgv">conditions générales de vente</NuxtLink>.
    </p>
  </LegalDoc>
</template>
