# Finition des boutons — 22 octobre 2026

Demande utilisateur : retirer les flèches décoratives, remplacer « Retour à l’exploration » par « Retour » et terminer cette passe en cinq minutes avec une équipe.

- Flèches décoratives retirées de 17 composants/pages : connexion, visite, dépôt, compte, comparaison, notifications, messages, annonces et administration.
- Libellé Retour appliqué à la fiche disponible/retirée, à la comparaison et au parking public ; destinations et conservation du contexte inchangées.
- Le retour mobile de messagerie possède désormais un texte visible et le nom accessible « Retour aux conversations ».
- Chevrons fonctionnels des menus/photos et navigation au clavier conservés.
- Deux agents ont effectué une relecture indépendante en lecture seule des éléments devenus vides, styles et noms accessibles. Le lien de messagerie et son nom accessible ont été vérifiés.

Build de production `thIGxvEcDWfeuxmyWSI0u` réussi, TypeScript inclus, format et `git diff --check` réussis. Pas de nouvelle suite métier pour cette modification de libellés/icônes ; les résultats précédents restent attachés à leur propre version.

Navigateur : fiche d’annonce sur Chrome, texte Retour, zéro SVG de flèche décorative, zéro SVG sur Se connecter/Demander une visite et aucun débordement horizontal. Connexion à 390 × 844 dans le navigateur intégré : bouton Se connecter sans flèche, contenu sans débordement. Captures dans `arrow-cleanup/desktop.png` et `arrow-cleanup/mobile.png`.

Le test de zoom 200 % commencé auparavant a été interrompu pour traiter la correction demandée : il reste non validé, tout comme le lecteur d’écran réel. Aucune autre promesse de recette n’est ajoutée.

Serveur de recette arrêté, onglets temporaires fermés, viewport restauré et runtime synthétique supprimé. Aucun changement distant Supabase, aucune publication du site. La purge CDN et les prérequis humains restent différés.
