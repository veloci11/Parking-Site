# Finition et revue de production — 24 octobre 2026

## Périmètre

Revue parallèle acheteur/mobile, vendeur et comptes/administration, puis contre-relecture indépendante. Le design approuvé est conservé. Aucun email réel, message à un tiers ni nouvelle annonce de production n'est créé par cette recette.

## Corrections livrées

- Première visite : cadrage des annonces disponibles, sans remplacer une caméra mémorisée ou un geste utilisateur ; recherche vide et reprise réseau visibles sur mobile.
- Dépôt : changement de quantité explicite, conservation des places existantes pendant la saisie, niveaux inconnus laissés inconnus, sauvegarde des dernières frappes avant les liens interceptés du dépôt et du menu ; le bouton Précédent du navigateur n’a pas été validé par cette recette.
- Connexion : reprise de la destination et de la place sélectionnée.
- Messagerie : actualisation visible des nouvelles conversations et badges non lus ; réponses tardives isolées entre conversations et formulaires de visite réinitialisés.
- Administration : recherche et pagination au-delà de 100 comptes, également dans le sélecteur de limites ; droits et décisions conservés.
- Transport client : erreurs réseau/proxy en français, délais bornés, aucune répétition automatique d'une écriture dont le résultat est incertain. Les lectures de session simultanées sont regroupées sans conserver de réponse en cache.
- États d'erreur et textes de prix clarifiés ; documentation MFA alignée sur la politique déjà choisie.

## Vérifications locales

- Suite complète avant les deux dernières retouches UX : 310 tests, 307 réussis, 3 conditionnels ignorés, aucun échec. Les quatre tests de panne/reprise puis les cinq tests de présentation des informations ont également réussi ; la CI complète est verte sur le commit applicatif final.
- Compilation de production, TypeScript, format et contrôle des différences réussis. Cette passe inclut dix tests OAuth avec le SDK réel et un transport isolé ; aucun compte Google ou Apple réel n’a été créé.
- Revue des dépendances de production : aucune vulnérabilité signalée par `npm audit --omit=dev` au moment du contrôle. Ce résultat ne constitue pas un audit complet de sécurité.
- Mobile : fenêtres CSS de 320, 375, 390 et 430 px, sans débordement ni scroll global en carte ; panneau, filtres, favoris, niveaux de démonstration et navigation vérifiés. Aucun essai sur iPhone physique n'est revendiqué.
- Dépôt : dernier numéro saisi conservé après navigation, deux places conservées pendant la saisie d'une nouvelle quantité, ajout/retrait explicites, prix préservés. Voir `seller-verification.json` et les captures.
- Parcours HTTP complet : **169 contrôles réussis**, aucun échec, avec `next start` et une base locale jetable. La base a été supprimée après l’arrêt du serveur. Aucune annonce ni messagerie de production modifiée par cette recette.
- La migration SQL, la CI et la version réellement déployée sont consignées ci-dessous après leur exécution.

## Limites d'ouverture commerciale

- Le propriétaire indique que l'entreprise est en création : identité et documents de l'exploitant restent à finaliser après sa création.
- SMTP personnalisé et réception réelle des emails de confirmation/récupération différés par le propriétaire.
- Secret opérateur de purge CDN absent ; recette de purge toujours ouverte. Les workers opérateur (notifications, expiration, exports, rétention) ne sont pas configurés sur l'hôte et leur exploitation effective, comme la restauration d'une sauvegarde, reste à valider avec les accès correspondants. Ne pas confondre scripts livrés et tâches actives.
- Plans et mesures des vrais parkings non fournis ; les annonces sans 3D fonctionnent, les images de démonstration ne sont pas présentées comme des plans réels.
- `GP_PUBLIC_LAUNCH=false` conserve le site hors indexation ; ce réglage ne constitue pas une restriction d'accès au site HTTPS.
- Forfaits et paiement restent en phase ultérieure. Google et Apple : intégration préparée, activation et parcours réel différés faute de comptes/configuration fournisseurs.

Ces limites empêchent d'affirmer une ouverture commerciale intégralement validée. Elles n'annulent pas les corrections fonctionnelles vérifiées dans cette livraison.

## Dernière passe UX

À la demande du propriétaire, la préparation OAuth est mise de côté. Deux défauts d’utilisation ont été corrigés ensuite :

