# Recette du dépôt d’annonce et de l’administration

**État actuel : 176 contrôles HTTP réussis sur le build de production local, dont 35 pour la demande manuelle de modélisation. L’annonce de recette a été retirée ; ses photos sont privées et sa conversation est conservée. Les contrôles IAB de production passent pour le suivi 3D, le viewer, la carte et le contact d’une place réservée. Le nettoyage final attend l’arrêt du serveur. Le dépôt complet en navigateur a été validé en développement ; ces preuves restent distinctes.**

Cette recette utilise uniquement une base SQLite jetable, les rôles de démonstration et des identités `@test.invalid`. Les trois images de parking sont synthétiques et portent la mention « RECETTE FICTIVE ». Aucun email externe ni compte Supabase n’est créé. Les rapports HTTP et navigateur constituent deux preuves distinctes. La base de développement, ses médias et son runtime privé ont été supprimés après vérification de la fermeture des ports 3000 et 3002 ; une nouvelle base isolée est utilisée par le build de production local. Le rapport de développement archivé conserve ses 141 contrôles réussis, retrait et nettoyage compris.

## Formulaire simplifié

1. Localisation et places : recherche d’une adresse, d’une commune ou d’un code postal ; secteur approximatif par défaut, sans saisir de coordonnées et sans exiger d’adresse exacte. Chaque place commence par son numéro peint, facultatif s’il est inconnu, puis son offre vente/location, son prix et sa disponibilité. Le rang « Emplacement 1 » ne devient pas automatiquement un numéro de place ; les doublons non vides au même niveau empêchent de continuer. Dimensions, état, références et charges sont des options facultatives. Une option secondaire conserve le prix global des anciennes offres en lot, sans prorata automatique.
2. Photos et description : titre, texte et trois photos générales au minimum ; les galeries propres à chaque unité restent distinctes. Les photos par place, légendes et dates sont repliées. La demande facultative de modélisation 3D est traitée manuellement et son suivi reste indépendant du dépôt.
3. Vérifier et envoyer : aperçu assaini de la version sauvegardée, offres et prix par place, attestation puis soumission à la modération.

Le bouton de la première étape enregistre d’abord la localisation sélectionnée, puis sa confirmation après le succès de cet enregistrement. Un enregistrement refusé laisse l’utilisateur sur son étape. Le changement de vente à location d’une place demande de saisir son nouveau montant ; le prix de vente ne devient pas un loyer automatiquement.

## Préparation et exécution HTTP

`npx tsx scripts/verify-listing-journey.ts --prepare` crée une base privée, trois PNG et le runtime `.data/listing-journey-current.json` (mode 0600). La commande affiche les chemins utiles, jamais les mots de passe. Elle ne lance aucun serveur. `GP_JOURNEY_PORT` permet au coordinateur de choisir le port local avant la préparation.

Le coordinateur démarre ensuite le serveur avec les variables `environment` du runtime et le port correspondant. Pour une recette navigateur, les PNG du sous-dossier `photos/` sont de véritables entrées à téléverser dans le formulaire.

`npx tsx scripts/verify-listing-journey.ts --run` utilise les routes HTTP existantes du serveur déjà démarré. Un compte garde privé vérifie l’identité de la base avant toute création. Le rapport assaini est écrit dans `docs/qa/listing-journey-http.json`. L’inventaire privé reste dans le dossier jetable. Avec `--run --keep-published`, le cas est conservé pour inspection du catalogue et des interfaces ; le rapport indique explicitement que le retrait final est différé. `--withdraw` termine ensuite ce retrait et vérifie la confidentialité des photos ainsi que la conservation de la conversation. Aucun statut de recette complète n’est annoncé avant cette dernière étape.

Après fermeture des serveurs de recette, `npx tsx scripts/verify-listing-journey.ts --cleanup` supprime exclusivement ce dossier et son runtime. La commande refuse de nettoyer si les ports de recette 3000 ou 3002 répondent encore. Le rapport HTTP conserve la preuve du nettoyage.

## Parcours couvert par le scénario HTTP

