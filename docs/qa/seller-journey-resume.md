# Reprise — parcours vendeur, mission 10/15

Vérification bornée du 22 octobre 2026. Le seul correctif produit de cette mission concerne le contrôle de version de l’API SQLite locale. Les fichiers du formulaire, l’identité visuelle, les rendus approuvés et le caractère facultatif de la 3D n’ont pas été modifiés.

## Écart reproduit et corrigé

Une requête dont le corps arrivait après une autre sauvegarde utilisait encore la ligne lue avant l’attente du corps. Le contrôle comparait donc deux versions anciennes identiques. Trois régressions ont été reproduites avant correction, par des corps `Request` volontairement retardés, sans réseau :

1. Une ancienne sauvegarde retournait 200 et écrasait le titre et les offres d’une version déjà enregistrée.
2. Une sauvegarde tardive retournait 200 et remettait en brouillon une annonce déjà transmise à la modération.
3. Une soumission tardive retournait 200 et figeait un contenu antérieur à la dernière sauvegarde.

Dans `src/server/api.ts`, les routes vendeur PATCH, soumission et cycle de vie relisent désormais la ligne après réception du corps. `saveDraft` conditionne aussi l’UPDATE à la version attendue ; une ligne non mise à jour provoque `409 VERSION_CONFLICT`. Les mutations appelant cette fonction restent dans leurs transactions existantes. Les autres décisions versionnées du même fichier lisent déjà leur état après la lecture asynchrone du corps. Aucun correctif PostgreSQL/Supabase n’est déduit de cette reproduction locale.

## Vérification ciblée

`tests/seller-journey-resume.test.ts` crée une base et un dossier média sous un répertoire système temporaire, force le mode local, puis ferme et supprime cette base. Ses cinq offres comportent trois ventes, deux locations mensuelles et deux numéros peints vides. Les tests vérifient le refus des trois requêtes obsolètes, le maintien des offres enregistrées, la conservation de la révision soumise et la reprise d’une modification après relecture de la version courante.

Résultat avant correction : **0/3**, avec les trois comportements incorrects ci-dessus. Résultat après correction : **19/19**, via :

```sh
./node_modules/.bin/tsx --test tests/seller-journey-resume.test.ts tests/backend.test.ts tests/per-space-offers.test.ts tests/transactions.test.ts tests/backend-admin-history.test.ts tests/modeling-request-ui.test.ts tests/listing-issues.test.ts
```

Prettier et `git diff --check` passent sur les fichiers de code de cette mission. Aucun test supplémentaire de navigateur, build, serveur, base connectée ou envoi externe n’a été lancé ici.

## Contrat vendeur confirmé dans les sources

| Point                             | Constat et limite de preuve                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dépôt en trois étapes             | `listing-wizard.tsx:59` définit Localisation et places, Photos et description, Vérifier et envoyer. Le dépôt mobile réel du coordinateur reste documenté séparément dans `resume-mobile-deposit.json` ; il ne résulte pas de ce test Node.                                                                                                                                                                                   |
| Sauvegarde et reprise             | `listing-wizard.tsx:305` transmet la version, conserve la saisie arrivée pendant une requête et sérialise ses sauvegardes. Le délai automatique est de 900 ms ; un avertissement de fermeture protège les modifications sales. La relecture après erreur est proposée avec confirmation de remplacement de la copie locale. Ces interactions sont constatées dans la source ; le présent test n’exécute pas les hooks React. |
| Cinq offres individuelles         | Le nouveau test conserve les cinq identifiants et leurs prix après conflit et reprise. `per-space-offers.test.ts` couvre les prix disponibles, filtres cohérents et révision modérée ; vente et loyer mensuel ne sont pas additionnés.                                                                                                                                                                                       |
| Ancien prix total du lot          | `transactions.test.ts` vérifie le loyer total hérité sans division par le nombre de places. Le changement de mode du formulaire remet le prix global à zéro et conserve les offres par place en mémoire pendant la session du composant ; aucune persistance de ce cache après rechargement n’est revendiquée.                                                                                                               |
| Numéro peint inconnu              | Une place neuve conserve une chaîne vide ; l’intitulé « Emplacement » ne devient pas un numéro. Deux numéros vides restent vides après reprise dans le nouveau test. La détection des doublons non vides au même niveau est présente dans `wizardIssues`.                                                                                                                                                                    |
| Modélisation manuelle facultative | `modeling-request.tsx:113` présente une demande manuelle, privée et indépendante du dépôt. Le test de rendu existant confirme que ses boutons ne soumettent pas le formulaire parent. Le suivi et les décisions serveur déjà exercés par le coordinateur restent dans `listing-journey-http.json`.                                                                                                                           |

La preuve porte sur l’API locale directement appelée et les contrôles ciblés indiqués, avec fixtures fictives isolées. Elle ne certifie pas l’Auth/Storage connecté, une base distante, la production publique, ni une nouvelle recette visuelle.
