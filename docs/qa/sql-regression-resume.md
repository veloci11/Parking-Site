# Régressions SQL historiques — reprise du 22 octobre 2026

Périmètre : recettes historiques de `supabase/tests`, exécutées chacune dans une transaction annulée, contre les migrations001–033. Les recettes dédiées à032 (`common-parking-plan-history.sql`) et033 (`retention-finalization.sql`) sont suivies séparément.

## Écarts de fixtures corrigés

| Recette | Prérequis obsolète | Correction | Assertions conservées |
| --- | --- | --- | --- |
| `availability-maintenance.sql` | Brouillon soumis et publication `{}` sans commune, code postal ni point privé | Fixture synthétique Paris,75012, `[2.3739,48.8446]` ; projection publique et republication issues du brouillon | Fenêtre90jours, versions, rappels idempotents, expiration, course de nettoyage, suspension et références retenues |
| `catalog-cursor.sql` | Commune fictive « Ville Pagination », publications sans disponibilité, nouvelle ligne `{}` | Paris,75012, point privé parisien, disponibilité90jours ; recherche isolée par « Pagination » ; nouvelle publication copiée depuis la fixture cohérente | Curseur après insertion, total figé, absence de doublon/perte, dernière page |
| `scene-contract.sql` | Annonce soumise sans localisation et source encore en quarantaine après023 | Localisation Paris/75012 ; métadonnée de prévisualisation synthétique et passage par `gp_source_claim` puis `gp_source_complete` | Refus de preuve nulle/étrangère, date ISO, privilèges des cores, projection publique sans identités privées, périmètre de revue |

Les lieux lyonnais et codes69003 de `ile-de-france-scope.sql` sont des cas négatifs volontaires : ils restent inchangés. La commune « Nouvelle ville » dans `commercial-details-preview.sql` provoque volontairement l’invalidation d’une confirmation dans un brouillon et n’est pas publiée.

## Contrats actuels examinés

-028 exige commune/code postal/point privé cohérents avant soumission, approbation ou reprise. Les brouillons incomplets restent autorisés ; aucune désactivation de trigger ni modification du garde régional.
-013 exige une disponibilité future pour une insertion déjà publiée ; les recettes qui passent par l’approbation conservent le calcul serveur des90jours.
-016 conserve la confirmation serveur de localisation ; les changements d’adresse doivent effacer la confirmation. Les recettes qui testent ce comportement ne remplacent pas leurs attentes par une confirmation fabriquée.
-019/030 imposent le rattachement physique et sa signature normalisée aux recettes qui appellent l’approbation métier. Les préparations de rattachement déjà présentes sont conservées ; la pagination et le contrat de scène utilisent leurs insertions synthétiques d’opérateur existantes.
-023 interdit de fabriquer une source `ready` à l’insertion. La recette du contrat de scène prépare un original et une prévisualisation comme simples lignes Storage de transaction, puis respecte le bail et la complétion opérateur. Aucun fichier distant n’est téléversé.
-032/033 restent actifs : aucune modification de migration, fonction, politique RLS ou privilège produit dans ce correctif.

## Preuve et limites

Relecture des recettes et migrations, inventaire des lieux fictifs et `git diff --check` effectués. Le correctif n’a pas encore été exécuté par cet agent contre PostgreSQL/PostGIS ; aucune réussite SQL n’est revendiquée sur cette seule relecture.

Le workflow `Supabase migration and access checks` prépare un projet SupabaseCLI2.121.0 jetable, applique les migrations avec le vrai PostGIS et collecte chaque recette avec `ON_ERROR_STOP=1`. Son résultat doit être relevé après intégration du correctif. Cette preuve CI est distincte d’une recette MCP sur le projet Supabase distant ; cet agent n’a ni ouvert cette base distante ni lancé un serveur PostgreSQL local.

Les anciens rapports JSON peuvent décrire un banc PostgreSQL14 comportant des fonctions simulées. Ils restent des preuves historiques limitées et ne prouvent pas le passage de la suite actuelle avec PostGIS.
