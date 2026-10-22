# Une annonce, plusieurs places

Le dépôt regroupe toutes les places d’un même parking dans une annonce. Il comporte trois étapes : localisation et offres par place, photos et description, puis aperçu et envoi en modération. Les dimensions, observations détaillées, justificatifs et montants financiers supplémentaires restent accessibles dans des rubriques repliées. Leur absence reste une information inconnue, sans valeur inventée.

## Localisation

La recherche remplit la ville, le code postal et le point à partir du [géocodeur IGN / BAN](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/). L’adresse ou la commune est sélectionnée dans les résultats, sans champ longitude/latitude. La recherche est bornée à l’Île-de-France et les associations commune/code postal/département restent contrôlées côté serveur.

Le mode par défaut « secteur seulement » n’enregistre pas l’adresse précise recherchée ni son point exact : il conserve un point approximatif. Une commune suffit, sans numéro ni rue. Le mode d’adresse précise demande un choix explicite ; la recherche seule ne vaut pas validation de terrain. L’action de continuer enregistre d’abord le lieu, puis sa confirmation, tout en gardant les gardes de révision du backend. Une panne du géocodeur laisse la recherche des communes locale utilisable.

## Contrat commercial

- `pricingMode: per_space` : chaque `Space.offer` contient `transactionType` (`sale` ou `rent`), `priceCents` et `status` (`available`, `reserved`, `sold`, `rented`, `withdrawn`). Une place a une seule offre à la fois. Les loyers sont mensuels.
- L’exemple attendu de cinq places peut avoir trois ventes à des prix distincts et deux locations à des loyers distincts. Il reste une seule annonce, un dossier et une gestion commune.
- Les montants restent nuls pendant un brouillon incomplet ; les offres publiables demandent un prix positif et au moins une place disponible. Une vente et un loyer ne sont jamais additionnés.
- `pricingMode: lot`, ou son absence historique, conserve un prix ou un loyer pour l’ensemble. Aucun prorata des prix existants n’est inventé lors d’une conversion vers des offres par place.
- Les changements d’offre, de prix et de statut suivent le même contrôle de version et la même modération que le reste du dossier. La version approuvée reste visible jusqu’à la décision suivante.

Les filtres portent sur une même place disponible : mode vente/location, prix, type, niveau et surface ne peuvent pas être satisfaits artificiellement par plusieurs places différentes. Le total, le tri et le curseur sont calculés après ce rapprochement. `catalogMatch` décrit ce contexte de recherche avec des alias publics ; il est calculé par le serveur et n’est accepté ni comme champ de brouillon ni comme droit de publication.

## Vue du parking

Le clic sur une place change uniquement la sélection et le panneau d’informations. La page, l’image et l’étage restent montés. Si la place appartient à une autre annonce du même parking, son prix et son annonceur sont identifiés ; un lien explicite ouvre son dossier pour la contacter. Le formulaire de l’annonce initiale ne peut pas envoyer un message au mauvais vendeur.

Les repères de groupe portent les noms « Lot à vendre » et « Lot à louer », avec leurs numéros de places et leurs prix. Une annonce mixte peut donc présenter deux groupes sans être dupliquée. Les numéros sont saisis dans le premier champ de chaque emplacement ; les nouvelles places ne reçoivent pas de numéro inventé. « Emplacement 1 » désigne uniquement le rang dans le formulaire. L’onglet Carte, placé après Photos, réutilise la localisation publique choisie.

Les niveaux −1 et −2 utilisent des rendus séparés avec transition. Les surlignages et zones cliquables sont projetés depuis la même caméra que le rendu et excluent les éléments occultants. Les démonstrations sont fictives. Les plans, dimensions et photos des vrais biens restent à fournir et contrôler.

## Validation

Les preuves de recette sont conservées dans `docs/qa/listing-journey-http.json`, `listing-journey-ui.json` et `design-qa.md`. Les scripts utilisent des identités et des images synthétiques dans une base locale dédiée. Une preuve HTTP ne remplace pas une observation du formulaire dans le navigateur ; les deux sont consignées séparément. Les forfaits et paiements restent en V2.
