# Scènes paramétriques et navigation intérieure

## Contrat runtime distinct

Le contrat effectivement exécuté s’appelle **`gp-parametric-level/1.1`** dans l’enveloppe publique. Le manifest porte `schemaVersion: "gp-parametric-1.1"`. Il conserve les mètres, le plan X/Z et l’axe vertical Y, avec coordonnées locales droitières autour de l’origine locale [0,0,0]. Ce format ne prétend pas être le `parking-level.schema.json` version1.0 du dossier de conception : ce dernier prévoit un registre canonique de parkings/niveaux, un autre ensemble de champs et des assets GLB.

Compatibilité : les manifests paramétriques historiques `schemaVersion: "1.0"` restent acceptés par l’adaptateur. Ils sont normalisés vers l’ancienne géométrie pour le validateur SQL éprouvé, puis projetés publiquement avec le nouveau nom de version. Un import du schéma canonique du plan ne passe pas ce validateur strict et nécessite un convertisseur explicite. Les nouveaux gabarits de l’outil utilisent le nom distinct. Le viewer vérifie l’enveloppe publique et les bornes de géométrie ; un contrat inconnu retourne aux photos plutôt que rendre une structure incompatible.

## Provenance et preuves

La provenance globale peut préciser `geometrySource` (`unknown`, `plan_derived`, `measured`) et `geometryEvidenceIds`, références privées à des sources du modèle. Chaque polygone de place peut déclarer sa source géométrique. Une observation peut posséder un identifiant stable privé, un `spaceId` du niveau, une source, sa propre date ISO et des `evidenceIds` privés. `photo_documented` et `provided_document` exigent identité, date et preuves. Les preuves doivent appartenir aux `evidenceIds` déjà joints et autorisés de cette scène, jamais à une autre annonce.

Les observations publiques exposent uniquement une nouvelle identité de contexte, une position, une catégorie, une description, la source déclarée, la date, le nombre de preuves et éventuellement l’alias public de la place. Les UUID privés de sources/observations/places, fichiers, chemins et mesures de calibrage brutes restent exclus. Les sources privées sont des pièces jointes autorisées ; aucune URL externe n’est acceptée par le manifest.

## Fidélité limitée au périmètre réel du contrôle

La démonstration procédurale reste un schéma fictif ; une scène réelle n’est jamais inventée lorsqu’un modèle manque. Le niveau `measured` décrit une géométrie calibrée avec deux distances contrôlées. Il ne signifie pas que tout l’état du parking est documenté.

Le modérateur peut confirmer séparément `observationEvidenceChecked`, après comparaison des observations à leurs preuves. `reviewed` est produit seulement lorsqu’une source géométrique identifiée possède des preuves et qu’au moins une observation datée et documentée a été contrôlée. Le périmètre public est **`geometry_and_listed_observations_only`** avec liste des observations et alias des unités concernés. Une observation documentée sur une place ne rend pas implicitement documentés tous ses champs ni ceux des autres places. Une simple case vendeur, une texture esthétique ou des photos générales ne changent pas ce niveau. Le niveau n’est pas une expertise technique, immobilière ou juridique.

## Intégrité et versions

`PublicScene.version` est la version contrôlée du registre, distincte de la version du format JSON. L’API ajoute `manifestHash` et `hashAlgorithm: "sha256:gp-json-sort-v1"`. L’empreinte SHA-256 porte sur le **manifest public seulement**, sérialisé récursivement avec clés d’objet triées, ordre des tableaux conservé et représentation JSON JavaScript des scalaires. Les champs non définis sont omis. Il ne s’agit ni d’une signature ni d’un hash des fichiers privés. Changer une observation publique change l’empreinte ; changer des clés privées retirées ne les expose pas. L’empreinte est un attribut du transport HTTP de l’API, pas du RPC SQL brut.

Les anciennes géométries approuvées restent dans le registre, et la sélection publique garde les contrôles de consentement exact, mapping et disponibilité. Cette livraison ne fournit pas de commande de retour arrière vers une ancienne version : une réapprobation contrôlée reste nécessaire.

## Retour à la même vue

L’URL utilise `parking=<listingId public>`, `floor=<niveau entier>` et, après sélection, `unit=<alias public>`. Les paramètres de recherche existants sont conservés. Ces identifiants désignent le contexte de l’annonce, **pas un parking canonique partagé**. Un niveau ou une unité absent de l’annonce est ignoré.

La sélection intérieure est gardée dans la session du navigateur pour les allers-retours ville/parking. La caméra intérieure est stockée séparément sous une clé comprenant annonce, niveau et version de scène ; elle ne remplace jamais la caméra de ville. Le bouton de recentrage oublie la caméra correspondante. Les paramètres de caméra sont finis et bornés, et le zoom reste centré sur la cible après déplacement. Le stockage peut être refusé par le navigateur : l’URL et le cadrage initial restent utilisables.

## Registre disponible et rapprochement restant

Le registre019 fournit les sites, niveaux et places physiques canoniques, les contributeurs autorisés aux références communes et le rattachement administratif des annonces. Les alias publics restent limités aux annonces actives ayant consenti à une localisation exacte. Les scènes demeurent des modèles distincts par annonce et niveau : la réconciliation de géométries entre annonces et la restauration atomique d’une version géométrique partagée ne sont pas livrées. Aucun lien canonique public ne doit être publié pour une annonce en localisation de secteur.

## Validation livrée

Tests locaux : contrats de version et preuve, projection sans identités privées, hash sensible au manifest, rejet des contrats incompatibles, URL/alias/niveau, clés caméra indépendantes et pipeline local complet. `supabase/tests/scene-contract.sql` est une recette SQL transactionnelle à annuler, composée uniquement de fixtures fictives. Elle ne crée aucun objet physique Storage et ne délivre aucun email. L’application distante de015 et l’exécution réelle de cette recette sont des actions distinctes, réalisées par le coordinateur.
