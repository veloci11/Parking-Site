# 03 — Dépôt d’annonces, données et qualité réelle

## 1. Les trois objets à ne pas confondre

- **Parking** : site ou résidence, avec ses niveaux, accès, géométrie et état des parties communes.
- **Place physique** : unité identifiée dans un niveau ; dimensions, limites, poteaux proches, numéro de marquage et éventuelle référence de lot distincte.
- **Annonce** : proposition commerciale d’un vendeur, portant sur une ou plusieurs places. Elle contient le prix total, les conditions de présentation, l’occupation et la version des informations publiées.

Exemple de démonstration : annonce A = place 12 à 18 500 € ; annonce B = places 14 et 15 vendues ensemble à 31 000 € au total. Les deux places de B peuvent être sélectionnées dans la scène, mais ouvrent la même annonce. La moyenne de 15 500 €/place n’est pas une possibilité d’achat à l’unité.

## 2. Assistant vendeur : huit étapes

| Étape | Contenu | Condition de passage |
|---|---|---|
| 1 — Votre bien | Parking couvert/extérieur, box fermé ; particulier/professionnel ; une place ou ensemble | Type et mode de vente renseignés |
| 2 — Localisation | Adresse privée, ville, code postal, position à confirmer ; précision publique | Position validée manuellement sur carte |
| 3 — Places et accès | Quantité, niveau, références, dimensions connues, fermeture, poteaux et circulation | Nombre cohérent ; inconnus déclarés |
| 4 — État réel | Grille d’état du site et des places, dates, observations, photos associées | Toutes les rubriques répondent oui/non/inconnu selon le champ |
| 5 — Photos et plans | Galerie publique ; plans et pièces sources en espace privé ; demande de vue 3D | 3 photos documentaires minimum, sauf dérogation modérateur motivée |
| 6 — Prix et occupation | Prix total de vente, conditions, libre/occupé/inconnu, charges et taxe si connues | Prix entier positif et quantité confirmés |
| 7 — Description et contact | Titre, texte descriptif, profil public, préférences de contact | Texte valide et email confirmé |
| 8 — Prévisualisation | Informations publiques exactes, mentions d’incertitude, attestation et envoi | Contrôles serveur + droit de publication |

Brouillon créé dès la première étape. Sauvegarde après une modification stabilisée, bouton Sauvegarder toujours disponible, état « Enregistrement / Enregistré / Échec, réessayer ». Empêcher qu’une réponse ancienne écrase la plus récente. Retour à une étape sans perte ; reprise après connexion. Progression indique les vrais champs manquants, pas un pourcentage de qualité commerciale.

## 3. Dictionnaire des champs commerciaux

| Champ | Type / règle | Public |
|---|---|---|
| Titre | 15–90 caractères, texte simple | Oui |
| Description | 100–5 000 caractères ; pas de HTML arbitraire | Oui |
| Type | `indoor_parking`, `outdoor_parking`, `closed_garage`, `mixed_bundle` | Oui |
| Mode | `single_space` ou `bundle` | Oui |
| Quantité | Entier 1–500 ; au-delà demande d’accompagnement | Oui |
| Prix total | Entier en centimes EUR, strictement positif, borne de validation 100 M€ ; jamais un flottant | Oui |
| Vente séparée | V1 : non dans une annonce lot ; créer des annonces séparées pour cette possibilité | Explicite |
| Adresse complète | Objet normalisé et point exact ; jamais copié dans le flux public par défaut | Privé par défaut |
| Position publique | Point distinct approuvé ; précision `area` ou `exact_opt_in` | Oui |
| Niveau | Code libre normalisé, ex. `-1`, `RDC`, extérieur | Selon granularité autorisée |
| Place / lot | Deux références distinctes, texte 1–40 caractères | Place publique facultative ; référence de lot privée par défaut |
| Surface | Par unité : décimal m² > 0 si connu et source. Lot : plage min–max par place ; total uniquement si toutes connues | Oui avec source et périmètre |
| Longueur / largeur / hauteur libre | Entiers en mm > 0 si connus ; contraintes prises au point réellement limitant | Oui avec source |
| Occupation | `vacant`, `occupied`, `unknown` ; ne pas inventer un loyer | Oui |
| Revenu locatif | Facultatif, montant et période, date et source ; sans promesse de rendement | Si choisi |
| Charges / taxe foncière | Montant annuel si connu ; quote-part ou périmètre précisé, année et source | Si choisi |
| Fermeture / accès | Portail, porte, badge, clé, ascenseur : enums et inconnu | Description ; jamais code ou secret |
| Profil annonceur | Particulier/professionnel déclaré, nom public | Oui |
| Email / téléphone de connexion | Données de compte | Privé ; contact via messagerie par défaut |

