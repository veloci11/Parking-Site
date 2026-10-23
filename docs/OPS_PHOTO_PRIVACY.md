# Préparer localement une photo avant dépôt

L’outil `scripts/prepare-photo.ts` produit une copie dont les rectangles choisis manuellement sont remplacés par des pixels noirs opaques. Il ne détecte rien automatiquement, ne génère rien par IA et n’embellit pas le parking. L’original reste intact. Ce traitement local précède le dépôt ; il ne modifie ni le formulaire, ni un média déjà approuvé, ni Supabase.

Un rectangle doit couvrir **toute la plaque, ses bordures et ses bandes bleues**, ou tout le visage reconnaissable, avec une marge utile. Ajouter aussi les codes d’accès, badges et documents personnels visibles. L’outil ne peut pas savoir si le rectangle a été correctement placé ou si une autre zone a été oubliée. Une vérification humaine de l’image entière reste obligatoire.

## Préparation opérateur

Travailler sur une photo originale autorisée, jamais sur un fichier déjà publié ou approuvé. Choisir un dossier privé existant, appartenant à l’opérateur, avec droits `0700`. Les dossiers publics, `.git`, `node_modules`, `.next…` et les chemins de sortie avec liens symboliques sont refusés. `.data/` est ignoré par Git dans ce projet ; ne pas déplacer les traces dans `public/`, une annonce ou un dépôt partagé.

```sh
mkdir -p .data/photo-privacy
chmod 700 .data/photo-privacy
npx tsx scripts/prepare-photo.ts inspect --input /chemin/prive/original.jpg
```

`inspect` renvoie uniquement l’empreinte SHA256 de la source, les dimensions **après orientation EXIF** et le repère `exif-oriented-pixels`. Cette sortie est une information privée de préparation. Ne pas la copier dans une annonce. Ouvrir l’original dans un éditeur local respectant l’orientation EXIF, vérifier ces dimensions, puis relever les rectangles en pixels dans ce repère. Le coin supérieur gauche est `(0,0)` ; `x,y` désignent le début inclus, `width,height` l’étendue exacte. Aucun redimensionnement ni recadrage ne précède les coordonnées dans cet outil.

Créer un plan JSON privé et remplacer tous les exemples par les valeurs réellement contrôlées :

```json
{
  "version": 1,
  "coordinateSpace": "exif-oriented-pixels",
  "sourceSha256": "REMPLACER_PAR_LES_64_CARACTERES_SHA256_DE_INSPECT",
  "width": 900,
  "height": 600,
  "outputFormat": "webp",
  "operatorReference": "reference-interne-operateur",
  "reason": "Anonymisation des plaques et visages avant dépôt de cette photo.",
  "declaredAt": "2026-10-22T12:00:00Z",
  "rectangles": [
    {
      "kind": "plate",
      "x": 120,
      "y": 300,
      "width": 180,
      "height": 60,
      "wholePlateIncludingBlue": true
    },
    {
      "kind": "face",
      "x": 600,
      "y": 80,
      "width": 100,
      "height": 130
    }
  ]
}
```

Les champs inconnus sont refusés. Le plan exige de 1 à 100 rectangles non vides, dans les limites de l’image, une empreinte source correspondante, des dimensions exactes, une référence opérateur, un motif et une date déclarée ISO8601 avec fuseau. `kind` accepte `plate`, `face` ou `other_sensitive`. Une plaque exige l’attestation explicite `wholePlateIncludingBlue:true` ; cela reste une déclaration humaine. Un plan sans zone à masquer est refusé par cette commande.

```sh
chmod 600 /chemin/prive/plan-photo.json
npx tsx scripts/prepare-photo.ts prepare --input /chemin/prive/original.jpg --plan /chemin/prive/plan-photo.json --output-dir .data/photo-privacy
```

La commande crée un nouveau sous-dossier UUID privé, contenant `candidate.webp` ou `candidate.png` et `trace.json`. Elle n’écrase aucun fichier existant. Les JPEG/PNG/WebP statiques sont seuls admis, avec type réel contrôlé, taille source et sortie de 10 Mio maximum, limite de décodage de 30 mégapixels alignée sur le dépôt actuel. SVG, GIF, animation PNG/WebP, fichier corrompu et rectangles hors cadre sont refusés. L’orientation est normalisée avant application des rectangles ; la sortie est un PNG ou WebP **sans perte**, sans EXIF/GPS/ICC/XMP/IPTC, sans calque ni alpha contenant les pixels masqués. L’original n’est ni réécrit ni copié dans le dossier de résultat.

