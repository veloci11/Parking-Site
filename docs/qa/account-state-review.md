# Agent 4 — suivi de suppression du compte

État : correctif local intégré aux fichiers partagés, sans recette navigateur ni modification de données.

## Contrat consommé

Le DTO033 confirmé par l’agent backend expose `requested`, `manual_review`, `purging` et `completed`, les dates `createdAt`/`updatedAt`, `limitedCleanupAt` nullable, `retainedCategories`, `activeSystemErased` et `completeErasure:false`. Il n’expose pas de date `completedAt`. Le composant reste compatible avec les reçus locaux/historiques qui ne possèdent pas encore `activeSystemErased` ou `version`.

## Correctifs

- Le suivi distingue désormais demande enregistrée, examen restant, suppression en cours et retrait vérifié du service actif. Il ne prétend pas à l’effacement de toutes les copies et ne prétend pas qu’un email a été envoyé.
- Une clôture n’est présentée comme un retrait vérifié que si le reçu porte explicitement `activeSystemErased:true`. Les journaux d’audit, le reçu minimal et les sauvegardes restent affichés selon les catégories effectivement renvoyées par le serveur, avec des libellés lisibles.
- Les catégories internes inconnues n’apparaissent pas comme du jargon dans l’interface ; elles restent signalées comme données soumises à conservation.
- L’actualisation annulée ou le démontage ne peut plus appliquer une réponse tardive. Un échec d’actualisation retire l’ancien reçu de l’affichage au lieu de laisser un état périmé à côté de l’erreur.
- L’écran public de suivi utilise bien le reçu du navigateur et n’est pas placé derrière une reconnexion au compte supprimé. L’API renvoie404 si le reçu n’existe pas ou n’est plus accessible ; aucun champ personnel n’est ajouté par ce correctif.

## Fichiers

- `src/components/account/deletion-status.tsx`
- `tests/deletion-status-ui.test.ts`
- Le présent rapport.

## Vérifications

- `npx tsx --test tests/deletion-status-ui.test.ts` : **3/3** réussis. Rendu réel du composant pour les états historiques, l’état en cours, une clôture avec preuve et une clôture sans preuve. Les limites audit/sauvegardes et l’absence de promesse d’effacement total sont contrôlées.
- `npm run typecheck` : réussi.
- Prettier et `git diff --check` sur les fichiers attribués : réussis.

La recette de la suppression Auth/Storage, du reçu après disparition du compte et de la conservation selon la politique appartient à033 ; elle n’est pas déduite de ces tests de rendu. Le comportement réseau d’annulation a été relu dans le code, sans navigateur ni simulation de connexion effectuée par cet agent.