L’existence de dimensions, taxes ou loyers dans le formulaire ne transforme pas ces valeurs en données vérifiées. Pas de rentabilité calculée en V1. Aucun faux « sans charges » lorsque le vendeur n’a pas renseigné le montant.

## 4. Validation et erreurs

Toutes les validations s’exécutent côté serveur et sont partagées avec le formulaire. Un brouillon peut être incomplet ; la soumission ne le peut pas. Les zéros ne remplacent jamais les valeurs inconnues.

Contrôles croisés : single = une unité ; bundle = au moins deux ; toutes les unités vendues par le même annonceur ; monnaie EUR ; nombre d’unités cohérent avec les rattachements ; unité d’un même parking et niveau avant scène partagée. V1 : une annonce relève d’un seul parking/site, éventuellement de plusieurs niveaux de ce parking. Les ensembles multi-sites ne passent pas par le dépôt autonome V1 : plusieurs annonces adaptées ou accompagnement préalable explicite. Le schéma de dépôt ne contient donc qu’une localisation ; ne pas inventer des sites supplémentaires côté interface.

Message précis à côté du champ : « Indiquez le prix total des 3 places » ; récapitulatif d’erreur en tête avec liens ; aucune suppression d’une saisie correcte après erreur. Aucune information serveur interne exposée.

## 5. Photos

Photographies minimales recommandées : face de la place, vue latérale montrant les poteaux, circulation/manœuvre, accès au niveau, défauts éventuels. Pour un lot : couvrir chaque unité, sans réutiliser la même photo comme si elle décrivait toutes les places. Les images communes doivent porter « Accès commun » ou « Vue du parking ».

Limites V1 : 20 photos dans la galerie générale de l’annonce, jusqu’à 6 photos propres par unité et **120 photos au total par annonce**, toutes galeries confondues ; 10 Mo par fichier source, JPEG/PNG/WebP ; pas de SVG utilisateur. Validation du type réel, décodage et réencodage, retrait des métadonnées EXIF/GPS, limite de pixels 40 mégapixels. Conserver les orientations utiles. Versions préparées : vignette 480 px, liste 960 px, galerie 1 920 px, formats adaptés sans déformation. Les noms de fichiers ne révèlent ni adresse ni email.

Les photos ne doivent pas embellir l’état par génération IA. Recadrer, corriger une rotation et anonymiser sont des opérations distinctes, contrôlées et traçables. Flouter complètement les plaques et visages reconnaissables ; traitement proposé à vérifier humainement. Ne pas publier codes d’accès, badges lisibles, documents personnels ou vues de logements sans nécessité.

Les photos propres aux places sont reliées via `media_space_links` ; une photo de groupe peut couvrir plusieurs unités seulement si celles-ci sont identifiables et légendées. Galerie générale et galerie de la place ne dupliquent pas le même fichier. La couverture par unité vaut `unknown`, `common_only` ou `unit_photos`. Si le plafond de 120 ne permet pas de couvrir un grand lot, proposer un accompagnement ou présenter explicitement une couverture partielle : aucune photo propre inventée, aucun statut « état documenté » ou `reviewed` pour cette unité. Une vue commune reste étiquetée Vue du parking.

