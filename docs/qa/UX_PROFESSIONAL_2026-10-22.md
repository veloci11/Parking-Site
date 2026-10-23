# Recherche, dépôt et comptes — 22 octobre 2026

## Changements

- Recherche inspirée de l'organisation de Dabang : filtres compacts, liste latérale avec photo et prix prioritaires, carte occupant l'espace disponible. Logo GP, palette et rendus intérieurs approuvés conservés.
- Prix visibles même lorsque plusieurs annonces partagent un point : montants individuels à l'échelle de la rue, fourchettes et compteur au dézoom. Vente, loyer mensuel, prix par place et lot entier ne sont pas mélangés.
- Un seul aperçu dans la liste ; aucune fenêtre flottante ajoutée sur la carte. Sur mobile, l'aperçu suit la carte et le commutateur Liste/Carte reste dans la barre de recherche.
- Textes promotionnels et préparation anonyme retirés. Connexion/inscription en formulaire unique. Dépôt connecté en trois étapes, informations secondaires repliées, statut particulier/professionnel demandé à la publication.
- Navigation du compte réduite aux fonctions principales. Les outils de modération restent soumis au rôle et à la MFA ; le suivi des signalements reste accessible dans Messages et Aide.
- Confirmation et récupération : erreurs fournisseur explicites, renvoi du lien, maintien du retour demandé, confirmation du mot de passe et protections PKCE/session conservées.

## Vérifications

- Suite complète finale : **245 tests, 242 réussis, aucun échec, 3 conditionnels ignorés**. Typage intégré au build de production ; formatage et `git diff --check` réussis.
- **168 contrôles HTTP réussis** dans une base SQLite jetable : acheteur/vendeur/modérateur/admin, inscription/confirmation locale, dépôt de cinq offres mixtes, photos, brouillons, publication, révisions, conversations privées, disponibilité, retrait et protections d'accès. Rapport : `listing-journey-http.json`. Il s'agit d'une recette locale, pas d'une preuve de délivrabilité SMTP.
- Parcours navigateur de dépôt : validation d'un formulaire vide, recherche de commune, confidentialité du secteur, place18 à18500€, téléversement de trois images synthétiques, sauvegarde/rechargement et choix du statut vendeur. Aucune annonce réelle créée ou modifiée.
- Carte sur ordinateur et mobile : deux prix, sélection/retour, liste/carte, filtres, ouverture de l'annonce et niveaux du parking. Captures dans `ux-professional`.
- Contrôles Auth isolés utilisant le SDK Supabase installé : voir `AUTH_EMAIL_2026-10-22.md`. Revue indépendante finale du statut vendeur, callback, resend et reset sans régression bloquante identifiée.

## Emails et limites

La configuration SMTP est reportée à la demande du propriétaire. Quatre modèles HTML GP park et leurs sujets sont prêts dans `supabase/templates/auth`, mais **ne sont pas activés** dans Supabase. Le dashboard impose la configuration d'un SMTP personnalisé avant leur édition. Aucun fournisseur d'un autre projet n'a été réutilisé, aucun abonnement souscrit et aucun email réel envoyé pendant cette recette.

Le projet connecté autorise l'inscription et exige la confirmation email. Un compte humain confirmé a été observé en lecture seule et conservé. Les tests isolés ne valident ni l'expéditeur ni la réception en boîte email. Cette dernière vérification restera à faire après configuration.

Les deux annonces du Raincy restent des exemples fictifs en lecture seule. Le domaine reste en noindex ; abonnements en V2, vrais documents de parking et purge CDN précédemment différée restent hors de cette livraison. Aucun changement des règles RLS ni migration SQL pendant cette passe.
