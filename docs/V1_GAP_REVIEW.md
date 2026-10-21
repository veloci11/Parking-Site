# Revue ciblée et résolution des écarts V1

Mise à jour du 21 octobre 2026. Références : [backlog](plan-construction/specs/backlog.csv) et [cas F01–F20](plan-construction/08_PLAN_DEV_RECETTE_EXPLOITATION.md). La première revue statique avait identifié des écarts de code ; le tableau ci-dessous décrit leurs corrections intégrées. Une fonction livrée ne vaut pas une validation de tous les scénarios navigateur ou une ouverture publique.

État de recette communiqué par le coordinateur : **40 tests unitaires**, **2 parcours HTTP isolés**, **128 + 74 assertions Supabase**, **88 assertions scènes** réussis. Les [compléments SQL V1](qa/supabase-v1-complements.json) exercent les migrations 008/009/010 sur PostgreSQL réel avec rôles/claims de test et rollback ; ce protocole complète les vrais logins GoTrue, sans les remplacer. Migrations 001–010 appliquées ; 010 sur le blocage entre interlocuteurs appliquée et testée en transaction annulée. Aucun déploiement public ni email réel.

## Résolution des écarts de code prioritaires

| Exigence | Correction livrée et preuve code | Limite de la conclusion |
|---|---|---|
| P022 / F20 : état propre à chaque place | `src/lib/types.ts` : `unitQuality`, dates et origine déclarée. `listing-wizard.tsx`, `unit-quality.tsx`, `admin.tsx` et `ListingDetail.tsx` séparent commun/unité. Validation/projection serveur et migration 008 | Une observation absente reste inconnue ; `provided_document` est une déclaration, pas un contrôle de la plateforme. Aucun rendu ne prouve l’état d’un bien réel |
| P023/P053 : suspension d’une publication | `src/components/account/publications.tsx` : sélection, motif, confirmation et version ; routes admin et migration 008. Statut `suspended`, correction puis nouvelle soumission ; audit et conversations conservés | Réussite SQL réelle avec rollback. Les critères de modération d’un inventaire réel restent à appliquer |
| F07/F14 : statut/prix périmés dans une page ouverte | Revalidation des vues publiques à 30 secondes et au retour au premier plan, dans les composants catalogue/fiche/comparaison ; la source serveur demeure autoritaire | Il existe un délai de rafraîchissement ; ce mécanisme ne promet pas une synchronisation instantanée entre onglets |
| F10/P033 : favoris retirés invisibles | `Explorer.tsx` et données de favoris : entrées indisponibles explicites, sans réexposition du brouillon ou d’une localisation masquée | Une indisponibilité ne doit pas être présentée comme un échec de tout le catalogue |
| F09 : contexte perdu au retour | Contexte de navigation conservé et retour interne contextualisé depuis fiche/comparaison | Vérifications navigateur ciblées ; chaque combinaison mobile/niveau/défilement ne peut être déduite de la seule présence du code |
| P050 : blocage des échanges | `messages.tsx` : état relu, confirmation inline, blocage/déblocage. API GET/PUT/DELETE et migration 009 : nouveaux messages/visites bloqués, historique et annulation conservés | Migration 010 étend la portée à tous les fils entre les deux interlocuteurs ; application et recette SQL réelle confirmées |
| P021 : variantes d’images | `SafePhoto.tsx`, `src/server/media-variants.ts`, routes médias et sources WebP 1920 : variantes 480/960/1920 autorisées à la demande, contrôle des droits conservé lors du retrait | Ne pas remplacer cette route par un cache public durable qui contournerait la révocation. Pas d’affirmation de performance terrain mesurée |
| P063 : outillage base + objets | `scripts/backup-project.ts`, `tests/backup.test.ts` et [OPS_BACKUP.md](OPS_BACKUP.md) : export, inventaire, hashes, contrôle des chemins, destination isolée et plan de restauration | Tests sur fichiers locaux ; aucune sauvegarde/restauration du projet distant exercée. La restauration des schémas gérés reste manuelle |
| P030 : canonique annonce | `src/app/annonces/[id]/[slug]/page.tsx` fournit la canonique correspondant au slug serveur | Staging reste en noindex ; présence de la balise ne constitue pas une preuve d’indexation par un moteur |
| F01 : préparation avant confirmation | `preparation.tsx` et `preparatory-draft.ts` : titre, ville, type, quantité dans `sessionStorage`, clairement local. Transfert volontaire vers POST authentifié puis effacement après réponse serveur | Aucune session fabriquée, aucun AutoConfirm ; pas de photos/adresse précise. Même onglet/appareil, données potentiellement perdues à sa fermeture. Auth et emails réels sont distincts |
| F15 : vente partielle | `my-listings.tsx` conduit au wizard `?partial=1` : contrôle des unités restantes et nouveau prix total, sans prorata ; message sur pause de l’ancienne offre si devenue invalide | Nouvelle version soumise à modération, pas de vente immobilière ou réservation payante exécutée par le site |
| F13/P043 : repli 2D | `ParkingViewer.tsx` : plan SVG métrique et alternative sémantique, photos/liste disponibles sans Canvas | Modèle fictif de recette ; les mesures terrain et fidélité d’un parking réel restent non établies |

