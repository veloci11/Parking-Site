# Revue administration — reprise du 22 octobre 2026

Périmètre : revue des sources et des tests de la modération des annonces, du registre, de l’historique/restauration des plans communs (032) et des demandes de préparation 3D (031). Aucun accès BDD, navigateur, serveur, build, commit ou push effectué par cette mission. Les fichiers serveur partagés `api.ts` et `supabase.ts` ont été consultés uniquement.

## Défaut prouvé et corrigé localement

La confirmation de relecture de l’annonce était un booléen indépendant de sa version. `load()` remplace la file après « Actualiser » en conservant l’identifiant sélectionné. Si la même annonce passe de N à N+1, le détail prend N+1 mais la confirmation de N restait cochée ; `decide()` envoyait alors la version N+1. Le contrôle serveur de version ne peut pas détecter cette attestation périmée puisque le numéro transmis est à jour.

Correctif borné dans `src/components/account/admin.tsx` : la case mémorise maintenant `{id, version}` au moment de la confirmation. Son état affiché, l’activation du bouton et le garde de `decide()` dérivent de l’égalité avec le dossier courant via `src/lib/moderation-review.ts`. Une actualisation vers N+1 invalide la confirmation immédiatement au rendu, sans dépendre d’un effet asynchrone. Les textes, types de décision et la présentation sont conservés.

`tests/moderation-review.test.ts` couvre le remplacement N→N+1 avec identifiant sélectionné inchangé, une nouvelle confirmation explicite, le décochage, le changement de dossier avec même numéro de version et l’absence de sélection.

## Revue 031 et 032

- 031 : contrats stricts, contrôle propriétaire/compte actif/vérifié, file admin protégée, pagination bornée, conflits de version et audit présents. Le statut `ready` modifie la demande manuelle, sans produire de source, scène ou publication. L’éditeur admin est remonté avec une clé `{listingId}:{version}`. Les tests existants décrivent les refus d’accès et l’absence de mutation d’annonce ; ils ont été lus, sans exécution de leur BDD temporaire.
- 032 : restauration limitée à une révision publiée réelle du même niveau ; comparaison des identités/dimensions physiques et des métadonnées de sources ; revalidation de disponibilité des sources, géométrie, repère et consentement courant ; nouvelle version et historique/audit transactionnels. Les résumés d’historique n’exposent pas les manifests, clés Storage ou identifiants de sources. Les tests existants couvrent les conflits, sources ou registre périmés, consentement perdu, absence de republication d’une annonce retirée, immutabilité et pagination ; ils ont été lus, sans relance SQL/SQLite.
- Aucun autre manque produit prouvé dans ce périmètre court. Ceci reste une conclusion de revue des sources et des tests, pas une validation de l’administration connectée ou du cache des médias. Le constat séparé de cache Storage après retrait conserve son statut propre.

## Vérification effectuée

Commande locale sans navigateur, serveur ni BDD de fixture :

```text
node_modules/.bin/tsx --test tests/moderation-review.test.ts tests/moderation-mfa.test.ts tests/modeling-request-ui.test.ts
6 tests réussis, 0 échec.
```

Les tests MFA utilisent une autorité simulée ; le test du composant de demande utilise un rendu HTML statique en mémoire. Le chargement du module de sécurité émet l’avertissement expérimental SQLite de Node sans ouvrir une BDD dans ces tests. Prettier appliqué uniquement aux trois fichiers du correctif. Build/typecheck global laissés à la coordination finale.

Fichiers de cette mission gelés après cette revue : `src/components/account/admin.tsx`, `src/lib/moderation-review.ts`, `tests/moderation-review.test.ts` et ce rapport.
