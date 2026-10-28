# Administration — livraison du 27 octobre 2026

## Changements livrés

- Navigation dédiée administration/modération, distincte de l’espace personnel ; menu compact dépliable sur téléphone, fermeture après navigation et avec Échap.
- Modération : recherche par annonce, ville, vendeur ou référence ; focus sur le dossier ouvert ; sélection et confirmations réinitialisées après actualisation ; erreurs de chargement distinctes d’une file vide.
- Publications : présentation de la version réellement publiée (prix, photos, description), même lorsqu’un brouillon plus récent a été refusé. La décision utilise toujours la version courante du dossier pour refuser les modifications concurrentes.
- Comptes : pagination conservant la décision en cours, reprise d’une lecture échouée, retour vers le formulaire sélectionné et conservation des pages après une décision.
- Limites : reprise de l’échéance existante, validation des dates, erreurs de recherche distinctes des erreurs d’enregistrement ; journal des actions avec libellés lisibles et reprise réseau.
- Registre : recherche paginée des contributeurs au-delà de 100 comptes, sélection remise à zéro lors du changement de parking.
- Plans 3D : chargement atomique de l’annonce et de ses documents ; un échec ou une réponse tardive ne mélange plus deux dossiers.
- Signalements d’annonces et de conversations : filtres appliqués côté serveur avant pagination, curseurs bornés liés au filtre et au propriétaire. Les anciens dossiers ouverts restent accessibles au-delà des 100 plus récents. Une relance réseau répète la lecture échouée, sans charger accidentellement la page suivante.

## Vérifications

- Suite : 335 tests, 332 réussis, 3 conditionnels ignorés, zéro échec. TypeScript, format et compilation de production réussis.
- Six contrôles GitHub réussis sur `5206c50` : application, PostgreSQL et raster, push et PR. [Application](https://github.com/veloci11/Parking-Site/actions/runs/40634134530), [PostgreSQL](https://github.com/veloci11/Parking-Site/actions/runs/40634134543), [raster](https://github.com/veloci11/Parking-Site/actions/runs/40634134532).
- SQL dans une base Supabase jetable : 140 dossiers, égalités d’horodatage, pagination sans omission/doublon, ancien dossier ouvert, réexamen, permissions, isolation et curseurs invalides. Fixtures annulées intégralement.
- HTTP local : 68 contrôles des files de signalements et 169 contrôles du parcours annonce/comptes sur `next start`, base dédiée jetable. Aucun message ni email réel envoyé.
- Navigateur local : recherche « creteil » retrouvant « Créteil », dossier de publication et prise de focus, navigation admin compacte à 390 px, sélection d’un compte, studio à 320 px sans débordement. Aucun essai sur téléphone physique revendiqué. Capture : `admin-mobile-menu.png`.
- Panne simulée dans l’onglet de QA : après une actualisation échouée avec curseur existant, Réessayer effectue `/api/admin/reports?status=all&limit=50`, sans curseur. Blocage réseau et dimensions restaurés puis onglet fermé.

## Déploiement confirmé

- Commit applicatif `5206c50`, poussé sur `codex/build-parking-platform`.
- Migration additive `report_queue_pagination` appliquée à Supabase après CI SQL verte. Ancien RPC conservé.
- Contrôle SQL en production, transaction annulée : compte admin actif autorisé, RPC renvoyant un tableau, quatre publications visibles, exécution anonyme interdite. Aucune donnée réelle modifiée.
- Ubuntu : release `20261027-5206c50-admin`, build `dihQSupiXIDcyN6Tr3694`, bascule atomique et redémarrage du seul service utilisateur `gp-park.service`. Ancienne release conservée.
- HTTPS : `/api/ready` prêt en mode Supabase ; 16 contrôles publics réussis, quatre annonces réelles et leurs prix conservés, sept photos, trois icônes, filtres et accès admin privé. La session navigateur de QA publique n’était pas connectée : le formulaire admin authentifié a été vérifié localement, pas avec le compte personnel en ligne.
- Serveur local arrêté, fixtures supprimées, onglets de QA fermés.

## Limites conservées

Les advisors Supabase gardent leurs avertissements préexistants (31 tables privées sans politique directe, cinq fonctions anonymes, protection des mots de passe compromis). Le compteur de fonctions exécutables par authenticated passe de 60 à 61 avec le RPC ajouté ; celui-ci impose le compte actif et le rôle modérateur pour le mode administration. [Explication Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Cette livraison améliore les parcours administratifs et ne vaut pas certification générale de l’application. Restent les éléments déjà différés : identité de l’exploitant en création, SMTP et réception réelle, accès opérateur de purge CDN et exploitation des workers, restauration de sauvegarde et plans réels. Google/Apple et abonnements restent hors de cette passe. Les détails figurent aussi dans la précédente revue de production.
