<script setup lang="ts">
// * /cgv — conditions générales de vente. Content from intersportclubidf.com.
const { t } = useI18n()
useHead({ title: () => `${t('legal.cgvLong')} — ${t('app.name')}` })
</script>

<template>
  <LegalDoc :title="t('legal.cgvLong')">
    <h2>Article 1 — Conditions de vente</h2>
    <p>
      Protection des mineurs : les mineurs n'ont pas la capacité de contracter ; le
      recueil de leurs données nécessite le consentement du titulaire de l'autorité
      parentale.
    </p>
    <p>
      L'offre : les offres en ligne précisent le prix (TTC), les frais de livraison
      et les quantités disponibles. Elles s'appliquent à tout achat en ligne, sans
      limitation géographique, sauf mention contraire.
    </p>
    <p>
      Validation : le client doit accepter l'intégralité des présentes conditions
      avant tout achat. Le clic de validation vaut acceptation pleine et entière,
      sans réserve.
    </p>
    <p>
      Disponibilité et exécution : en cas de difficulté d'approvisionnement, le
      client est informé dans un délai de 48 heures ouvrées et peut annuler ou
      modifier sa commande. Le remboursement des articles épuisés intervient par
      avoir ou virement sous 48 heures. Contact : 01 30 49 05 57.
    </p>

    <h2>Article 2 — Prix et offres spéciales</h2>
    <p>
      Les prix indiqués s'entendent TTC, au départ de l'entrepôt. Les livraisons à
      l'international font l'objet de frais forfaitaires. Une fois la commande
      passée, le prix ne peut plus être modifié. Le vendeur conserve la propriété
      des produits jusqu'au paiement complet.
    </p>

    <h2>Article 3 — Livraison / Transport</h2>
    <p>
      Toute avarie doit être signalée au transporteur par lettre recommandée dans un
      délai de 72 heures. Les produits non conformes sont remplacés ou remboursés.
      INTERSPORT décline toute responsabilité pour les retards indépendants de sa
      volonté.
    </p>

    <h2>Article 4 — Garanties</h2>
    <p>
      Les retours sont acceptés dans un délai de 10 jours, à condition que les
      articles soient non lavés et dans leur emballage d'origine. Pour toute vente à
      distance, l'acheteur dispose d'un délai de rétractation de 7 jours francs. Les
      articles personnalisés ne peuvent être ni repris ni échangés.
    </p>

    <h2>Article 5 — Droits, taxes et douanes</h2>
    <p>
      La TVA est appliquée conformément à la réglementation européenne. Les droits de
      douane éventuels restent à la charge du destinataire.
    </p>

    <h2>Article 6 — Paiement</h2>
    <p>
      Le paiement est sécurisé. PayPal assure le chiffrement et la protection des
      données de carte et des transactions.
    </p>

    <h2>Article 7 — Litiges</h2>
    <p>
      Le droit français et les tribunaux français sont seuls compétents. Le service
      client s'efforce de résoudre tout litige à l'amiable.
    </p>

    <h2>Article 8 — Sécurité des données</h2>
    <p>
      Les données personnelles font l'objet d'une protection conforme à la loi du
      6 janvier 1978 (déclaration CNIL n° 1519954). Le client peut demander l'accès,
      la rectification de ses données ou s'opposer aux communications commerciales.
    </p>
  </LegalDoc>
</template>
