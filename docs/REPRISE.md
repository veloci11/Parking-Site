# Point de reprise

## Revue du 24 octobre 2026

Lire d'abord [la livraison de finition](qa/production-readiness-2026-10-24/RELEASE.md), [la revue critique](qa/PRODUCTION_REVIEW_2026-10-24.md) et [la recette mobile](qa/readiness-2026-10-24/MOBILE.md). Ces rapports priment sur les états historiques ci-dessous. Le catalogue contient désormais quatre annonces réelles ; les démonstrations publiques sont désactivées. L'entreprise est en création : ses mentions sont différées par le propriétaire, comme le SMTP et le secret opérateur CDN. Ne pas réactiver la MFA administrative supplémentaire retirée à sa demande. Vérifier le SHA et la release indiqués dans le rapport courant avant de reprendre une procédure.

## Dernière demande — exemples au Raincy et carte simplifiée

**Déployé : https://parking.gilmathis.com/?display=map.** Source `9a498e3`, build Linux `E1OzrGT41kcvBM8Nte0oM`, release `20261022-9a498e3-showcase`. Deux exemples en lecture seule au 16–18 allée Victor Hugo, Le Raincy ; aucune fausse annonce ni identité ajoutée dans Supabase. Backend local/personnages toujours désactivés. Lire `PUBLIC_SHOWCASE.md` et `qa/PUBLIC_SHOWCASE_2026-10-22.md`.

Me localiser et Voir les annonces retirés. Recherche de zone dans une barre fixe, groupes d’annonces et sélection dans le panneau de gauche, Retour à la liste. Mobile : aperçu sous la carte, en flux normal. Aucun inspector, choix de groupe, message d’aide ou bouton Comparer flottant sur la carte. Recette desktop/mobile sans chevauchement ni débordement horizontal ; 27 contrôles HTTPS, 687 fichiers source identiques, six CI de la source réussies. 237 tests : 234 réussis, 0 échec, 3 conditionnels ignorés. Aucun email/message envoyé, aucun compte créé. État historique ci-dessous à lire selon sa date.

## Déploiement demandé — Ubuntu et domaine définitif

**Site désormais hébergé : https://parking.gilmathis.com.** Lire `qa/UBUNTU_DEPLOYMENT_2026-10-22.md` et `../deploy/ubuntu/README.md` avant les états historiques locaux ci-dessous. Source app1fdf563, build final Linux `kEIJcoXo8PKR1eZavY5Sr`, service utilisateur `gp-park` actif/activé, port loopback3010, route Cloudflare dédiée. L’ancien nom parkin a été retiré du DNS, tunnel, HTTPS et Auth ; ne pas le recréer.

Site connecté Supabase, démo désactivée et catalogue réel vide. 17 contrôles HTTPS publics passent ; carte Paris vue dans le navigateur. Site URL/callback corrigés ; absence d’email réel et de compte humain toujours explicite. `GP_PUBLIC_LAUNCH=false` garde le noindex. Secrets serveur privés, aucun service-role dans l’app. Localhost Mac arrêté. Les prérequis métier/humains, forfaitsV2 et purge CDN différée restent séparés du déploiement effectué.

## Dernière demande — boutons simplifiés

Voir `qa/ARROW_CLEANUP_2026-10-22.md` : flèches décoratives retirées, Retour à l’exploration remplacé par Retour, retour mobile de messagerie lisible. Deux relectures indépendantes ; build `thIGxvEcDWfeuxmyWSI0u` et format réussis ; fiche desktop et connexion mobile vérifiées. Aucun test métier supplémentaire requis pour ces icônes/libellés. Serveur et onglets temporaires fermés, runtime nettoyé. Le zoom 200 % et le lecteur d’écran restent non validés ; ne pas poursuivre une refonte non demandée pour cette finition bornée à cinq minutes.

## Dernier complément — retour après pagination et réseau

