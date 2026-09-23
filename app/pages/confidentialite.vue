<script setup lang="ts">
// * /confidentialite — politique de confidentialité (RGPD art. 12-14).
// *
// * Replaces the pre-RGPD text that cited the loi de 1978 and a CNIL
// * declaration number (a formality abolished in May 2018).
// *
// * ! Keep this page HONEST about what the code actually does. Every claim
// * ! below is traceable: contact IP → contact-message, Footspot identity →
// * ! footspot-push-event, retention → the rgpd_* cron jobs. If a treatment
// * ! changes, this page changes in the same commit.
const { t } = useI18n()
useHead({ title: () => `${t('legal.privacy')} — ${t('app.name')}` })
useSeoMeta({ robots: 'index, follow' })

// * Shown to the reader so they can tell how current the policy is (art. 12.1
// * "concise, transparent"): a policy with no date is impossible to audit.
const LAST_UPDATED = '23 septembre 2026'
const PRIVACY_EMAIL = 'shop@intersportclubidf.com'
</script>

<template>
  <LegalDoc :title="t('legal.privacy')">
    <p><em>Dernière mise à jour&nbsp;: {{ LAST_UPDATED }}</em></p>

    <h2>1 — Responsable du traitement</h2>
    <p>
      Le responsable du traitement est <strong>INTER SPORT CLUBS IDF</strong>, SAS au
      capital de 50&nbsp;000&nbsp;€, dont le siège social est situé Impasse des
      Broderies, 78310 Coignières (RCS Versailles 919&nbsp;860&nbsp;932).
    </p>
    <p>
      Pour toute question ou pour exercer vos droits&nbsp;:
      <a :href="`mailto:${PRIVACY_EMAIL}`">{{ PRIVACY_EMAIL }}</a> ou par courrier à
      l'adresse du siège, avec la mention «&nbsp;Données personnelles&nbsp;».
    </p>
    <p>
      Compte tenu de la taille de la société et de la nature des traitements, aucun
      délégué à la protection des données (DPO) n'est désigné&nbsp;; l'adresse
      ci-dessus est le point de contact unique.
    </p>

    <h2>2 — Données collectées, finalités et bases légales</h2>
    <p>Nous ne collectons que les données nécessaires aux finalités décrites ci-dessous.</p>
    <ul>
      <li>
        <strong>Nom, prénom, e-mail, téléphone, adresse de livraison</strong> —
        traitement et suivi de votre commande, livraison, facturation, service
        après-vente. <em>Base légale&nbsp;: exécution du contrat (art. 6.1.b).</em>
      </li>
      <li>
        <strong>E-mail et prénom du compte client</strong> — création et gestion du
        compte, historique de commandes, favoris.
        <em>Base légale&nbsp;: exécution du contrat (art. 6.1.b).</em>
      </li>
      <li>
        <strong>Données de personnalisation (flocage)</strong> — nom ou numéro
        imprimé sur un article, nécessaire à la fabrication.
        <em>Base légale&nbsp;: exécution du contrat (art. 6.1.b).</em>
      </li>
      <li>
        <strong>Commandes, factures et pièces comptables</strong> — respect de nos
        obligations comptables et fiscales.
        <em>Base légale&nbsp;: obligation légale (art. 6.1.c).</em>
      </li>
      <li>
        <strong>Formulaire de contact&nbsp;: nom, e-mail, message et adresse IP</strong> —
        réponse à votre demande. L'adresse IP est utilisée uniquement pour limiter
        les envois automatisés (anti-spam).
        <em>Base légale&nbsp;: intérêt légitime (art. 6.1.f).</em>
      </li>
      <li>
        <strong>Mot de passe d'accès club</strong> — restriction de l'accès aux
        catalogues réservés aux membres d'un club.
        <em>Base légale&nbsp;: intérêt légitime (art. 6.1.f).</em>
      </li>
      <li>
        <strong>Cookie de session, cookie de langue, panier et thème</strong> —
        fonctionnement du site. <em>Base légale&nbsp;: intérêt légitime, cookies
        strictement nécessaires exemptés de consentement.</em>
      </li>
    </ul>
    <p>
      Nous ne collectons aucune donnée sensible au sens de l'article 9 du RGPD et ne
      pratiquons aucune prise de décision automatisée ni profilage publicitaire.
    </p>

    <h2>3 — Données bancaires</h2>
    <p>
      Les paiements par carte sont traités par <strong>Lyra Network (Systempay)</strong>
      via un formulaire sécurisé intégré. <strong>Aucune donnée de carte bancaire ne
      transite ni n'est stockée sur nos serveurs&nbsp;;</strong> nous ne conservons que
      la référence de la transaction et son statut.
    </p>

    <h2>4 — Destinataires et sous-traitants</h2>
    <p>
      Vos données ne sont ni vendues, ni louées, ni échangées. Elles sont accessibles
      au personnel habilité d'INTER SPORT CLUBS IDF et transmises aux prestataires
      suivants, strictement pour les finalités indiquées&nbsp;:
    </p>
    <ul>
      <li>
        <strong>Supabase, Inc.</strong> — base de données, authentification, stockage des
        fichiers. <strong>Vos données sont hébergées en France</strong>, sur la région
        AWS Europe (Paris)&nbsp;: elles ne quittent pas le territoire de l'Union
        européenne pour leur stockage.
      </li>
      <li><strong>Cloudflare, Inc.</strong> — hébergement et diffusion du site (États-Unis).</li>
      <li><strong>Brevo</strong> (France) — envoi des e-mails transactionnels&nbsp;: confirmation de commande, facture, suivi.</li>
      <li><strong>Lyra Network / Systempay</strong> (France) — traitement des paiements. Lorsque vous choisissez PayPal comme moyen de paiement, PayPal (Europe) S.à r.l. et Cie, S.C.A. (Luxembourg) intervient également.</li>
      <li><strong>La Poste / Colissimo</strong> (France) — édition des étiquettes d'expédition et suivi des colis.</li>
      <li>
        <strong>Footspot</strong> — plateforme partenaire des clubs. Pour les
        commandes liées à un club utilisant Footspot, votre nom et votre adresse
        e-mail sont transmis afin de rattacher la commande à votre compte club.
      </li>
    </ul>
    <p>
      <strong>Où sont hébergées vos données&nbsp;?</strong> La base de données, les
      comptes clients et les fichiers (factures comprises) sont stockés en France, sur
      la région AWS Europe (Paris) opérée par Supabase, donc à l'intérieur de l'Union
      européenne.
    </p>
    <p>
      Certains prestataires restent toutefois susceptibles de traiter des données en
      dehors de l'Union européenne&nbsp;— en particulier Cloudflare, dont le réseau
      diffuse les pages du site depuis ses points de présence répartis dans le monde, et
      les sociétés Supabase, Inc. et Cloudflare, Inc., constituées aux États-Unis, dont
      les équipes techniques peuvent accéder aux systèmes à des fins de maintenance. Ces
      transferts sont encadrés par les clauses contractuelles types de la Commission
      européenne, complétées le cas échéant par des mesures techniques (chiffrement en
      transit et au repos).
    </p>

    <h2>5 — Durées de conservation</h2>
    <p>
      Les données ne sont pas conservées indéfiniment. Les durées appliquées sont les
      suivantes&nbsp;:
    </p>
    <ul>
      <li><strong>Compte client</strong>&nbsp;: jusqu'à votre demande de suppression, ou 3 ans après votre dernière activité.</li>
      <li><strong>Commandes et factures</strong>&nbsp;: 10 ans (article L123-22 du Code de commerce). Les données d'identification de l'acheteur sont anonymisées après 3 ans&nbsp;; seules les données comptables (montants, articles) sont conservées jusqu'au terme légal.</li>
      <li><strong>Messages envoyés via le formulaire de contact</strong>&nbsp;: 1 an.</li>
      <li><strong>Adresses IP du formulaire de contact</strong>&nbsp;: 6 mois.</li>
      <li><strong>Données de paiement (référence de transaction)</strong>&nbsp;: 13 mois, durée de contestation bancaire.</li>
    </ul>
    <p>
      Ces suppressions et anonymisations sont exécutées automatiquement par des
      traitements planifiés, sans intervention manuelle.
    </p>

    <h2>6 — Vos droits</h2>
    <p>Conformément aux articles 15 à 22 du RGPD, vous disposez des droits suivants&nbsp;:</p>
    <ul>
      <li><strong>Droit d'accès</strong>&nbsp;: obtenir une copie des données que nous détenons sur vous.</li>
      <li><strong>Droit de rectification</strong>&nbsp;: corriger une donnée inexacte ou incomplète.</li>
      <li><strong>Droit à l'effacement</strong>&nbsp;: demander la suppression de vos données, sous réserve de nos obligations légales de conservation des factures.</li>
      <li><strong>Droit à la limitation</strong> du traitement.</li>
      <li><strong>Droit à la portabilité</strong>&nbsp;: recevoir vos données dans un format structuré et lisible par machine.</li>
      <li><strong>Droit d'opposition</strong> au traitement fondé sur l'intérêt légitime.</li>
      <li><strong>Directives post-mortem</strong>&nbsp;: définir le sort de vos données après votre décès.</li>
    </ul>
    <p>
      Pour exercer ces droits, écrivez à
      <a :href="`mailto:${PRIVACY_EMAIL}`">{{ PRIVACY_EMAIL }}</a>. Nous pouvons vous
      demander un justificatif d'identité en cas de doute raisonnable. Une réponse
      vous sera apportée dans un délai d'un mois, prolongeable de deux mois en cas de
      demande complexe (art. 12.3).
    </p>
    <p>
      Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une
      réclamation auprès de la CNIL&nbsp;: 3 place de Fontenoy, TSA 80715, 75334 Paris
      Cedex 07 —
      <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">www.cnil.fr</a>.
    </p>

    <h2>7 — Cookies et traceurs</h2>
    <p>
      Le site n'utilise <strong>ni cookie publicitaire, ni outil de mesure d'audience,
      ni bouton de réseau social</strong>. Seuls sont utilisés des traceurs strictement
      nécessaires au fonctionnement du site, exemptés de consentement selon les
      recommandations de la CNIL&nbsp;:
    </p>
    <ul>
      <li>un cookie de session, qui vous maintient connecté à votre compte&nbsp;;</li>
      <li>un cookie de langue, qui mémorise le choix français/anglais&nbsp;;</li>
      <li>un stockage local conservant votre panier et votre préférence d'affichage (thème clair/sombre), qui reste dans votre navigateur.</li>
    </ul>
    <p>
      C'est la raison pour laquelle aucune bannière de consentement ne vous est
      présentée. Les polices de caractères du site sont hébergées sur nos propres
      serveurs&nbsp;: aucune requête n'est adressée à un service tiers lors de votre
      navigation.
    </p>

    <h2>8 — Sécurité</h2>
    <p>
      Les échanges sont chiffrés en HTTPS. L'accès aux données est restreint par des
      règles de sécurité au niveau de la base, l'accès au back-office est protégé par
      mot de passe et double authentification, et chaque commande passée en tant
      qu'invité n'est consultable qu'au moyen d'un lien contenant un jeton unique.
    </p>

    <h2>9 — Mineurs</h2>
    <p>
      Le site s'adresse aux personnes majeures ainsi qu'aux responsables de clubs
      sportifs. Les mineurs de moins de 15 ans ne peuvent consentir seuls&nbsp;: la
      commande doit être passée par le titulaire de l'autorité parentale, qui reste
      responsable des données communiquées.
    </p>

    <h2>10 — Modification de la politique</h2>
    <p>
      Cette politique peut être modifiée pour refléter une évolution du site ou de la
      réglementation. La date de dernière mise à jour figure en haut de cette page.
    </p>
  </LegalDoc>
</template>
