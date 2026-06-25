# Fonctionnement de la cagnotte des clubs — Note de confirmation

> Document destiné à valider avec Intersport les règles de calcul et
> d'alimentation de la cagnotte (le fonds de chaque club). Merci de confirmer
> que chaque point ci-dessous correspond bien à ce qui est attendu.

---

## 1. Principe général

Chaque club dispose d'une **cagnotte** (un solde en euros). À chaque vente, la
**marge** réalisée sur les produits du club est automatiquement créditée sur sa
cagnotte.

La règle de calcul, par article et par unité, est :

> **Cagnotte créditée = Prix payé par le membre − Prix d'achat du produit**

Chaque mouvement (crédit ou débit) est enregistré dans un **historique
détaillé** ; le solde affiché est toujours la somme de cet historique. Rien
n'est perdu : chaque vente, chaque remboursement et chaque ajustement laisse une
trace.

---

## 2. Quand la cagnotte est-elle alimentée ?

La marge est créditée **au moment du paiement validé** de la commande (et non au
moment de la mise au panier ou de la création de la commande). Cela concerne :

- les paiements par **carte bancaire, PayPal et wallets** (via SystemPay) ;
- les commandes **entièrement réglées par code prépayé Footspot** (montant à
  payer = 0 €) — la marge du club est créditée normalement ;
- les commandes **entièrement couvertes par un code promo** (montant à payer
  = 0 €) — voir §6.

**Panier multi-clubs :** si un panier contient des produits de plusieurs clubs,
la marge est répartie correctement — **chaque club reçoit la marge de ses propres
produits**.

---

## 3. Effet des remises sur la cagnotte

C'est le point le plus important à valider. Une remise peut être prise en charge
de deux façons :

| Type de remise | Qui prend en charge la remise ? | Effet sur la cagnotte du club |
|---|---|---|
| Remise produit « club » | Le club | **La cagnotte diminue** du montant de la remise |
| Remise produit « Intersport » | Intersport | **Cagnotte inchangée** (marge pleine conservée) |
| Remise Footspot (par produit) | Le club | **La cagnotte diminue** toujours |
| Code promo « Intersport » (par défaut) | Intersport | **Cagnotte inchangée** |
| Code promo « club » | Le club | **La cagnotte diminue** du montant de la remise |
| Options (flocage, options payantes) | — | **Sans effet** sur la cagnotte |

**À confirmer :** la distinction « remise absorbée par le club » vs « remise
absorbée par Intersport » correspond-elle bien à la règle commerciale souhaitée ?

---

## 4. Codes promo : portée, prise en charge et exemples

Un code promo est un **montant fixe en euros** (et non un pourcentage),
**à usage unique**. Chaque code possède **deux caractéristiques indépendantes**
qu'il ne faut pas confondre :

**a) La portée — *sur quels articles* la remise s'applique :**

- **Globale** : la remise s'applique à **tout le panier**.
- **Club** : la remise s'applique **uniquement aux articles d'un club donné**.
- **Produits** : la remise s'applique **uniquement à certains produits désignés**
  (un code « produits » est toujours rattaché à un club).

**b) La prise en charge — *qui finance* la remise :**

- **Intersport** : la remise est offerte par Intersport → **cagnotte inchangée**.
- **Club** : la remise est financée par le club → **sa cagnotte diminue** du
  montant de la remise.

### 4.1 Règles générales (toujours valables)

- **Plafonnement :** la remise ne dépasse **jamais** le montant des articles
  éligibles. Le total d'une commande **ne devient jamais négatif** : une remise
  de 100 € sur 35 € d'articles éligibles ne retire que 35 €.
- **Code non applicable :** si le code vise un **club** ou des **produits**
  **absents du panier**, le code est **refusé** (« non applicable ») et le panier
  reste inchangé.
- **Couverture totale :** si la remise couvre tout le panier (total = 0 €), la
  commande est **validée sans paiement bancaire** (voir §6).

### 4.2 Tableau de référence

