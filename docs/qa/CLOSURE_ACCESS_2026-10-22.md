# Complément de recette — navigation et réseau

22 octobre 2026. Cette vérification prolonge `UX_FINISH_2026-10-22.md` pour les cas prévus au plan 08 : retour après pagination, clavier, formats tablette, réduction des mouvements et connexion dégradée. Données synthétiques uniquement, serveur local de production isolé sur 3002. Aucune mutation du projet Supabase, aucun email réel et aucun déploiement.

## Observations avant les derniers correctifs

| Contrôle réellement exercé | Résultat et preuve |
| --- | --- |
| Navigation clavier à 768 px | Premier Tab atteint le lien d’évitement ; Entrée puis Tab conduit directement à « Ville ou quartier ». Le filtre d’offre s’ouvre par Entrée ; flèche bas puis Entrée choisit Location et rend le focus au déclencheur. Home puis Entrée rétablit Vente. Capture `closure-access/01-tablet-skip-link.png`. |
| Fermeture des filtres avancés | Le panneau s’ouvre et son bouton Fermer est atteignable au clavier. Défaut constaté : Échap ne ferme pas le panneau et fermer avec Entrée perd le focus après démontage. Correctif contre-vérifié ci-dessous sur le nouveau build. |
| Tablettes 768 et 1024 px | Largeurs de document respectivement 753 et 1009 px, pour 768 et 1024 px de fenêtre, sans débordement horizontal. Capture `closure-access/02-tablet-landscape.png`. |
| Recherche coupée | Blocage temporaire de `/api/listings` dans le navigateur : erreur affichée, puis récupération par Réessayer après déblocage ; Paris retrouve ses deux annonces. Défauts constatés : texte « Failed to fetch » et ancien compteur de sept annonces. Capture avant `closure-access/03-search-network-error-before.png`. |
| Fournisseur carte coupé | Blocage temporaire de `tiles.openfreemap.org` avant montage : état Carte indisponible, Liste toujours accessible. Déblocage puis Réessayer la carte réactive ses commandes. Le conseil de choisir un prix reste exposé dans l’arbre accessible pendant la panne ; correctif CSS contre-vérifié ci-dessous. Capture avant `closure-access/04-map-unavailable-before.png`. |
| Connexion lente simulée | Latence 400 ms, réception 187 500 octets/s, émission 75 000 octets/s. La recherche affiche son chargement puis Versailles et une annonce, sans montrer les offres de Paris comme nouveau résultat. Capture `closure-access/05-slow-search-result.png`. Ceci ne mesure ni le premier chargement complet ni les Web Vitals terrain. |
| Mouvements réduits | Préférence simulée `prefers-reduced-motion: reduce`. Entrée sur le bouton −2 sélectionne le niveau −2 et la place 24 ; le contact et le prix du lot suivent. Aucune animation/transition non nulle observée sur les éléments viewer inspectés. Capture `closure-access/06-parking-reduced-motion.png`. |

## Écart F09 confirmé par la relecture

Le retour après « Charger plus » ne rechargeait que la première page de 24 annonces, tout en tentant de remettre l’ancien défilement. Une annonce ouverte depuis la page suivante pouvait donc manquer au retour. Les tests précédents de retour sur sept annonces ne couvraient pas ce cas. Le correctif recharge les pages depuis des curseurs serveur frais et conserve la profondeur parcourue. Seuls le contexte de recherche, le nombre de résultats chargés et une date sont mémorisés pour 30 minutes ; aucune annonce, aucun prix ni curseur serveur ne sont conservés en session. Le test HTTP interne retire une offre et modifie un prix entre les deux lectures pour vérifier la fraîcheur réelle du retour. Une autre recette couvre 264 résultats et une sélection au-delà de 240. Les requêtes obsolètes sont annulées au changement de recherche et au démontage.

## Contre-recette sur le build final

Build de production **`C5S5S_JI7BzEPLunNgjBe`**, puis navigateur intégré à 1024 × 768. Base locale jetable avec les sept exemples habituels et 36 annonces explicitement fictives supplémentaires, soit 38 résultats pour Paris.

| Contrôle | Résultat observé |
| --- | --- |
| Retour Liste après pagination | 24 annonces initiales, puis 38 après « Afficher plus ». Ouverture de l’exemple 30, puis Retour à l’exploration : 38 cartes, Paris et prix croissant conservés, scroll vertical 3717 px, carte 30 visible à 291 px du haut. Capture `closure-access/07-return-page-two-list.png`. |
| Retour Carte après pagination | Sélection de l’exemple 30 à 20 900 €, ouverture de l’annonce puis retour : 38 cartes, même annonce dans l’inspecteur, position du panneau 8458 px. Carte rétablie et utilisable. Capture `closure-access/09-return-page-two-map.png`. |
| Fermeture des filtres | Échap depuis le bouton de fermeture, clic Fermer, puis Voir les 38 résultats : les trois rendent le focus à Plus de filtres avec `aria-expanded=false`. |
| Panne du fournisseur de carte | 38 annonces restent accessibles ; le conseil de choisir un prix est masqué (`display:none`). Déblocage puis « Réessayer la carte » rétablit la carte et permet le parcours précédent. Capture `closure-access/08-map-unavailable-after.png`. |
| Panne de recherche | Recherche Versailles interrompue : message français utile, critères conservés, compteur « Résultats à actualiser ». Aucun ancien compteur de Paris présenté comme résultat de Versailles. Capture `closure-access/10-search-network-error-after.png`. |
| Reprise après panne | Déblocage puis Réessayer : une annonce à Versailles, aucun débordement horizontal. Capture `closure-access/11-search-recovered.png`. |

**Vérifications du code final : 233 tests, 230 réussis, aucun échec, trois conditionnels ignorés ; build et contrôle de format réussis.** Les douze tests ciblés de continuation/navigation passent. Une dernière relecture indépendante du diff par l’agent spécialisé n’a relevé aucun défaut matériel supplémentaire. Le parcours HTTP 168/168 du rapport précédent appartient à son propre build ; il n’est pas présenté comme une nouvelle exécution sur celui-ci. La CI du nouveau commit doit être vérifiée après push.

Les simulations réseau et mouvement ont été réinitialisées, le viewport restauré, l’onglet fermé et le serveur arrêté. Le runtime `listing-journey-TfUFhL`, ses comptes fictifs, les 36 annonces supplémentaires et ses médias ont été retirés par la procédure de nettoyage dédiée. Aucun écouteur ne subsiste sur les ports 3000/3001/3002 de cette tâche. Le serveur 8768 d’un autre projet est conservé.

## Limites explicites

L’arbre accessible et les interactions clavier ne constituent pas une écoute VoiceOver/NVDA. Aucun parcours avec lecteur d’écran réel n’est validé par cette passe. Le raccourci de zoom essayé dans le navigateur intégré n’a modifié ni le viewport ni le ratio ; **le zoom navigateur réel à 200 % n’est pas validé**. Aucun zoom CSS ou changement de résolution n’est présenté comme son équivalent.

Les simulations réseau et mouvement sont temporaires et réinitialisées avant fermeture. La preuve sur de vrais biens, la réception email humaine, le compte administrateur humain/MFA, la purge CDN différée et l’exploitation restent séparées de cette recette locale.
