# Historique restaurable des plans communs — migration032

Migration appliquée au projet Supabase de recette le22octobre2026, sans déploiement public. La migration a été créée avec Supabase CLI2.121.0 : `20261022084304_common_parking_plan_history.sql`. Les procédures026/027 restent valides ; les identités publiques et le rendu approuvé ne changent pas.

## Révisions et restauration

`gp_private.parking_level_plan_revisions` conserve une révision immuable par niveau/version : manifeste complet, mapping des identités physiques et dimensions, références et empreintes SHA256 enregistrées des sources, état, action, auteur, motif, date et éventuelle version d’origine. Publication, retrait et restauration sont versionnés dans la même transaction que l’état courant. Une restauration produit `version + 1`, elle ne rembobine pas le compteur.

Les états existants026 sont capturés en `legacy_snapshot`, avec leur motif et date de revue d’origine. Un événement d’audit distinct indique la reprise. Cela ne reconstruit aucune révision déjà écrasée et n’atteste aucune nouvelle vérification des sources. Les états de démonstration SQLite restent fictifs et ne peuvent pas être restaurés comme relevés réels.

Les rôles clients n’ont aucun accès direct à la table, ni aux fonctions internes. Un trigger interdit UPDATE et DELETE, y compris par un rôle privilégié ordinaire. L’accès applicatif reste réservé à un administrateur actif/vérifié avec AAL2 dans Supabase ; le mode local conserve les comptes fictifs et son contrôle admin habituel.

`POST /api/admin/parking-registry` accepte :

```json
{
  "action": "restore_level_plan",
  "levelId": "identifiant privé du niveau",
  "version": 3,
  "sourceVersion": 1,
  "rightsAttested": true,
  "checks": {
    "coordinateFrameConfirmed": true,
    "mappingChecked": true,
    "sourcesChecked": true
  },
  "reason": "Motif de contrôle actuel, de 15 à 2000 caractères."
}
```

Seule une révision publiée du même niveau est restaurable. Le serveur ignore tout manifeste de remplacement client et le contrat refuse les champs supplémentaires. Il compare le mapping physique actuel au snapshot et les métadonnées des sources, dont SHA256, taille, propriétaire et clé Storage. Les sources doivent toujours exister, être prêtes, appartenir au même parking et à un compte actif/vérifié. Le repère calibré et la géométrie sont revalidés par le validateur existant. Une publication actuelle consentie en localisation exacte doit encore autoriser l’affichage du niveau. Une différence impose un nouveau rapprochement, pas une restauration forcée.

Les empreintes comparées sont celles enregistrées lors de l’import contrôlé des sources. La transaction SQL vérifie la présence de l’objet Storage ; elle ne retélécharge pas ses octets. Les politiques d’immutabilité et le traitement d’intégrité des sources existants restent nécessaires. Le contrôle humain des droits et pièces actuelles est renouvelé par quatre attestations dans l’interface.

La restauration ne modifie aucune annonce, publication, identité commerciale, correspondance vendeur ou autorisation. Le plan public reste projeté uniquement sur les annonces actives, consenties et rattachées actuellement. Une ancienne annonce retirée, un vendeur suspendu ou une unité sans lien actuel ne réapparaît pas.

## Consultation admin

`GET /api/admin/parking-registry?levelPlanHistory=<levelId>&beforeVersion=<n>` renvoie :

```text
{ levelId, currentVersion, items, hasMore, nextBeforeVersion? }
```

Les pages contiennent au plus25 résumés, triés par version décroissante, avec curseur exclusif. Un résumé contient seulement version/état/action/motif/date, nombre de places et sources, indicateur démo et version d’origine facultative. Aucun manifeste, mapping, identifiant de source, chemin Storage ou identifiant d’auteur n’est envoyé dans cette liste. Les réponses restent privées, sans cache.

Dans `/admin/parkings`, choisir un parking puis un niveau ouvre « Versions du plan commun ». Le contrôleur peut lire le motif, charger les versions précédentes, restaurer une version publiée avec motif et attestations actuelles, ou retirer le plan courant. Une publication de nouveau manifeste reste disponible via la commande026 existante ; aucun éditeur de géométrie nouveau n’est revendiqué.

## Conservation et nettoyage

Toute référence historique dans `evidence_ids`, même d’un plan retiré ou remplacé, exclut la source des candidats orphelins **avant** la limite du job. Un index GIN accompagne cette recherche. La rétention et la finalisation de comptes033 doivent traiter ces références comme dépendances conservatoires ; l’équipe033 en a reçu le contrat. L’historique n’ajoute aucun nettoyage automatique, ni de durée de conservation implicite.

## Vérifications effectuées

- Tests TypeScript locaux : publication/retrait/restauration, capture unique d’état antérieur, révisions immuables, refus de version/source/empreinte/registre/consentement/compte invalide, non-résurrection, absence d’identités privées dans les DTO, pagination25 et droits HTTP admin. **12/12** tests ciblés plans/registre/sélection/rendus, typage et format réussis.
- Migration032 appliquée uniquement sur le clone jetable `gp_plan_history032`, issu du banc PG14 local `privacy031`. `supabase/tests/common-parking-plan-history.sql` a atteint `ROLLBACK` avec `plan_history_contract_closed=1`, et toutes ses assertions de conservation/droits/refus/restauration/pagination ont réussi.
- Limite de ce banc : `gp_validate_scene` est le substitut historique sans validation PostGIS. Les vérifications propres032 et les contrôles rectangulaires026 sont réels, mais cela ne remplace pas la recette du vrai validateur connecté. Les lignes Storage de la fixture sont inertes et transactionnelles ; aucun téléversement ni document humain n’est traité.
- Backfill vérifié sur un second clone jetable, avec un plan publié sous031 avant application032 : manifeste/date/motif conservés exactement, un seul snapshot et un seul audit de reprise. Le clone et ses fixtures ont été supprimés après contrôle. Le clone032 principal ne conserve aucune fixture (recette annulée).

Après revue, le coordinateur a appliqué032 au vrai projet Supabase de recette, puis exécuté la fixture complète avec le validateur PostGIS réel : `plan_history_contract_closed=1` et `ROLLBACK`. Aucun snapshot, document ou plan de cette recette n’a persisté. Cette preuve distante complète le banc local décrit ci-dessus. La recette navigateur de l’interface admin et le build final appartiennent au coordinateur. Aucun état global « prêt à ouvrir » ou déploiement public n’est annoncé ici.