| Portée | Prise en charge | Articles remisés | Effet sur la/les cagnotte(s) |
|---|---|---|---|
| Globale | Intersport | Tout le panier | Aucun débit (Intersport offre) |
| Globale | Club | Tout le panier | **Panier mono-club :** la cagnotte du club est débitée de la remise. **Panier multi-clubs :** *aucun* club n'est débité — voir §9.3 |
| Club | Intersport | Uniquement les articles du club ciblé | Aucun débit |
| Club | Club | Uniquement les articles du club ciblé | La cagnotte du **club ciblé** est débitée de la remise |
| Produits | Intersport | Uniquement les produits désignés | Aucun débit |
| Produits | Club | Uniquement les produits désignés | La cagnotte du club (rattaché aux produits) est débitée |

### 4.3 Exemples chiffrés

> **Panier d'exemple (2 clubs)** utilisé ci-dessous :
>
> - 1 maillot du **Club A** — prix payé **35 €** (prix d'achat 30 € → marge **5 €**)
> - 1 paire de chaussettes du **Club B** — prix payé **6 €** (prix d'achat 5 € → marge **1 €**)
> - **Total panier : 41 €**

**Exemple 1 — Code promo *global*, pris en charge par *Intersport* (cas le plus courant).**
Remise de 10 €.

| | Montant |
|---|---|
| Le membre paie | 41 − 10 = **31 €** |
| Cagnotte Club A | **+5 €** (marge pleine) |
| Cagnotte Club B | **+1 €** (marge pleine) |
| Remise de 10 € | Offerte par Intersport — **aucun club débité** |

**Exemple 2 — Code promo *global*, pris en charge par le *club*, panier *mono-club*** (Club A seul, 35 €).
Remise de 10 €.

| | Montant |
|---|---|
| Le membre paie | 35 − 10 = **25 €** |
| Cagnotte Club A — marge | +5 € |
| Cagnotte Club A — remise | −10 € |
| **Cagnotte Club A — effet net** | **−5 €** (le club finance sa propre remise) |

**Exemple 3 — Code promo *restreint au Club A*, pris en charge par le *club*, panier multi-clubs.**
Remise de 100 € (plafonnée).

| | Montant |
|---|---|
| Remise réellement appliquée | plafonnée à la part du Club A = **35 €** |
| Le membre paie | 41 − 35 = **6 €** (la part du Club B) |
| Cagnotte Club A — marge | +5 € |
| Cagnotte Club A — remise | −35 € |
| **Cagnotte Club A — effet net** | **−30 €** |
| Cagnotte Club B | **+1 €** (la remise ne touche **pas** le Club B) |

➡️ Une remise « club » ne concerne **que** les articles de ce club ; les autres
clubs du panier ne sont jamais impactés.

**Exemple 4 — Code promo *restreint à un produit* (les chaussettes du Club B), pris en charge par le *club*.**
Remise de 100 € (plafonnée).

| | Montant |
|---|---|
| Remise réellement appliquée | plafonnée au prix des chaussettes = **6 €** |
| Le membre paie | 41 − 6 = **35 €** |
| Cagnotte Club A | **+5 €** (non concerné) |
| Cagnotte Club B — marge | +1 € |
| Cagnotte Club B — remise | −6 € |
| **Cagnotte Club B — effet net** | **−5 €** |

**Exemple 5 — Code *refusé*.** Un code « restreint au Club C » (ou à un produit)
**absent du panier** est rejeté : message « code non applicable », le panier reste
à 41 €, aucune commande n'est créée.

**Exemple 6 — Remise couvrant tout le panier (montant à payer = 0 €).**
Code promo *global* « Intersport » de 41 € (ou plus) sur le panier de 41 €.

| | Montant |
|---|---|
| Le membre paie | **0 €** — commande validée **sans paiement bancaire** |
| Cagnotte Club A | **+5 €** |
| Cagnotte Club B | **+1 €** |

➡️ La cagnotte est alimentée exactement comme pour une commande payée. Voir §6.

---

## 5. Codes prépayés (Footspot)

Lorsqu'un membre règle avec un **code prépayé Footspot**, cela change uniquement
**qui paie la facture du membre** (le portefeuille Footspot au lieu de la carte).
**La cagnotte du club n'est pas impactée par le prépaiement** : le club perçoit
sa marge habituelle, exactement comme pour un paiement par carte.

---

## 6. Commande entièrement couverte (montant à payer = 0 €)

Lorsqu'un **code promo** et/ou un **code prépayé** couvre la **totalité** du
panier, le montant à payer tombe à **0 €**. Dans ce cas :

- la commande est **validée immédiatement, sans passage par le paiement bancaire**
  (il n'y a rien à débiter sur une carte) ;
- la **cagnotte est alimentée — et débitée le cas échéant — exactement comme pour
  une commande payée** (marge créditée à chaque club, remise « club » débitée
  selon les règles du §4) ;
- le stock est décrémenté et le membre reçoit sa confirmation de commande
  normalement.

---

## 7. Remboursements et annulations

| Situation | La cagnotte est-elle reprise ? |
|---|---|
| Produit en **rupture de stock** au moment du paiement | Aucune marge n'est créditée (rien à reprendre) ; le membre est remboursé de la ligne |
| **Paiement refusé / abandonné** | Aucune marge créditée |
| **Remboursement manuel** par un administrateur | **Oui**, la marge créditée est reprise sur la cagnotte |

---

## 8. Gestion manuelle de la cagnotte

- **Administrateur Intersport** : peut **créditer ou débiter** manuellement la
  cagnotte d'un club depuis le back-office (avec motif et référence).

Chaque mouvement manuel est tracé dans l'historique.

---

## 9. Points nécessitant une décision / validation d'Intersport

Ces points ne sont pas des erreurs mais des **règles de gestion à arbitrer** —
merci de nous indiquer le comportement souhaité :

**9.1 — Retour colis (« retour à l'expéditeur » Colissimo).** Aujourd'hui,
lorsqu'un colis revient, la commande est annulée mais **la marge créditée au club
n'est pas reprise**. Faut-il, dans ce cas, reprendre la marge du club (et
rembourser le client) ?

**9.2 — Code promo « club » + remboursement.** Lorsqu'une commande avec un code
promo absorbé par le club est remboursée, le crédit de marge est repris **mais
pas** le coût de la remise promo. Faut-il aussi restituer ce montant au club ?

**9.3 — Code promo « club » *global* sur un panier *multi-clubs*.** C'est le cas
à arbitrer en priorité.

- *Exemple concret :* un code promo **global** de 41 €, **pris en charge par le
  club**, est utilisé sur le panier d'exemple (Club A 35 € + Club B 6 € = 41 €).
  Le membre paie **0 €**. Les deux clubs reçoivent leur marge (**+5 €** et
  **+1 €**). Mais comme le panier concerne **plusieurs clubs à la fois**, la
  remise de 41 € **n'est imputée à aucune cagnotte** : c'est donc **Intersport
  qui l'absorbe de fait**.
- *Pourquoi :* une remise « globale club » ne désigne pas **quel** club doit la
  financer ; sur un panier multi-clubs, le système ne sait pas comment la
  répartir, et ne débite donc personne.
- *Décision attendue :* faut-il **interdire** ce cas (refuser un code « club »
  global sur un panier multi-clubs), **répartir** la remise entre les clubs du
  panier (au prorata de leurs articles), ou **conserver** le comportement actuel
  (Intersport absorbe) ?

> **Note.** Ce cas ne se produit **que** pour la combinaison précise *portée
> globale* **+** *prise en charge club* **+** *panier multi-clubs*. Toutes les
> autres combinaisons (voir §4.2) débitent le bon club ou n'impactent aucune
> cagnotte, comme attendu.

---

*Merci de nous confirmer chacun des points des sections 3, 4 et 9 afin de figer
définitivement les règles de la cagnotte.*