## Correspondance F01–F20 après intégration

| Cas | État du code et preuve disponible |
|---|---|
| F01 | Préparation locale avant Auth livrée et helper testé ; brouillon serveur après vraie authentification ; soumission/contact soumis à vérification |
| F02 | Brouillon distant, sauvegarde sérialisée, reprise par ID et médias liés ; parcours HTTP existants |
| F03 | Version optimiste, conflits 409 et récupération UI ; contrôles API existants |
| F04 | Prix total et unités multiples ; IDs et niveaux reliés au viewer ; recette technique scènes réussie |
| F05 | Motif, nouvelle soumission et révisions conservées. L’interface montre le retour courant ; elle ne prétend pas exposer une chronologie exhaustive |
| F06 | Ancienne publication valide conservée pendant révision/refus, hors suspension explicite |
| F07 | Retrait serveur immédiat et revalidation des pages ouvertes à 30 secondes/retour au premier plan |
| F08 | Filtres serveur avant pagination et curseur stable 006, tests dédiés |
| F09 | Retour contextualisé livré ; poursuite de recette ciblée sur combinaisons de vues possible |
| F10 | Favori indisponible conservé à l’écran et retirable, sans données privées supplémentaires |
| F11 | Identifiants de requête et unicité serveur ; boutons pendant envoi ; idempotence API testée |
| F12 | Demande distincte des états acceptée/confirmée |
| F13 | Replis SVG 2D, sémantique, liste/photos livrés. Une annonce sans scène reste un cas normal, pas un échec du catalogue |
| F14 | Source serveur commune et rafraîchissement des prix/statuts ; ne promet pas du temps réel |
| F15 | Vente partielle guidée par révision et nouveau total, sans calcul automatique |
| F16 | Localisation area, alias publics et scène masquée sans opt-in exact ; recette connectée |
| F17 | Quota transactionnel par annonce et conservation de l’emplacement pour révision ; ne pas compter une révision comme une seconde annonce |
| F18 | Total distinct, plage par place, inconnues exclues du filtre minimal ; tests catalogue/connectés |
| F19 | Acceptée sans horaire puis confirmée, participants/version/annulation ; recette API existante |
| F20 | Galeries propres et couverture partielle, qualité commune/unité distincte, dates et origine déclarée ; aucune certification automatique |

## Recette restant distincte du code livré

- **Accessibilité et performance** : la recette visuelle ciblée ne prouve pas un parcours complet au lecteur d’écran, au zoom 200 % ou sur tous les appareils. Les objectifs Web Vitals terrain ne sont pas mesurés. Les replis graphiques doivent aussi être confrontés aux appareils cibles.
- **Exploitation** : outil de sauvegarde et procédure livrés, restauration réelle base **et** Storage non exécutée ; supervision et objectifs RPO/RTO à vérifier dans l’environnement retenu. Les audits métier ne suffisent pas à prouver une supervision de production ou des statistiques d’usage exhaustives.
- **Sécurité opérationnelle** : TOTP réel testé puis facteur QA révoqué ; obligation globale administrateur toujours désactivée. Aucun enrôlement du compte opérateur déduit de ce test. La portée tous fils du blocage est confirmée par la recette SQL de 010.
- **Configuration de lancement** : aucune livraison email réelle ni déploiement public. Les fixtures Supabase ont été nettoyées selon les inventaires : 0 utilisateur QA, 0 annonce QA, 0 fichier QA restant confirmé. La démonstration locale reste séparée.
- **Terrain et données humaines** : parking pilote réel, autorisations des plans/photos, identité opérateur et textes à compléter. Ces éléments ne sont pas comptés comme fonctionnalités manquantes à coder.
- **V2** : abonnements mensuels différés ; aucun Stripe, paiement par annonce ou paiement du bien actif.

Pour les limites et rapports complets : [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [OPERATIONS.md](OPERATIONS.md), [scènes](qa/scenes-integration.json) et [compléments V1](qa/supabase-v1-complements.json). Aucun commit ou succès de CI GitHub n’est présumé par ce document. Il ne constitue pas une conformité complète.
