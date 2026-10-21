# 07 — V2 : forfaits mensuels récurrents

## 1. Décision ferme

**Abonnement mensuel, pas paiement à chaque annonce.** V1 gratuite. La plateforme ne vend ni n’encaisse les places immobilières : l’abonnement finance l’accès à des fonctions ou capacités de publication. L’acheteur continue de chercher et contacter sans abonnement.

« 5 €/mois » est un exemple donné par Mathis. Les montants, taxes, nombre de forfaits et quotas restent à décider ; aucun tarif de ce dossier n’est activé ou présenté comme validé. Les prix d’exploitation des fournisseurs ne sont pas confondus avec le tarif payé par les annonceurs.

## 2. Structure d’offre proposée, non validée

| Code interne | Exemple de fonction | Prix / quota de travail |
|---|---|---|
| `launch_free` | V1 gratuite pour tous les annonceurs actifs | 0 ; limite de sécurité 10 annonces actives, indépendante d’un forfait payant |
| `buyer_free` | V2 consultation, favoris, messagerie, éventuellement une capacité de découverte annonceur | Gratuit ; capacité de dépôt à décider |
| `starter_monthly` | Petit annonceur, capacité mensuelle de publication | Exemple 5 €/mois ; proposition 5 annonces actives, à valider |
| `pro_monthly` | Plus de biens et fonctions professionnelles utiles | Prix non fixé ; proposition 25 annonces actives, à valider |

Ne pas implémenter ces chiffres en dur. Les droits sont paramétrés et versionnés. Une offre doit être économiquement évaluée avec frais de paiement, taxes applicables, stockage, emails, support et modélisation. Une scène intérieure réalisée manuellement n’est pas promise « illimitée incluse à 5 € » : son coût doit être traité séparément avant une telle offre.

## 3. Un moteur de droits dès la V1

Fonction métier serveur : `getEffectiveEntitlements(userId, now)`. Résultat typé : `planCode`, `canPublish`, `maxConcurrentListings`, `maxPhotosPerListing`, `canRequest3D`, `canAccessProTools`, `effectiveUntil`, `reason`, `sourceVersion`.

V1 : ce moteur lit `launch_free` et les exceptions administratives datées ; pas d’appel Stripe. V2 : le même moteur compose statut du compte, abonnement effectivement payé, période couverte, tolérance éventuelle, quotas et overrides explicites. Le paiement ne réactive pas un compte suspendu ni une annonce modérée.

« Annonces actives » = annonces publiées + soumissions en attente ayant réservé un emplacement. Brouillon, refusé, vendu, retiré et pause hors quota de publication. Compter les **listing_id distincts** : une révision en attente d’une annonce déjà publiée réutilise son emplacement, sans double consommation. Une première soumission réserve une capacité, libérée à son refus/retrait et convertie à l’approbation sans seconde consommation. Transaction et verrou sur le quota pour éviter deux soumissions simultanées au-delà de la limite. Un lot compte comme une annonce, mais ses N places restent visibles ; limite d’abus sur taille du lot distincte. Revoir ce principe avant tarification pour éviter un contournement commercial involontaire.

## 4. Architecture Stripe V2

Stripe Billing pour les abonnements, Checkout en mode `subscription`, Customer Portal pour gérer moyen de paiement et résiliation. Prix Stripe définis côté serveur ; le navigateur envoie un code de forfait autorisé, jamais un montant libre ou un price_id arbitraire. Relation unique entre compte plateforme et client Stripe, sans lier des comptes sur le seul email.

Endpoints réservés : POST `/api/v1/billing/checkout`, POST `/api/v1/billing/portal`, GET `/api/v1/billing/status`, POST `/api/v1/billing/webhook`. Authentifier les trois premiers ; vérifier la signature Stripe du quatrième sur le corps brut. Les pages de retour Checkout n’accordent aucun droit : elles affichent « Confirmation en cours » tant que l’état serveur n’est pas établi.

