# Point de reprise — pause demandée le 21 octobre 2026

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