Lire `qa/CLOSURE_ACCESS_2026-10-22.md` avant les résultats historiques ci-dessous. Un écart F09 a été corrigé : retour à une annonce au-delà de la première page, avec restauration des résultats frais, du tri, de la sélection et du défilement en Liste et Carte. Échap et fermeture des filtres restituent le focus ; erreurs réseau en français et compteur cohérent ; aide de la carte masquée quand le fournisseur est indisponible.

Build `C5S5S_JI7BzEPLunNgjBe` réussi ; **233 tests, 230 réussis, 0 échec, 3 conditionnels ignorés**, format réussi. Contre-recette navigateur sur 38 résultats parisiens, annonce 30, filtres et pannes/reprise réussie. Aucune nouvelle mutation Supabase. Aucun serveur de cette tâche sur 3000/3001/3002 ; runtime jetable et onglet supprimés. Vérifier la CI du dernier SHA, sans reprendre les anciens checks. Zoom navigateur 200 % et lecteur d’écran réel restent non validés ; les prérequis humains et la purge CDN différée restent ouverts.

## Passe actuelle — parcours acheteur, vendeur et administrateur

La passe terminée est documentée dans `qa/UX_FINISH_2026-10-22.md`. Elle corrige les constats de la revue ergonomique précédente : entrée anonyme courte, validation par étape visible, sélection d’adresse explicite, choix Liste/Carte sur ordinateur et mobile, favoris et messages robustes, contexte de la place dans le contact, retour administratif fondé sur le statut réel et rattachement conservé après actualisation. Les captures fraîches sont dans `qa/ux-finish/`. Les décomptes et statuts de cette passe doivent être lus dans ce rapport, et non dans les résultats historiques ci-dessous.

Le parcours navigateur a été exercé avec un vendeur, un administrateur et un acheteur fictifs : deux places 18/19, vente 18 500 € et location 200 €/mois, trois photos synthétiques, soumission, refus de publication sans rattachement, création du registre puis publication, favori, contact portant sur la place 19, réponse vendeur et visite « à organiser ». Les exemples sans 3D restent utilisables ; l’annonce à deux niveaux conserve ses rendus approuvés.

**Aucune nouvelle mutation Supabase dans cette passe.** La clé opérateur CDN reste différée par le propriétaire ; ne pas la redemander ni lancer de fixtures distantes pour cette finition. Les vrais plans/photos/mesures, premier compte humain/MFA, email reçu, identité opérateur et exploitation réelle restent à valider avant ouverture publique. Forfaits/paiements en V2. Conserver le seuil d’arrêt utilisateur à 7 % restant ; les relevés de quota ci-dessous sont historiques.

Recette finale : **228 tests, 225 réussis, 0 échec, 3 conditionnels ignorés** ; parcours HTTP local **168/168** ; build final `A8gkDChNyNBp0fVQmdnHP`. Favoris vente/location et positions cartographiques contrôlés après correction. Runtime jetable supprimé, onglet fermé, ports de cette tâche 3000/3001/3002 fermés. Le port 8768 héberge un autre projet et reste intact. Lire les checks GitHub sur le dernier SHA ; ne pas réutiliser ceux cités dans les archives ci-dessous.

## État antérieur conservé — avant cette passe

