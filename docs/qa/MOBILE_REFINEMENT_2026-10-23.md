# Ergonomie mobile, liste et filtres — 23 octobre 2026

Déployé sur https://parking.gilmathis.com. Source applicative : `22c0b458405e400cfe923b904d32a6f62eca5d48`. Build Ubuntu : `qP86gdqqPpWZgZe9JN6Go`. Les preuves de livraison se trouvent dans `mobile-refinement/`.

## Changements

- Carte par défaut sur téléphone et ordinateur ; un lien demandant explicitement Liste reste respecté.
- Même emplacement et largeur de recherche/filtres dans les deux vues. Filtres flottants conservés sur la carte. En Liste, suppression des séparateurs du bandeau et boutons secondaires adoucis.
- « Parking & box » doré dès l’ouverture, comme « À vendre ».
- Comparaison uniquement dans la liste, avec bouton et état sélectionné explicites. « Acheter ou louer » retiré de la navigation principale ; l’aide reste accessible en pied de page.
- Parking 3D mobile : choix des lots et niveaux compact, places identifiées, vue agrandie dans la fenêtre, fermeture Échap et restitution du focus. Les fichiers de rendu approuvés sont conservés.
- Aperçu d’annonce : Retour dans le flux, sans bande collée sur la photo ; cœur de 44 px directement sur celle-ci. État et erreurs des favoris partagés avec la liste. Les démonstrations publiques restent sans écriture de favoris, avec explication visible.
- Nouvelle icône de parking couvert avec toit pentu et P lisible.
- Filtres avancés : retrait de Caractéristiques, Plan 3D disponible et Zone visible ; nombre minimum de places et particulier/professionnel ajoutés, occupation et niveau directement accessibles. Budget, surface, type et rayon conservés.
- Migration `20261023152352_catalog_offer_criteria` appliquée : nouveaux critères dans la RPC publique avant total et pagination, sans lecture supplémentaire du catalogue ni changement de permissions. Les types d’annonceurs inconnus ne sont pas assimilés à des particuliers. Les places vendues/louées séparément ne comptent que si leur offre disponible satisfait les autres critères.

## Vérifications

- Suite locale finale : 266 tests, 263 réussis, 0 échec, 3 ignorés ; TypeScript et format validés. Compilation Linux de la source finale réussie.
- Recette navigateur locale : 390×844 et 1280×800 ; recherche et bascule Liste/Carte aux coordonnées identiques, filtre de deux places ne gardant que le lot, couleurs dorées identiques, Retour au-dessus de la photo, cœur visible sur mobile. Parking agrandi également vérifié à 375×667.
- Recette navigateur publique : ouverture par défaut sur Carte, recherche stable lors du passage Liste, vue agrandie et passage −1/−2. Rapports HTTP, concordance des fichiers et captures de la version finale joints dans `mobile-refinement/`.
- Migration contrôlée sous rôle anonyme : 7 combinaisons valides, 8 valeurs invalides refusées ; tests sans modification d’annonce. Tests locaux couvrant le filtrage avant pagination et le contrat des curseurs.
- Production finale : 33 contrôles HTTP généraux et 8 contrôles des nouveaux critères réussis ; 747 fichiers comparés au commit par SHA-256 sans écart. Aperçu mobile 390×844 : défilement extérieur nul, cœur 44×44, photo sous l’en-tête sans chevauchement.
- CI GitHub : six vérifications terminées avec succès (verify, SQL et raster), verdict dans `mobile-refinement/ci.json`.

## Limites conservées

Formats iPhone simulés dans le navigateur, pas de validation sur un iPhone physique. SMTP, Google et véritables documents de parking restent différés par le propriétaire. Aucun compte humain, email ni message créé pendant cette passe. Deux annonces fictives au Raincy, site toujours non indexé.
