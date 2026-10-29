# Prix et disponibilité par place · contrôles frontend

## Vérifications automatisées

`tsx --test tests/listing-offers-ui.test.ts` : 6 tests réussis.

- Une annonce de cinq places (trois ventes et deux locations) produit une seule carte. Le prix et le nombre de places suivent le filtre vente/location.
- Le prix du `catalogMatch` correspond à la même unité que les critères du catalogue ; le minimum d’une autre unité ne le remplace pas.
- L’inspecteur suit le type recherché et conserve un seul lien vers l’annonce.
- Le tableau conserve les cinq unités, leurs montants et leurs statuts individuels.
- Le résumé d’une place sélectionnée affiche son prix propre ; les annonces historiques gardent la portée « lot entier ».
- La préparation avant connexion reporte le choix vente/location et le prix à chaque place, sans sélecteur d’offre global.

`tsc --noEmit --pretty false` : réussi après les modifications frontend.

## Contrôle exploratoire navigateur

Sur le serveur de développement local `127.0.0.1:3000`, dans un onglet Chrome dédié, fiche de démonstration `10000000-0000-4000-8000-000000000007` :

- Le clic de la place 13 à la place 12 conserve le chemin de la fiche et l’image du niveau (même identifiant d’accessibilité). Seule la sélection de l’URL change via `replaceState`.
- Le panneau passe de 32 000 € pour le lot d’origine à 18 500 € pour l’autre annonce et affiche son titre, son annonceur et un lien explicite vers sa fiche. Le clic sur une place ne déclenche aucune navigation.
- Le retour à la place 13 rétablit le bon panneau. Le niveau −2 sélectionne la place 24 et son prix.
- La vue mobile conserve le plan, les sélecteurs et le défilement. Largeur document observée = largeur disponible, sans débordement horizontal. La taille normale du navigateur a été rétablie après le contrôle.

## Recette des cinq offres sur le serveur de développement

Fixture publiée `3a0d56c5-69bb-4455-93cd-9cec8b3381a5`, conservée temporairement pour la recette : trois ventes (QA-1 disponible à 31 000 €, QA-2 réservée à 29 000 €, QA-3 vendue à 30 000 €) et deux locations (QA-4 louée à 150 €/mois, QA-5 disponible à 160 €/mois).

- Le catalogue location à Paris affiche une seule carte pour cette annonce, à 160 €/mois/place et une place correspondante. L’inspecteur affiche le même loyer.
- La bascule en vente affiche la même annonce une seule fois, à 31 000 €/place. Les montants des places réservée et vendue ne deviennent pas le prix de recherche.
- La fiche affiche les cinq unités avec leur offre, prix et statut. La sélection de QA-2 affiche son montant exact et « Réservée », désactive le bouton de visite et masque le formulaire de contact. La sélection de QA-5 rétablit le contact et affiche 160 €/mois/place, sans navigation.
- La comparaison conserve le filtre vente et distingue 31 000 €/place des 32 000 € du lot historique indivisible ; les statuts par place restent visibles.
- Les repères commerciaux sont identiques dans le plan et dans le panneau de prix, stables entre niveaux. L’onglet Carte suit Photos et présente un seul marqueur pour localiser le parking. Les libellés définitifs vente/location seront recontrôlés après le gel.

## À vérifier sur la recette finale

Les captures finales et le contrôle de l’annonce publiée à cinq offres doivent être réalisés après le gel du backend, du wizard et des nouveaux repères de lots / onglet Carte. Les contrôles exploratoires ci-dessus ne constituent pas cette recette finale.

La version locale construite a démarré sur une base neuve. Le contrôle Chrome de cet agent a ensuite échoué avec `Debugger unattached` : lecture DOM/AX possible, clics et fermeture impossibles, y compris dans un nouvel onglet. Aucune connexion ni demande 3D n’a été envoyée par cet agent sur cette base. Les deux onglets temporaires `38594330` et `38594382` restent ouverts après l’échec vérifié de fermeture ; aucun onglet personnel n’a été actionné. Le viewport temporaire avait été réinitialisé avant cet incident.

Le coordinateur reprend la recette finale connectée et les captures dans son navigateur intégré. Les résultats de ces contrôles doivent être consultés dans son rapport final.

## Interface de demande de modélisation

`tsx --test tests/modeling-request-ui.test.ts tests/listing-offers-ui.test.ts` : 7 tests réussis. Le test supplémentaire vérifie que le composant facultatif de demande 3D s’intègre au formulaire du wizard sans formulaire imbriqué ni bouton qui soumettrait ce wizard.

Le composant propriétaire est intégré à Mes annonces et au wizard. La file « Demandes 3D », réservée aux administrateurs, est intégrée à l’espace de modération, avec accès direct par ancre, pagination et mise à jour de statut contrôlée par version. La note initiale reste privée et en lecture seule dans la file. Le statut de préparation et la publication du plan restent distincts. TypeScript et le formatage des composants passent ; le parcours connecté de cette fonction est repris par le coordinateur à cause de la limite Chrome décrite ci-dessus.
