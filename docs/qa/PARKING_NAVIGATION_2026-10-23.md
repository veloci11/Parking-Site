# Carte flottante et navigation — 23 octobre 2026

Déployé sur https://parking.gilmathis.com, source `3a2952934acd5643d322ea36637c4c33e8c37480`, build Linux `1lOrq-Xy3jNhwpMH-EmfU`. Cette recette complète et remplace les descriptions de disposition mobile et de temporisation de MAP_EXPANDED_2026-10-23.md.

## Modifications

- Variante visuelle approuvée : filtres flottants sur la carte sans bande blanche ; recherche alignée avec la liste sur ordinateur. Carte dès y=68 sur ordinateur et y=64 sur mobile.
- Mobile : recherche puis une rangée vente/filtres/liste/carte ; page fixe en mode carte, aperçu depuis le bas et défilement interne. Liste défilante dans son propre panneau. Annonce complète défilante normalement.
- Plus de filtres : type/surface/budget/localisation, rayons 1/3/5/10/20 km, caractéristiques repliables, actions fixes, fermeture clavier et accès aux résultats en vue Liste.
- Résultats conservés pendant les mises à jour géographiques, attente de 650 ms après mouvement stable, redimensionnement différé pendant le geste. Aucun rechargement de document sur la sonde réseau lente.
- Places identifiées par numéro et niveau, rail −1/−2 et zoom de sélection ; étiquettes réduites pour éviter les chevauchements. Les places du lot de démonstration sont 13 au −1 et 24 au −2 ; la place 14 dessinée n’est pas proposée.
- Bouton Retour visible. Carte de l’annonce corrigée (hauteur CSS auparavant nulle), conservée entre onglets Photos/3D/Carte. Icônes de parking et états dorés des filtres harmonisés.

## Vérifications

- Suite locale : 261 tests, 258 réussis, 0 échec, 3 ignorés ; compilation locale réussie. Correctif final limité à la navigation clavier : TypeScript validé et compilation Linux réussie.
- Production : 33 contrôles HTTP réussis ; 731 fichiers du commit comparés par SHA-256, aucun écart. Deux annonces de démonstration, aucune annonce réelle modifiée.
- Navigateur : ordinateur 1280×720, iPhone simulé 390×844 et 375×667. Carte 900×652 sur ordinateur ; 390×780 sur mobile. Document mobile de la hauteur de la fenêtre, scroll extérieur nul, aperçu défilant seul.
- Rayon 5 km appliqué puis réinitialisé ; filtre Couvert appliqué depuis les caractéristiques ; menus sans débordement horizontal (353/353 px sur petit iPhone). Passage Liste/Carte, ouverture/fermeture d’annonce, carte intégrée visible et bouton Retour 44 px contrôlés.
- Revue indépendante du code terminée ; accès aux résultats masqués sur mobile corrigé en basculant explicitement vers Liste.
- CI GitHub : état exact dans `parking-navigation/ci.json`, certains jobs encore en cours au moment de cette capture. Ne pas confondre compilation locale/Linux et verdict CI final.

## Preuves et limites

Les captures et rapports sont dans `parking-navigation/`. Les vues publiques ont été vérifiées après déploiement ; le test de mouvement avec requête en attente est une preuve locale séparée (`slow-map.json`). Le format iPhone est simulé dans le navigateur ; pas de recette humaine Safari sur téléphone physique.

Google et SMTP personnalisé restent différés à la demande du propriétaire. Aucun email envoyé, aucun compte humain créé, aucune migration effectuée pendant cette passe. Les démonstrations restent fictives et sans messagerie/visite ; ces actions sont réservées aux annonces réelles. Les validations connectées antérieures restent documentées séparément et ne constituent pas un nouvel essai email.
