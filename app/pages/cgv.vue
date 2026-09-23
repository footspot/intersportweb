<script setup lang="ts">
// * /cgv — conditions générales de vente.
// *
// * Corrections apportées au texte d'origine (audit RGPD du 23/09/2026) :
// *   - rétractation portée de 7 à 14 jours (C. conso. L221-18) — le délai de
// *     7 jours était illégal et inopposable au client ;
// *   - le prestataire de paiement est Lyra/Systempay, pas PayPal (qui n'est
// *     qu'un moyen de paiement proposé dans le formulaire) ;
// *   - l'article « données » renvoyait à la loi de 1978 et à un numéro de
// *     déclaration CNIL supprimé depuis 2018 → renvoi à /confidentialite ;
// *   - ajout du médiateur de la consommation MCCA (C. conso. L612-1).
//
// * Médiateur de la consommation (C. conso. L612-1) : MCCA, communiqué par le
// * client le 23/09/2026. L'obligation d'adhésion est remplie.
// * Les coordonnées ci-dessous sont reprises telles quelles — ne pas les
// * reformuler : elles doivent rester vérifiables par le consommateur.

const { t } = useI18n()
useHead({ title: () => `${t('legal.cgvLong')} — ${t('app.name')}` })

const LAST_UPDATED = '23 septembre 2026'
</script>

<template>
  <LegalDoc :title="t('legal.cgvLong')">
    <p><em>Dernière mise à jour&nbsp;: {{ LAST_UPDATED }}</em></p>

    <h2>Article 1 — Conditions de vente</h2>
    <p>
      Les présentes conditions régissent les ventes conclues sur
      www.intersportclubidf.com par INTER SPORT CLUBS IDF, SAS au capital de
      50&nbsp;000&nbsp;€, Impasse des Broderies, 78310 Coignières, RCS Versailles
      919&nbsp;860&nbsp;932.
    </p>
    <p>
      Protection des mineurs&nbsp;: les mineurs n'ont pas la capacité de contracter&nbsp;;
      la commande doit être passée par le titulaire de l'autorité parentale.
    </p>
    <p>
      L'offre&nbsp;: les offres en ligne précisent le prix (TTC), les frais de livraison
      et les quantités disponibles. Elles s'appliquent à tout achat en ligne, sans
      limitation géographique, sauf mention contraire.
    </p>
    <p>
      Validation&nbsp;: avant de payer, le client coche une case confirmant qu'il a pris
      connaissance des présentes conditions et de la
      <NuxtLink to="/confidentialite">politique de confidentialité</NuxtLink>, puis
      valide sa commande. Cette double action vaut acceptation pleine et entière.
    </p>
    <p>
      Disponibilité et exécution&nbsp;: en cas de difficulté d'approvisionnement, le
      client est informé dans un délai de 48 heures ouvrées et peut annuler ou
      modifier sa commande. Le remboursement des articles épuisés intervient par
      avoir ou virement sous 48 heures. Contact&nbsp;: 01 30 49 14 99.
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
      INTER SPORT CLUBS IDF décline toute responsabilité pour les retards
      indépendants de sa volonté.
    </p>

    <h2>Article 4 — Droit de rétractation</h2>
    <p>
      Conformément à l'article L221-18 du Code de la consommation, le client
      consommateur dispose d'un délai de <strong>14 jours</strong> à compter de la
      réception de sa commande pour exercer son droit de rétractation, sans avoir à
      motiver sa décision ni à supporter de pénalité. La demande peut être adressée
      par e-mail à
      <a href="mailto:shop@intersportclubidf.com">shop@intersportclubidf.com</a>.
    </p>
    <p>
      Les articles doivent être retournés non portés, non lavés et dans leur
      emballage d'origine. Le remboursement intervient au plus tard 14 jours après
      récupération des articles ou preuve de leur expédition. Les frais de retour
      restent à la charge du client, sauf produit non conforme ou erreur de notre
      part.
    </p>
    <p>
      <strong>Exception légale&nbsp;:</strong> conformément à l'article L221-28 3° du
      Code de la consommation, le droit de rétractation ne s'applique pas aux
      articles personnalisés (flocage d'un nom, d'un numéro ou d'un logo), confectionnés
      selon les spécifications du client. Cette exclusion est rappelée au moment de la
      personnalisation.
    </p>

    <h2>Article 5 — Garanties légales</h2>
    <p>
      Indépendamment de la garantie commerciale éventuelle, le client bénéficie de la
      garantie légale de conformité (articles L217-3 et suivants du Code de la
      consommation, 2 ans à compter de la délivrance) et de la garantie contre les
      vices cachés (articles 1641 et suivants du Code civil).
    </p>

    <h2>Article 6 — Droits, taxes et douanes</h2>
    <p>
      La TVA est appliquée conformément à la réglementation européenne. Les droits de
      douane éventuels restent à la charge du destinataire.
    </p>

    <h2>Article 7 — Paiement</h2>
    <p>
      Les paiements sont traités par <strong>Lyra Network</strong>, via sa solution
      sécurisée <strong>Systempay</strong>, au moyen d'un formulaire de paiement
      intégré. Le règlement s'effectue par carte bancaire ou, lorsque ce moyen est
      proposé, via PayPal. <strong>Aucune donnée de carte bancaire n'est stockée sur
      nos serveurs.</strong>
    </p>

    <h2>Article 8 — Données personnelles</h2>
    <p>
      Le traitement des données personnelles du client, les durées de conservation et
      les modalités d'exercice de ses droits (accès, rectification, effacement,
      opposition, portabilité) sont décrits dans notre
      <NuxtLink to="/confidentialite">politique de confidentialité</NuxtLink>.
    </p>

    <h2>Article 9 — Litiges et médiation</h2>
    <p>
      Le service client s'efforce de résoudre tout litige à l'amiable. Le client peut
      adresser sa réclamation à
      <a href="mailto:shop@intersportclubidf.com">shop@intersportclubidf.com</a>.
    </p>
    <p>
      Conformément aux articles L612-1 et suivants du Code de la consommation, en
      cas de litige non résolu, le client consommateur peut recourir gratuitement
      au <strong>Médiateur de la Consommation du Commerce Coopératif et Associé
      (MCCA)</strong>. Il doit au préalable avoir adressé une réclamation écrite au
      service client d'INTER SPORT CLUBS IDF.
    </p>
    <p>Le médiateur peut être saisi&nbsp;:</p>
    <ul>
      <li>
        en ligne&nbsp;:
        <a href="https://www.mcca-mediation.fr" target="_blank" rel="noopener noreferrer">www.mcca-mediation.fr</a>
      </li>
      <li>
        par e-mail&nbsp;:
        <a href="mailto:servicemediation@mcca-mediation.fr">servicemediation@mcca-mediation.fr</a>
      </li>
      <li>
        par courrier&nbsp;: Médiateur du Commerce Coopératif et Associé — FCA,
        77 rue de Lourmel, 75015 Paris
      </li>
    </ul>
    <p>
      Le client peut également utiliser la plateforme européenne de règlement en
      ligne des litiges&nbsp;:
      <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a>.
    </p>
    <p>
      À défaut d'accord amiable, le droit français est applicable et les tribunaux
      français sont compétents.
    </p>
  </LegalDoc>
</template>