Sources : [webhooks d’abonnement](https://docs.stripe.com/billing/subscriptions/webhooks), [portail client](https://docs.stripe.com/customer-management), [réception et signature des événements](https://docs.stripe.com/webhooks).

## 5. États et droits

| Situation réelle | Effet produit proposé |
|---|---|
| Aucun abonnement en V1 | Droits gratuits de lancement |
| Checkout ouvert, paiement non confirmé | Aucun nouveau droit payant |
| Paiement initial validé et période active confirmée | Appliquer le forfait serveur |
| `incomplete` / `incomplete_expired` | Aucun droit payant, permettre une nouvelle tentative sûre |
| `trialing` | Seulement si un essai a été explicitement configuré ; aucun essai par défaut |
| `active` | Droits de la période couverte ; garder le compte et la modération prioritaires |
| Échec d’un renouvellement (`past_due`) | Proposition : 7 jours de tolérance sur une période auparavant payée ; avertissement et régularisation, pas de nouvel essai gratuit permanent |
| `unpaid`, `paused`, fin effective ou expiration de tolérance | Retour aux droits gratuits V2 validés ; lecture des messages et gestion des brouillons préservées |
| Résiliation à fin de période | Droits jusqu’à la fin de couverture payée ; afficher date exacte et action d’annulation du changement si disponible |
| Remboursement/litige/chargeback | Examen selon politique commerciale ; synchroniser situation réelle, sans effacer les dossiers ni inventer un droit |
| Compte suspendu | Aucun droit de publier, quel que soit le paiement |

Ces choix de tolérance et d’offre devront être validés au lancement V2 et cohérents avec ses conditions. Le moteur ne transforme pas mécaniquement n’importe quel statut en accès ; il vérifie périodes, factures et état canonique selon la configuration.

## 6. Événements et robustesse

Événements à gérer selon l’intégration choisie : `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`, et expiration/essai si activés. Un événement Checkout n’est pas à lui seul la preuve d’une facture payée.

Enregistrer l’ID d’événement unique avant traitement ; doublon = réponse réussie sans second effet. Ne pas supposer l’ordre des événements. Récupérer l’état canonique Stripe de l’abonnement et de sa période/facture quand nécessaire, puis recalculer le snapshot de droits dans une transaction. Job de réconciliation périodique pour événements manquants/échecs. Essais avec backoff, alertes, dead-letter consultable ; aucun remboursement ou email doublé sur retry.

Séparer strictement test et production, clients/prices/secrets/webhooks. Ne pas figer un champ de période propre à une ancienne version API : verrouiller la version choisie et tester son contrat. Les logs ne stockent pas les coordonnées bancaires ; Stripe les traite.

## 7. Changement de forfait et dépassement

V2 initiale : simplifier. Upgrade appliqué lorsque la facturation correspondante est confirmée. Downgrade à la prochaine échéance par défaut, montant et date expliqués. Pas de proration improvisée dans le code : choisir la politique Stripe et le texte commercial avant activation.

Si trop d’annonces pour le nouveau quota, demander au vendeur lesquelles garder. Laisser le délai annoncé ; à la date effective, mettre en pause l’excédent selon son choix, puis à défaut selon une règle visible et déterministe. Ne jamais supprimer les biens, documents ou messages pour un impayé. Une remise en ligne revérifie droits, disponibilité et modération.

## 8. Passage V1 gratuite → V2

Ne pas activer un prélèvement sur les comptes existants et ne pas convertir automatiquement les utilisateurs en abonnés. Définir offre gratuite V2 et règles des anciens comptes ; informer avant le changement, montrer conséquences et date, prévoir un délai de transition produit proposé de 30 jours à valider. Le vendeur choisit librement un forfait et son moyen de paiement.

Mathis peut bénéficier d’un compte interne/exemption si voulu, enregistré comme override administrateur avec motif et échéance, pas une condition cachée dans le frontend. Aucune migration commerciale sans recette technique et validation de l’offre.

## 9. Recette spécifique

Paiement initial accepté/refusé/abandonné ; retour avant webhook ; webhook dupliqué ; événements inversés ; signature incorrecte ; renouvellement réussi/échoué ; résiliation fin de période ; régularisation pendant et après tolérance ; upgrade/downgrade ; dépassement de quota ; compte suspendu pourtant payé ; suppression de compte ; indisponibilité Stripe ; double clic de création Checkout ; réconciliation après panne.

## 10. Ce que la V1 doit préparer, sans construire la facturation

Préparer moteur de droits, limites transactionnelles, code de forfait gratuit, feature flag serveur `billing_enabled=false`, écrans de compte modulaires et schéma futur documenté. Ne pas créer Stripe, collecter des cartes, afficher des boutons payants, installer des secrets de production ou envoyer des factures dès maintenant.