Une modération compare les photos des défauts avec la grille d’état. Un défaut visible ne peut pas disparaître du modèle 3D par un choix de matériau « neuf ».

## 6. Qualité réelle : grille structurée

| Domaine | Informations | Source / preuve |
|---|---|---|
| Sol | Béton/enrobé/résine/autre ; usure, fissures, trous, pente | Photos localisées + observation datée |
| Murs/plafond | Finitions, fissures visibles, traces, éléments bas | Photos ; ne pas conclure sur la structure |
| Humidité | Traces visibles, eau observée, déclaration d’absence ou inconnu | Date et photo ; absence de trace ≠ garantie d’absence d’infiltration |
| Éclairage | Nature, répartition, zones faibles ; fonctionnement observé | Photos représentatives et déclaration ; pas de lux inventés |
| Marquage/propreté | Marquage lisible, encombrement, entretien | Photos du jour du relevé |
| Manœuvres | Largeur allée, angle, poteaux, murs, besoin de marche arrière | Plan/mesures ; appréciation explicitement déclarée |
| Hauteur/accès | Point le plus bas, rampe, porte, pente connue | Mesures prises aux endroits limitants |
| Fermeture/sécurité | Dispositifs réellement présents ; fonctionnement observé | Déclaration/photo ; aucun « anti-effraction garanti » |
| Place | Dimensions, inclinaison, butée, voisinage, box ou place ouverte | Plan et photos propres à cette place |

Chaque observation conserve `value`, `source_kind`, `observed_at`, `observer_id`, `evidence_media_ids`, `confidence_scope` et commentaire factuel. Provenances : `seller_declared`, `photo_documented`, `measured`, `plan_derived`. Une rubrique inconnue apparaît « Non renseigné ». Distinguer l’état commun du parking et l’état spécifique de la place.

Pas de note automatique « 9/10 » en V1. La qualité est décrite de façon intelligible et comparable ; un score éventuel nécessiterait une grille, des règles et une validation séparées. Un modèle vérifié signifie uniquement que les vérifications listées ont été faites, pas que tout le bien est certifié.

## 7. Pièces et dimensions pour la 3D

Plan PDF/PNG/JPEG de chaque niveau, échelle ou au moins deux distances de référence ; hauteur libre et passages contraignants ; photos d’ensemble et par place ; identifiants des places et lots ; emplacement des murs, portes, poteaux, rampes ; droit de réutiliser ces éléments. Limite documentaire : 25 Mo par PDF, 10 documents par annonce ; fichiers privés, analysés avant consultation.

Pas de pièce d’identité ni de titre de propriété obligatoire à télécharger pour créer un compte. Une vérification documentaire supplémentaire peut être demandée par un modérateur en cas de risque précis, selon une procédure privée et une durée limitée.

## 8. Cycle de vie et changements d’un lot

Une vente du lot entier marque l’annonce vendue et met à jour les unités. Une vente partielle exige une nouvelle révision : retirer les unités concernées, confirmer nouveau prix total et quantité. Le site ne divise pas automatiquement le prix au prorata. Une unité ne peut pas appartenir simultanément à deux annonces actives du même vendeur ; une annonce concurrente d’un autre vendeur déclenche un examen sans révéler les informations privées de l’autre compte.

Pour publier une annonce similaire, créer un nouveau brouillon et reconfirmer photos, unités, prix et disponibilité. La duplication ne duplique pas les permissions sur un parking partagé.

## 9. Durée et preuve d’actualité

Règle produit proposée V1 : demander reconfirmation après 90 jours sans confirmation de disponibilité ; rappels à J−14 et J−3 ; expiration à l’échéance. Une édition mineure ne renouvelle pas artificiellement la date de publication. L’administration peut adapter ce délai de produit ; ce n’est pas une durée légale.

Dates distinctes : publication, dernière modification de contenu, disponibilité confirmée, dernier relevé de l’état, dernier contrôle de scène. L’acheteur sait de quand datent photos et observations lorsque cette information est connue. Les vendeurs n’effacent pas l’historique de modération en modifiant un texte.
