<script setup lang="ts">
// * /confidentialite — politique de confidentialité. Content from intersportclubidf.com.
const { t } = useI18n()
useHead({ title: () => `${t('legal.privacy')} — ${t('app.name')}` })
</script>

<template>
  <LegalDoc :title="t('legal.privacy')">
    <h2>1 — Collecte de l'information</h2>
    <p>
      Le site recueille des données lors de l'inscription, de la connexion, des
      achats et des concours. Cela inclut votre nom, votre adresse e-mail, votre
      numéro de téléphone et/ou votre carte de crédit. Des informations techniques
      comme l'adresse IP sont enregistrées automatiquement.
    </p>

    <h2>2 — Utilisation des informations</h2>
    <p>
      Les données collectées servent à personnaliser l'expérience, à améliorer le
      site et le service client, à envoyer des e-mails et à administrer des concours
      ou des promotions.
    </p>

    <h2>3 — Confidentialité du commerce en ligne</h2>
    <p>
      L'entreprise demeure propriétaire unique des informations. Vos informations
      personnelles ne seront pas vendues, échangées, transférées ni données à une
      autre société, sauf pour les transactions requises ou avec votre consentement.
    </p>

    <h2>4 — Divulgation à des tiers</h2>
    <p>
      Les données ne sont pas transférées à des tiers non autorisés, excepté les
      partenaires de confiance. Le partage est autorisé pour enquêter sur des
      activités illégales ou des fraudes présumées, ou sur ordre légal.
    </p>

    <h2>5 — Protection des informations</h2>
    <p>
      La plateforme utilise le chiffrement et limite l'accès aux seuls personnels
      autorisés. Le site utilise des cookies pour améliorer l'accès, sans les lier
      aux informations personnelles.
    </p>

    <h2>6 — Se désabonner</h2>
    <p>
      Les utilisateurs peuvent se désinscrire à tout moment via les instructions
      incluses dans chaque e-mail.
    </p>

    <h2>7 — Consentement</h2>
    <p>L'utilisation du site implique l'acceptation de la présente politique.</p>
  </LegalDoc>
</template>