- Inscription ordinaire vendeur/acheteur/tiers, versions des conditions, confirmation via la boîte locale et absence de droits administrateur pour les membres.
- Une seule annonce de cinq places : trois ventes à des prix différents et deux locations mensuelles à des loyers différents. Les prix à zéro sont acceptés dans le brouillon, avant renseignement des offres.
- Recherche de Paris 75012 par l’autocomplétion et sélection d’un secteur sans adresse exacte persistée ; aperçu public puis confirmation et attestation.
- Trois fichiers PNG réels téléversés par la route de l’application ; refus d’une soumission avec deux photos, sans inventer d’état « prêt » ni de modèle 3D.
- Le scénario a été étendu à la demande manuelle de modélisation : confidentialité de la note, réessai idempotent, suivi propriétaire, file et statuts réservés à l’administrateur, conflit de version et indépendance du statut « prêt » vis-à-vis de la publication et des plans. Ces contrôles passent sur le build de production local ; le statut « prêt » laisse l’annonce en attente et sans scène jusqu’à sa décision de publication ordinaire.
- Rôle réellement `admin`, registre physique de cinq places fictives, version de décision périmée refusée, publication puis consultation acheteur et photo WebP sans EXIF.
- Une seule annonce dans les recherches vente et location ; budgets appliqués à une offre individuelle cohérente, sans additionner prix de vente et loyers.
- Contact/message privés, refus d’accès du tiers, révision de prix conservant l’ancienne version publique, refus motivé puis nouvelle soumission approuvée.
- Révision de disponibilités individuelles : disponible, réservée, vendue, louée. L’annonce reste publique pour les places encore disponibles ; les autres ne participent plus aux budgets de recherche.
- Administrateur déposant sa propre location en lot, avec ses trois photos, via les routes ordinaires ; refus par le modérateur pour conserver la compatibilité historique.
- Retrait complet final, photos devenues privées et conversation historique conservée.

La MFA du mode local est explicitement indisponible : le scénario vérifie ce contrat et ne revendique aucune session AAL2. La MFA réelle du backend connecté relève des rapports connectés antérieurs, avec une identité et une exécution séparées.

## Preuves navigateur

L’ancien parcours a confirmé l’inscription, la vérification d’email locale, la sauvegarde du brouillon et le maintien de l’étape après une largeur négative. Le dépôt de fichiers par l’extension Chrome nécessite « Allow access to file URLs ». Le sélecteur natif a été interrompu par une autre tâche Chrome ; aucun fichier étranger n’a été téléversé et aucun réglage n’a été modifié.

Le nouveau formulaire a confirmé ses trois étapes, l’autocomplétion Paris 75012, les cinq offres mixtes, la confirmation du secteur et les conversions lot/prix par place réellement enregistrées. Dans le navigateur intégré du coordinateur, le dépôt 9e430… a ensuite reçu les numéros 18 à 22, les trois PNG synthétiques, un titre et une description de 260 caractères. L’aperçu a affiché les cinq offres exactes ; l’attestation puis la soumission ont abouti à la confirmation de transmission à la modération (capture 05). Cela ne prouve pas encore sa publication. Un autre brouillon Chrome a confirmé le blocage de deux numéros 18 au même niveau, puis le passage aux photos après correction. La saisie d’adresse et le téléversement dans l’interface sont à distinguer des appels HTTP. Les captures demandées à 1440×1000 et 390×844 doivent également conserver leurs dimensions réellement observées ; une première tentative de redimensionnement n’a pas donné les dimensions CSS demandées et n’est pas une preuve responsive exacte.


## Contrôles navigateur sur production locale

Le coordinateur a envoyé une demande manuelle de 3D sur un box de démonstration, l’a passée à « En préparation » avec le rôle administrateur, puis a retrouvé ce statut chez le propriétaire (captures 07 et 08). Le changement 12 ↔ 13 conserve le même élément image et la route de l’annonce7 ; le niveau−2 sélectionne24. L’onglet Carte charge Paris après l’onglet Photos. Sur l’annonce de cinq offres, la place19 réservée désactive le bouton de contact (captures09,10 et12).

Les captures11 et13 mesurent390×844 pixels. Le coordinateur a vérifié à cette largeur que document.scrollWidth et document.clientWidth valent390 pour le parking et les offres. Le tableau des offres reste défilant horizontalement dans son conteneur de largeur minimale640px ; la capture13 seule ne montre pas ses prix et statuts à droite. Cela prouve l’absence de débordement du document, pas la visibilité simultanée de toutes les colonnes. Un bureau exactement1440×1000 n’est pas revendiqué par ce rapport.