**Dernière reprise après confirmation Pro.** Les 15 missions sont terminées et leurs contre-vérifications sont consignées dans `QA_TEAM_15.md`. Code courant `ff17e1f`, branche `codex/build-parking-platform`, [PR1 en brouillon](https://github.com/veloci11/Parking-Site/pull/1). Aucun déploiement public ni compte humain créé. Le bilan courant ci-dessous prévaut sur l’archive du21octobre.

## Revue ergonomique suivante

La question du propriétaire « tout est fini, cohérent et intuitif ? » a donné lieu à une revue IAB fraîche : `qa/UX_REVIEW_2026-10-22.md`. **Ne pas présenter le CDN comme le seul reste.** Erreurs de l’étape1 hors écran et résumé incluant les étapes futures ; état sans résultat avec conseil de carte incohérent et réinitialisation sans effet visible ; entrée anonyme trop dense. Le dépôt mixte et le niveau−2 ont été observés correctement. Aucun code produit corrigé dans cette revue ; source inchangée, runtime jetable retiré. Ces constats priment sur toute formulation antérieure « dernier point CDN ».

## Résultat actuel

- Build final `pcMqwObi9XdoC2NB2C0vG` réussi ; typage et format réussis. **194 tests :191 réussis,0échec,3ignorés**. Deux recettes HTTP sont conditionnelles ; le parcours complet176 est exercé séparément. Le raster Docker réel est vérifié dans la CI dédiée, pas sur le daemon local indisponible.
- **Carte à la demande corrigée et contre-vérifiée dans le navigateur.** Ancien build mobile : carte masquée montée et requêtes OpenFreeMap. Nouveau build à390px, liste stabilisée :0canvas et0requête de style/worker avant Carte. Au clic : carte chargée. Liste↔Carte conserve le même canvas, sans nouvelle requête de style. Desktop automatique à1440px. Voir `qa/map-demand-browser.json` ; ce n’est pas un benchmark Web Vitals.
- Boutons « Me localiser » et « Rechercher dans cette zone » séparés sur petit écran et tablette. Chevauchement reproduit à768px puis absence mesurée à390/768/1024/1440px, aucun débordement du document. Capture finale11 ; la09 montre l’ancien chevauchement, pas le correctif final.
- **176 contrôles HTTP en production locale**, dépôt mobile complet et contre-vérifications UI ciblées. `design-qa.md` est passed dans son périmètre visuel explicite ; logo, couleurs, police et rendus approuvés sont conservés. Comparaisons et captures dans `qa/resume-captures/`.
- **224/225 contrôles Supabase réels**, véritables TOTP admin/modérateur. Conversations et demandes privées de modélisation restent accessibles aux bons utilisateurs après retrait. Un contrôle échoue : réponse CDN antérieure encore lisible alors que l’origine fraîche et la route applicative refusent. La sonde neuve31/32 confirme que cache0 ne clôt pas ce défaut.
- **Pro confirmé par le propriétaire**, capacité de purge réelle non encore exercée. `.data/media-operator.env` préparé privé0600, ignoré Git ; clé encore vide lors du dernier contrôle local. Ne jamais afficher la clé. `OPS_MEDIA_CACHE.md` et `OPS_STORAGE_CDN_LIVE_QA.md` décrivent la procédure et la campagne bornée à une annonce/trois photos. Aucun nouveau compte, média ou appel de purge distant créé pour cette préparation.
- Migrations **001–034 appliquées** ; recettes032/033/034 réelles intégralement réussies en rollback. Toutes les six vérifications GitHub du commit4b3729e sont réussies, y compris SQL/PostGIS et raster isolé. Un nouveau commit exige ses propres vérifications CI.
- Outil photo opérateur livré,6tests synthétiques : source intacte, masques opaques, trace privée et revue séparée avant téléversement. Le wizard ne vérifie pas un reçu opérateur ; aucune revue humaine réelle n’est affirmée.
- Inventaire Supabase final14:36UTC conservé :0Auth/facteur/annonce/publication/média/Storage/site/demande3D/politique/job ; MFA configurée true et1réservation humaine intacte. Aucune mutation Supabase depuis cet inventaire durant la correction carte.
- Runtimes SQLite de carte retirés, serveurs de cette tâche fermés et onglets temporaires fermés, viewport restauré. Fichier opérateur privé conservé pour la saisie humaine.

## Continuer ici

1. Lire `qa/resume-delivery.json`, `qa/map-demand-browser.json` et les rapports courants. Les campagnes historiques221/1,31/1 et224/1 restent distinctes ; ne pas reprendre des identifiants supprimés.
2. Vérifier le dernier SHA et sa CI ; ne pas réexécuter toutes les recettes vertes pour ce seul point CDN. Aucun domaine public ou déploiement demandé.
3. Attendre la saisie de la secret key locale. Le connecteur ne fournit que des clés publiques. Exécuter la validation locale `--check-operator-config` de `OPS_STORAGE_CDN_LIVE_QA.md` avant toute fixture. Aucun repli vers mot de passe DB, ancienne clé publique ou affaiblissement RLS.
4. Après configuration, une nouvelle campagne synthétique distincte peut vérifier la purge exacte, le même JWT/URL pendant≤60s et l’origine ; nettoyer SDKStorage avant Auth selon le manifeste. Un acquittement prouve seulement la mise en file ; aucune révocation mondiale ni des copies navigateur déjà enregistrées n’est promise.
5. Arrêt utilisateur à **7% de quota restant**. Dernier relevé :10%, sans réinitialisation consommée. Ne pas annoncer le seuil atteint ou l’objectif complet sans preuve.
6. Vrais plans/photos/mesures et pilote, premier compte humain/MFA, email reçu, identité opérateur, hébergement/ordonnancement/sauvegarde/restauration restent des prérequis humains d’ouverture. Forfaits/paiements enV2. Préserver les rendus approuvés.

## Archive — pause demandée le 21 octobre 2026

Le propriétaire a demandé de préparer la coupure et de pousser le travail sur GitHub. Le site n’est pas déployé publiquement. Branche de travail : `codex/build-parking-platform`, PR existante : https://github.com/veloci11/Parking-Site/pull/1.

## Travail sauvegardé

- Vue fixe du parking rendue avec Blender, places cliquables projetées depuis la même caméra, surlignage et masques d’occlusion, niveaux −1/−2 animés. La qualité actuelle a été approuvée par le propriétaire ; conserver les visuels. Les véhicules plus ordinaires et le test sur un vrai parking sont pour plus tard.
- Sélection d’une place sans navigation ni remontage du rendu. Un autre lot du même parking affiche son propre prix et un lien explicite vers son annonce, sans envoyer de message au mauvais vendeur.
- Lots nommés « Lot à vendre » et « Lot à louer », numéros de places réels saisis au dépôt, aucune numérotation inventée. Onglet Carte après Photos.
- Une annonce peut réunir plusieurs places avec offre, prix et disponibilité individuels, par exemple trois ventes et deux locations mensuelles. Les filtres et tris portent sur la même place disponible. L’ancien prix global du lot reste compatible.
- Dépôt simplifié en trois étapes ; options avancées repliées, photos et description regroupées. Recherche d’adresse IGN/BAN ou commune, sans latitude/longitude ; secteur approximatif par défaut et adresse précise sur choix explicite.
- Périmètre limité à Paris et l’Île-de-France, exemples de démonstration déplacés à Paris/Boulogne/Montreuil/Versailles/Saint-Denis/Créteil.
- Demande facultative de modélisation 3D manuelle depuis le dépôt et Mes annonces. Note privée et suivi propriétaire ; file administrateur avec statuts. Aucun automatisme de génération, facturation, email ou publication d’un plan.
- Réservation privée du premier administrateur pour l’email fourni dans la conversation. Aucun compte humain créé ; inscription normale, confirmation de cet email puis MFA nécessaires. Ne pas ajouter l’email réel ni un mot de passe au dépôt Git.

## Vérifications acquises

- Build de production réussi, y compris après la dernière correction CSS mobile ; format Prettier valide. Journaux locaux ignorés : `.data/final-build.log`, `.data/final-format.log`.
- Suite Node : 136 tests, 133 réussis, 0 échec, 3 ignorés. Deux anciennes recettes HTTP opt-in n’avaient pas leurs identifiants de fixture ; la recette HTTP complète distincte ci-dessous couvre le nouveau parcours. Le test Docker de rasterisation n’a pas été rejoué, car le daemon était indisponible ; le worker n’a pas changé.
- Recette HTTP du build de production local : **176/176**, dont dépôt de cinq offres mixtes, photos privées, modération, rôles, demandes 3D, statuts par place, révision, retrait final et maintien de la conversation. Voir `docs/qa/listing-journey-http.json`. Il s’agit de SQLite isolé, pas d’un parcours Auth/Storage connecté.
- Dépôt dans IAB : cinq places18–22, trois images synthétiques téléversées par le vrai sélecteur, aperçu puis envoi en modération. Voir `docs/qa/listing-journey-ui.json` et captures04–06 ; cette preuve concerne le serveur de développement.
- IAB sur le build de production : demande3D créée, statut « En préparation » enregistré par l’administrateur puis visible chez le propriétaire ; sélection12↔13 sans remontage de l’image, niveau−2/place24, carteParis, offre réservée19 avec visite désactivée. Captures07–13.
- Mobile390×844 : parking lisible sans débordement du document (capture11), tableau de dimensions défilant horizontalement avec titre lisible après stabilisation du viewport (capture15). La capture13 prise pendant le changement de dimensions est transitoire et ne constitue pas une preuve de lisibilité complète.
- Migrations Supabase001–031 appliquées au projet `srrmysturoloovpuuojp`. Recettes réelles028/029/030/031 et régressions historiques détaillées dans `docs/qa/` ; chaque recette utilise une transaction annulée. La recette confidentialité021 corrigée a réussi après031 (`export_private_worker_only=1`).
- Inventaire Supabase final avant pause : 0 compte Auth, 0 annonce, 0 demande3D, 0 objet Storage, 1 réservation administrateur non réclamée, 31 migrations. Aucune donnée fictive persistante n’y est laissée.
- Le cluster PostgreSQL isolé55429 a été arrêté. Aucun serveur de cette tâche n’écoute sur3000/3001/3002/8768 à la coupure. Les onglets IAB temporaires ont disparu ; le contrôle des anciens onglets QA Chrome était indisponible.

## Reprendre ici

1. Vérifier `git status`, le dernier commit poussé et les résultats CI de la PR1. Ne pas recréer de PR ni de migration déjà appliquée.
2. **Premier contrôle restant : revoir le dépôt à390px après la dernière correction CSS** dans `src/styles/wizard-simplified.css` (`minmax(0,1fr)` pour la colonne mobile et `min-width:0` pour la navigation des étapes). Le build et le format passent, mais la coupure intervient avant la nouvelle observation navigateur. La capture14 illustre le défaut avant correction, pas l’état final.
3. Terminer `design-qa.md` avec comparaison visuelle référence/rendu et captures actuelles. Ne pas annoncer une recette visuelle finale déjà terminée. La qualité des rendus est approuvée ; ne pas les régénérer spontanément.
4. Les fixtures HTTP ont été retirées ; leur nettoyage et sa preuve sont consignés par `scripts/verify-listing-journey.ts --cleanup` dans le rapport courant. Pour une nouvelle recette, utiliser `--prepare` puis la procédure de `docs/qa/listing-journey.md`, avec une nouvelle base isolée. Ne jamais exposer les fichiers privés `.data/` ni lancer deux builds/dev dans le même checkout.
5. Si une démonstration est demandée, lancer le build local en mode démo, distinct de Supabase connecté. Fermer à nouveau localhost après les essais, conformément à la préférence du propriétaire.
6. La validation du compte humain administrateur, du parcours connecté complet, de l’envoi d’emails et d’un vrai parking reste séparée. Les vrais plans/photos/dimensions seront fournis plus tard. Les forfaits et paiements sont enV2. Aucun lancement public n’a été demandé ici.

## Repères

- Contrats : `docs/OPS_UNIT_OFFERS.md`, `OPS_PER_SPACE_OFFERS.md`, `OPS_MANUAL_MODELING_REQUESTS.md`, `OPS_PARKING_RENDER.md`, `OPS_REGION_IDF.md`, `OPS_ADMIN_BOOTSTRAP.md`.
- État détaillé et limites historiques : `docs/COMPLETION_MATRIX.md`.
- Rendus reproductibles : `scripts/render-parking/`, `node scripts/render-parking/verify.mjs`. Les intermédiaires Blender restent ignorés dans `.data/render-parking/`.
- Logo validé : `public/brand/gp-logo.png` ; conserver le Gdoré initial et le Pviolet.

Ce document est un point de reprise, pas une déclaration de mise en production ni d’achèvement de tous les jalons du plan.
