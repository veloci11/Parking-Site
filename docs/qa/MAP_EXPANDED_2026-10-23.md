# Carte agrandie — 23 octobre 2026

## Modification livrée

La bande « Le Raincy · 3D » et le bouton « Rechercher ici » sont retirés. La carte rejoint directement la barre de filtres. L'en-tête d'exploration passe à 68 px et la liste latérale à 380 px sur grand écran. Sur mobile, la carte remplit la hauteur restante ; l'aperçu d'une annonce reste sous la carte.

La recherche devient « Rechercher un lieu », avec un bouton pour effacer la saisie. Une recherche par lieu remplace l'ancienne zone géographique et conserve les autres filtres. Les résultats sont actualisés 350 ms après un déplacement manuel ou un zoom ; sélectionner un prix, recadrer, redimensionner ou changer 2D/3D ne relance pas la recherche. Les recherches différées sont annulées quand la carte est masquée ou démontée.

## Recette

- 251 tests : 248 réussis, aucun échec, 3 conditionnels ignorés. Les nouveaux tests couvrent la temporisation, l'annulation, la déduplication, le recentrage sur les bons résultats et le remplacement des critères géographiques.
- Build de production et typage réussis ; formatage et diff sans erreur.
- Navigateur ordinateur 1280 × 720 : carte 900 × 587 px, début à y=133, aucun débordement horizontal. Environ 18 % de surface gagnée par rapport à la disposition précédente à cette taille.
- Déplacement manuel et zoom : bbox mise à jour automatiquement, deux résultats conservés dans la zone. Clic sur un prix : sélection conservée, bbox inchangée. Recherche « Le Raincy » : ancienne bbox retirée et carte recentrée sur les résultats correspondants.
- Mobile 390 × 844 : carte 390 × 571 px allant jusqu'au bas de l'écran. L'aperçu de sélection apparaît sous la carte, sans recouvrir les prix ni les commandes. Aucun débordement horizontal.
- Aucun avertissement ni erreur console dans les deux onglets locaux de cette recette. Captures dans `map-expanded`.

## Limites conservées

Les corrections de dépôt, de comptes et de textes de la [recette précédente](UX_PROFESSIONAL_2026-10-22.md) sont conservées. Aucune migration, modification de compte réel ou émission d'email dans cette passe. Le SMTP personnalisé et la réception des emails restent différés par le propriétaire ; les modèles sont prêts mais non activés. Les annonces du Raincy restent des démonstrations fictives en lecture seule.

## Mise en ligne vérifiée

- Source `09004f30c417c35c92602e1a1353fd4aebfa3024`, build Ubuntu `t4OWXhbPC5rVJjHdHxC7j`, release `/home/mathis/gp-park/releases/20261023-09004f3-map`.
- 33 contrôles HTTP publics réussis et 722 fichiers identiques à l'archive Git. Les six contrôles CI de cette source sont réussis.
- Carte vérifiée sur `https://parking.gilmathis.com/?display=map` : début à y=133 sur 1280 × 720, bande et bouton retirés. Capture `map-expanded/live-map.png`.
- Serveur local de recette arrêté. Aucun changement aux autres services Ubuntu.
