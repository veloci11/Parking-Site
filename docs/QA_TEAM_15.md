# Recette de reprise : quinze agents en vagues

Le propriétaire a demandé quinze agents le22octobre2026. La session permet quatre agents actifs au total, coordinateur compris : les spécialistes passent donc par vagues de trois, avec un seul propriétaire par fichier. Le nombre de missions n’est pas une preuve de recette ; chaque ligne doit avoir un résultat observable et un rapport.

| N°  | Agent / mission                                                              | État à l’ouverture du registre                                     | Livrable                                    |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| 1   | backend_registry — Auth, MFA et parcours HTTP connecté des offres/demandes3D | 224 contrôles réels verts,1échec CDN conservé ; nettoyage réel terminé | `docs/qa/connected-offers-modeling.json`    |
| 2   | parking_visual_redesign — sélection de lot et versions/restauration de plans | Sélection corrigée ;032 réelle et recette rollback réussies | `docs/qa/common-parking-plan-history.json`  |
| 3   | qa_delivery — conservation et effacement final contrôlé                      | 033 réelle appliquée ; recette rollback réussie, aucune politique active | `docs/OPS_RETENTION.md` et recette033       |
| 4   | ui_account_states — états d’effacement et erreurs de suivi                   | États/erreurs corrigés ;3tests de rendu réussis | `docs/qa/account-state-review.md`           |
| 5   | sql_regressions — compatibilité de toutes les recettes avec le schéma actuel | 3fixtures réparées ; toutes recettes CI032–034 vertes au2d51ec8 | Rapport CI/SQL et corrections de fixtures   |
| 6   | search_integrity — filtres, prix par place, tri et pagination                | Surfaces/offres alignées ;12tests ciblés verts | Revue et cas de régression pertinents       |
| 7   | media_integrity — médias, sources privées et références conservées           | Audit médias terminé ; outil photo opérateur livré,6tests verts | Revue des accès et dépendances              |
| 8   | auth_review — accès directs, rôles et sessions                               | MFA relue ;034 réelle et recette rollback réussies | Revue indépendante du contrôle serveur      |
| 9   | messaging_review — messages, visites et notifications                        | Visites rejouées sans doublon ;19tests ciblés verts | Idempotence, confidentialité et états       |
| 10  | seller_journey — dépôt, sauvegarde et révisions                              | 3courses SQLite reproduites puis corrigées ;19tests ciblés verts | Parcours vendeur et conflits de version     |
| 11  | public_viewer — sélection, lots, étages, repli et navigation                 | Rendus/mapping/navigation relus ;9tests ciblés verts | Revue des interactions et correspondances   |
| 12  | admin_review — modération, registre et décisions                             | Relecture admin liée à id+version ;6tests ciblés verts | Revue des commandes et états admin          |
| 13  | a11y_review — clavier, formulaires et petit écran                            | Focus/menu/ARIA corrigés ; contrôle navigateur ciblé réussi | Écarts d’accessibilité concrets             |
| 14  | performance_seo — chargement, indexation et exploitation                     | Audit terminé ; outil privé de purge cache livré,12tests verts | Vérifications techniques bornées            |
| 15  | final_acceptance — revue indépendante des exigences et preuves               | Revue indépendante terminée ; limite CDN et prérequis humains explicites | Verdict d’acceptation et limites explicites |

Le coordinateur conserve l’intégration, les builds, les serveurs locaux, la navigation IAB, les migrations distantes et la décision de fin. Le dépôt mobile complet sur build de production local a été observé à390×844, jusqu’à l’envoi en modération ; ses captures sont dans `docs/qa/resume-captures/`.

Les rendus approuvés, le logo GP, la police Inter et la palette restent figés. Les vrais plans/photos/dimensions, les véhicules plus ordinaires, les forfaitsV2 et l’ouverture publique demeurent dans leurs périmètres différés. Aucun agent ne transforme une recette fictive ou locale en preuve de production publique.
