<script setup lang="ts">
// * /livraison-et-retour — delivery & returns. Content from intersportclubidf.com.
const { t } = useI18n()
useHead({ title: () => `${t('legal.delivery')} — ${t('app.name')}` })
</script>

<template>
  <LegalDoc :title="t('legal.delivery')">
    <h2>1 — Lieu de livraison</h2>
    <p>
      Les produits sont livrés uniquement en France métropolitaine et en Belgique, à
      l'adresse que le client indique lors de sa commande.
    </p>

    <h2>2 — Délais de livraison</h2>
    <p>
      Une date limite de livraison est communiquée avant la validation de la
      commande. Si la livraison n'intervient pas à cette date (sauf cas de force
      majeure), le client peut demander l'annulation de la vente conformément à
      l'article L138-2 du Code de la consommation.
    </p>
    <p>La demande doit être adressée par lettre recommandée ou écrit durable à :</p>
    <p>
      INTERSPORT CLUB IDF<br>
      WEB — Service clients<br>
      Impasse des Broderies<br>
      78310 Coignières
    </p>
    <p>
      En cas d'annulation, les sommes versées par le client lui sont intégralement
      restituées dans les meilleurs délais et au plus tard dans les 14 jours.
    </p>

    <h2>3 — Modalités de livraison</h2>
    <p>
      Les produits sont généralement livrés en une seule fois. Le client doit
      vérifier la conformité et l'état des produits. Il dispose d'un délai de
      48 heures à compter de la livraison pour formuler ses réclamations par courrier
      électronique à shop@intersportclubidf.com.
    </p>
    <p>
      Passé ce délai, les produits sont réputés conformes. Le vendeur s'engage à
      rembourser ou remplacer les articles défectueux dûment justifiés.
    </p>

    <h2>4 — Frais de livraison</h2>
    <p>
      Les frais de livraison sont à la charge du client. En cas d'impossibilité de
      livrer due au client, celui-ci supporte les frais de retour et de
      réacheminement.
    </p>
  </LegalDoc>
</template>
