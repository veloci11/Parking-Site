# Comptes, demandes 3D et affichage public — 29 octobre 2026

## Changements

- Tableau de bord vendeur : annonces et conversations se chargent indépendamment. Une panne partielle garde les annonces accessibles, distingue un compteur inconnu d’un zéro et propose une reprise.
- Mes annonces : une seule action de statut à la fois ; réponse confirmée intégrée sans remonter toute la liste ni effacer les demandes 3D non envoyées d’une autre ligne. Une réponse incertaine impose une relecture avant une nouvelle action. Miniatures servies à la taille utile via SafePhoto.
- Notifications : une lecture échouée n’affiche plus « aucune notification ». Reprise disponible, lectures et écritures coordonnées, marquage désactivé après une réponse incertaine jusqu’à actualisation. La préférence email ne présente pas une valeur supposée lorsque sa lecture a échoué.
- Demandes 3D administrateur : filtre par statut, protection des décisions pendant les écritures, confirmation de la bonne demande/version, reprise de la page qui a échoué et retour au dossier après actualisation. Focus et fermeture du dossier adaptés au clavier/mobile ; bouton Fermer conservé sur une ligne.
- Studio 3D : les liens depuis une annonce ou une demande administrative présélectionnent le parking concerné. Paramètre UUID unique validé ; appartenance au compte vérifiée côté vendeur, accès serveur existants conservés. Aucune création ni publication automatique.
- Annonces publiques : rafraîchissements de disponibilité regroupés, annulés à la navigation et limités à 15 secondes. Une ancienne réponse ne peut plus remplacer la nouvelle annonce.
- Vue de parking : échec de chargement 3D distingué d’un plan absent avec Réessayer ; le compteur et la navigation photo restent bornés lorsque la liste des photos change.

## Vérification consolidée

- `npm test` : **349 tests, 346 réussis, 3 conditionnels ignorés, zéro échec**.
- TypeScript, format Prettier, `git diff --check` et build de production réussis.
- Parcours HTTP sur `next start` : **169 contrôles réussis** dans une base locale jetable. Voir [rapport](../listing-journey-http.json).
- Navigateur local à 390 × 844 CSS px, capture Retina : notifications en panne sans faux état vide, reprise de lecture, échec d’écriture et relecture de préférence ; marquage lu après reprise. Blocages réseau exclusivement dans l’onglet de QA.
- Administrateur fictif : filtre 3D, décision interrompue, relecture puis enregistrement « En préparation », retrait du dossier du filtre « Demande envoyée », ouverture directe du bon parking dans le studio. [Capture mobile](admin-3d-mobile.png).
- Vendeur fictif : conversations bloquées et six annonces toujours visibles ; reprise réseau ; texte non envoyé d’une demande 3D conservé après confirmation de disponibilité d’une autre annonce ; aucun débordement horizontal à 390 px ; lien « Ajouter un plan » ouvrant la bonne annonce. [Capture studio](studio-mobile.png).
- Les tests de helpers couvrent également annulation, délai, réponses HTTP 404/502/invalides, navigation photo, décisions concurrentes et sélection atomique du studio. Ce sont des preuves techniques ; aucun test sur téléphone physique n’est revendiqué.
- Serveurs locaux arrêtés, fixtures locales supprimées, blocages et dimensions du navigateur restaurés et onglet de QA fermé. Aucun email, message ni donnée de test transmis à la production.

## Livraison

Commit applicatif : `17542e3`, poussé sur `codex/build-parking-platform`. Six contrôles GitHub réussis, application/PostgreSQL/raster sur push et PR : [application](https://github.com/veloci11/Parking-Site/actions/runs/40932453026), [SQL](https://github.com/veloci11/Parking-Site/actions/runs/40932452903), [raster](https://github.com/veloci11/Parking-Site/actions/runs/40932452887). Voir [résultat des checks](github-checks.json).

**Ces changements ne sont pas encore déployés.** Le transfert SCP vers Ubuntu a échoué avant la préparation de la nouvelle release : Tailscale est hors connexion, avec une erreur de confiance du certificat du control plane et un diagnostic de filtrage Fortinet sur le réseau courant. Aucune protection TLS n’a été désactivée. Le propriétaire a été invité à reconnecter Tailscale depuis un réseau fiable.

La release existante `20261027-5206c50-admin` a été confirmée au début de la passe ; son service utilisateur était actif. Après le blocage SSH, le domaine HTTPS répond toujours `200` et `/api/ready` annonce Supabase prêt. Les contrôles publics de cette release existante sont enregistrés séparément dans [existing-live-http.json](existing-live-http.json) ; ils ne constituent pas une validation en ligne des nouveaux composants. Aucune bascule de symlink ni aucun redémarrage distant n’a eu lieu.

Reprise : transférer l’archive du commit `17542e3`, compiler dans une nouvelle release Ubuntu avec le runtime et l’environnement existants, vérifier les six checks GitHub, basculer atomiquement `current`, redémarrer uniquement `systemctl --user restart gp-park.service`, puis contrôler l’état prêt, les quatre annonces, leurs prix et leurs sept photos. Conserver l’ancienne release pour retour arrière.

## Limites conservées

Aucune migration, dépendance, règle d’authentification ou donnée réelle modifiée. Les quatre annonces réelles et leurs prix restent la référence ; aucun plan intérieur réel n’a été inventé.

Les éléments reportés par le propriétaire restent à finaliser : identité légale de l’exploitant en création, SMTP et réception réelle, accès opérateur de purge CDN, opérations workers/restauration de sauvegarde et relevés réels des parkings. Google/Apple et les abonnements restent hors de cette passe.

Amélioration secondaire encore possible : après une erreur sur un dossier 3D ouvert au-delà de la première page, sa relecture recharge actuellement la première page de la file ; il peut être nécessaire de refaire « Afficher plus ». Les écritures restent protégées par version et aucune décision n’est répétée automatiquement.