- Une panne pendant le chargement de la page suivante ne retire plus les annonces déjà chargées, la sélection ni leurs repères. L’erreur et le bouton de relance restent près des résultats.
- Une photo préchargée en échec ne conserve plus la précédente sous le nouveau compteur. Le bouton « Réessayer cette photo » ne recharge que ce cliché ; les images voisines déjà décodées restent en mémoire, et les callbacks d’une tentative antérieure sont ignorés.

Quatre tests ciblés de panne/reprise réussis, TypeScript et format validés. La recette en ligne est consignée après déploiement.

## Base de données et contrôle indépendant

La migration additive de pagination a été publiée dans `a7a4a05`. Les six contrôles GitHub (application, PostgreSQL et rendu raster, push et PR) ont réussi. La recette PostgreSQL utilise 135 comptes synthétiques dans une base jetable. Elle a ensuite été appliquée au projet Supabase de production : lecture admin bornée réussie, refus non-admin, exécution anonyme interdite, aucun email/mot de passe exposé et catalogue toujours à quatre annonces. Aucun compte ni annonce réelle n’a été modifié.

Les advisors après migration gardent les 31 tables privées sans politique de lecture directe, les cinq RPC publics et l’avertissement de protection des mots de passe compromis préexistants. Le seul nouvel avertissement concerne le RPC administratif exécutable par `authenticated` ; sa garde `gp_admin_allowed()` a été vérifiée. Voir [droits des fonctions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) et [protection des mots de passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Aucun bilan « zéro avertissement » n’est revendiqué.

## Google et Apple

Code préparé et testé isolément, fournisseurs non activés. Le [guide de configuration](../../OAUTH_SETUP.md) distingue les deux callbacks et la recette restante. L’accès par email ne dépend pas de ces fournisseurs. Les comptes exclusivement sociaux devront disposer d’une réauthentification adaptée pour les opérations sensibles avant leur ouverture commerciale complète.

## Livraison et vérification en ligne — 25 octobre 2026

- Application poussée sur GitHub : `84a6246a75eaf0d3501ec2adf0a5c5db1c583589`.
- [CI application](https://github.com/veloci11/Parking-Site/actions/runs/40167508372), [SQL](https://github.com/veloci11/Parking-Site/actions/runs/40167508394) et [raster](https://github.com/veloci11/Parking-Site/actions/runs/40167508288) réussies sur ce SHA ; les trois contrôles du push sont également verts. La CI exécute format, TypeScript, suite métier, build et recette HTTP isolée.
- Compilation Linux réussie : `flE3vcutQb7xkl0d8j_Sg`. Release `20261025-84a6246-listing-details`, bascule atomique du seul service `gp-park.service`, actif et `/api/ready` prêt en mode Supabase.
- **16 contrôles live réussis** : quatre annonces réelles, prix conservés, filtres charges/taxe, refus des entrées invalides, administration privée, trois icônes et sept photos. Voir `live-http-checks.json`.
- Contrôle mobile et panne photo exécutés sur `ce77fe0` ; les composants concernés sont inchangés dans `84a6246`. Mobile live 390 × 844 : aucun débordement horizontal ni scroll global de la carte ; panneau dans le viewport, prix/favori/lien d’annonce en pied accessibles. Capture `live-mobile-390.png`.
- Panne d’un cliché simulée uniquement dans l’onglet de QA : l’état indisponible remplace bien l’ancienne image. Après déblocage, le retry produit **une seule requête média, celle du cliché concerné**, puis la photo s’affiche. Blocage et réglage de cache du navigateur restaurés. Voir `live-mobile-checks.json` et `live-photo-failure-390.png`.
- Google/Apple restent masqués et inactifs (`providers: []`), chantier différé à la demande du propriétaire. Les prérequis d’ouverture commerciale mentionnés plus haut restent distincts de cette livraison.

## Fiche complète : dernière finition

La description du propriétaire apparaît en premier. Les rubriques sans information utile et les accordéons de photos vides disparaissent ; les notes connues restent visibles. Les montants à 0 €, les équipements explicitement absents et les informations individuelles utiles sont conservés, même sans photo par place. Les prix, le contact et les données source restent inchangés.

Cinq tests ciblés ont réussi, ainsi que TypeScript, le format et les six contrôles CI sur `84a6246`. Après déploiement, les 16 contrôles HTTP ont été rejoués et la fiche publique a été inspectée en 390 × 844 : description avant les détails, note « Résidence récente » conservée, aucune mention de photo individuelle absente ni débordement horizontal. Voir `live-detail-checks.json` et `live-detail-390.png`.

Les serveurs de recette locaux sont arrêtés. L’onglet de contrôle a été fermé après restauration de ses réglages de test.