La trace privée conserve SHA256 source/sortie, rectangles en pixels et coordonnées normalisées, dimensions, format, opérateur, motif, date déclarée et horodatage de préparation. Elle ne contient aucun chemin d’entrée. Son état reste `pending_human_review` : **ne pas téléverser la candidate**.

## Revue humaine puis dépôt

Ouvrir la candidate locale et la contrôler en entier, à une échelle suffisante : plaque complète y compris le bleu, chaque visage reconnaissable, aucun texte sensible restant, aucune zone oubliée, aucun défaut du parking caché à tort. Vérifier également cadrage et rotation. Un rectangle opaque ne prouve pas qu’il recouvre le bon objet. En cas d’erreur, corriger le plan et produire un nouveau dossier de préparation ; ne pas retoucher la candidate ou ses traces à la main.

Après cette lecture, relever `outputSha256` dans la trace et écrire un second fichier JSON privé :

```json
{
  "version": 1,
  "outputSha256": "REMPLACER_PAR_LE_SHA256_SORTIE_DU_TRACE_PRIVE",
  "reviewerReference": "reference-interne-relecteur",
  "reason": "Image entière relue, plaques complètes et visages masqués sans masquer un défaut du bien.",
  "declaredAt": "2026-10-22T12:05:00Z",
  "attestations": {
    "fullImageInspected": true,
    "allSensitiveContentCovered": true,
    "platesIncludingBlueCovered": true,
    "sceneNotBeautified": true
  }
}
```

Les références peuvent correspondre au même opérateur si l’organisation n’exige pas un second lecteur ; aucune indépendance fictive n’est attestée. Les dates sont déclarées par les intervenants et les horodatages réels d’exécution sont enregistrés séparément. Une date future de plus de cinq minutes est refusée.

```sh
chmod 600 /chemin/prive/revue-photo.json
npx tsx scripts/prepare-photo.ts review --bundle .data/photo-privacy/UUID_RENVOYE --review /chemin/prive/revue-photo.json
```

Toutes les attestations doivent valoir `true`, et l’empreinte de la candidate doit toujours correspondre à la préparation et à la revue. La commande crée exclusivement `review.json` et `upload.webp`/`upload.png`, avec droits `0600`. Le reçu lie aussi l’empreinte de la trace initiale et l’horodatage réel de revue. Une seconde revue ou un fichier déjà présent est refusé ; aucun original, trace ou résultat antérieur n’est remplacé. Si une erreur d’écriture interrompt la libération, conserver ce dossier pour examen et recommencer une préparation dans un nouveau dossier.

Déposer **uniquement `upload.webp` ou `upload.png`** dans le formulaire existant. Conserver les traces dans l’espace privé d’opération selon la politique de conservation décidée ; aucune durée n’est inventée ici. Ne publier ni trace, ni empreinte source, ni chemin, ni référence opérateur. Le formulaire et le serveur ne vérifient pas ce reçu local : l’obligation avant dépôt relève de cette procédure opérateur, pas d’une intégration automatique inexistante. La modération relit encore la copie déposée et refuse toute zone sensible ou tout masquage altérant la présentation réelle du bien.

## Vérification technique

`tests/photo-redaction.test.ts` utilise uniquement des images synthétiques : couverture de chaque pixel d’une plaque bleue et d’un visage, conservation des pixels extérieurs et de la source, coordonnées après EXIF6, PNG/WebP sans métadonnées, refus de plans/fichiers/animations, permissions privées, liens symboliques, altération entre préparation et revue, revue obligatoire et refus d’écrasement. Aucune image réelle n’a été ouverte ou modifiée pour ces tests.

Références techniques : [orientation EXIF Sharp](https://sharp.pixelplumbing.com/api-operation/#autoOrient), [sortie sans métadonnées par défaut](https://sharp.pixelplumbing.com/api-output/). Le masquage opaque est une anonymisation locale des zones choisies ; ce n’est ni une détection automatique exhaustive ni une garantie que l’opérateur a repéré toutes les informations personnelles.
