# Deux exemples au Raincy et carte simplifiée

Site vérifié : https://parking.gilmathis.com/?display=map. Source applicative `9a498e307e19e08a11b8267c757fe41be0f8d864`, build Linux `E1OzrGT41kcvBM8Nte0oM`, release Ubuntu `20261022-9a498e3-showcase`. Service utilisateur `gp-park` actif, sans redémarrage automatique après bascule. Les services Encar et le tunnel existant restent actifs.

## Exemples consultables

Deux annonces fictives au 16–18 allée Victor Hugo, 93340 Le Raincy : place12 au niveau−1, puis lot de deux places13 et24 sur les niveaux−1/−2. L’adresse provient de l’IGN/BAN ; prix, dimensions, état, photos, numérotation et agencement sont illustratifs. Aucun bien réel n’est proposé à cette adresse. Aucun faux compte, publication, réservation ou plan approuvé n’est créé dans Supabase. Messages et visites sont désactivés sur ces exemples ; les personnages locaux restent inaccessibles en ligne. Voir le [contrat de présentation](../PUBLIC_SHOWCASE.md).

Les rendus de parking approuvés sont conservés avec leurs zones cliquables et leur animation de changement de niveau. Les places12/13 et le niveau−2/place24 ont été sélectionnés dans le navigateur sans navigation de page ; la [capture du niveau−2](public-showcase/parking-minus-2.png) a été prise sur le premier build `Hq15lPusyFh08BrGVYiJc`, avant la simplification de la carte. Les deux images ont ensuite été vérifiées identiques par SHA256 sur le build final.

## Correction de l’interface demandée ensuite

- Me localiser et Voir les annonces supprimés, ainsi que leur code d’interaction.
- Recherche de zone dans une barre blanche fixe au-dessus du canevas. Bouton discret « Rechercher ici », disponible après déplacement/zoom ; la recherche applique les bornes affichées.
- Un clic d’annonce remplace la liste par un aperçu dans la colonne de gauche. Retour retrouve la liste et sa position. Échap ferme l’aperçu. La carte conserve toute sa largeur et aucun aperçu ne flotte dessus.
- Les repères regroupés affichent leurs annonces dans cette même colonne. Aucun second panneau flottant de choix ne s’empile sur la sélection. Le bouton Tout afficher retrouve les autres résultats.
- Message d’aide, état vide dupliqué et bouton Comparer flottant retirés de la carte. La comparaison reste accessible depuis les annonces et son bandeau n’apparaît qu’après une sélection explicite.
- Sur mobile, carte compacte puis aperçu en flux normal sous la carte. Un observateur redimensionne le canevas sans recréer la carte. Le format de test a été réinitialisé après recette.

## Vérification réelle

La [preuve HTTP](public-showcase/http-smoke.json) contient **27 contrôles publics réussis** : disponibilité Supabase, session anonyme, deux exemples, curseur sur deux pages, recherche au Raincy, absence de résultats à Lyon/en location, budgets/types/niveaux, fiches SSR, groupes partagés, refus des mutations/favoris sur les exemples, protections des API privées, refus des personnages et intégrité des assets. Aucune création de compte ni transmission de message/email.

Les tests dédiés couvrent notamment la désactivation, le retrait automatique des exemples du catalogue dès une publication réelle, les filtres, les tris et l’absence de repli fictif en cas de panne. Suite : **237 tests, 234 réussis, 0 échec, 3 conditionnels ignorés** sur Mac et Ubuntu. Typage, format et build Linux réussis ; [six contrôles CI réussis pour la source](public-showcase/source-ci.json). [687 fichiers de la source déployée](public-showcase/source-verification.json) correspondent au commit applicatif, sans différence.

Dans le navigateur public, sélection d’un groupe puis d’une annonce, Retour et recherche de zone ont été exercés. Les mesures [desktop](public-showcase/desktop-layout.json), [mobile390×844](public-showcase/mobile-layout.json) et [barre de zone active](public-showcase/zone-layout.json) montrent : un seul aperçu, zéro panneau flottant concurrent sur la carte, aucun débordement horizontal, bouton contenu dans sa barre et barre au-dessus du canevas. Sur ordinateur, l’aperçu reste à gauche de la carte ; sur mobile il commence après son bord inférieur.

Captures : [carte de la ville](public-showcase/city-map.png), [sélection desktop](public-showcase/selected-sidebar.png), [sélection mobile](public-showcase/mobile-selection.png).

Cette recette porte sur les exemples et ces interactions. Le pilote avec plans/photos réels, le compte humain/MFA, les emails réels et la purge CDN différée restent dans leurs états précédemment documentés. Le site reste en noindex. Aucun paiement activé.
