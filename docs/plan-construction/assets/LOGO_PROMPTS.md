# Provenance des essais de logo et maquettes

Mode utilisé : outil ImageGen intégré, sans appel CLI/API ni clé personnelle. Les originaux générés restent dans le dossier Codex de cette conversation ; les actifs retenus pour ce dossier sont copiés ici. Aucun fichier antérieur n’est supprimé.

## Logo de référence retenu comme couleur

`logo-gp-or-initial-proposition.png` : premier essai de G doré avec P violet. Prompt exact envoyé :

```text
Edit the attached exact GP monogram. User rejected lime and requests a GOLD G instead. CHANGE ONLY THE LEFT G from lime to restrained SATIN CHAMPAGNE GOLD. Use warm mid gold #C9A558, light champagne #E5D3A3 and subtle darker gold #A67D36 for existing segmented G regions. The G must look elegant and softly satin, not fluorescent yellow or green. Remove the excessively bright lime aura around G; keep its new gold glow extremely restrained if any. The G's large silhouette, each segment, proportions and position stay identical.
Keep the RIGHT P exactly as it is: violet/lavender colors, same geometry, layout and letter spacing. Preserve the genuinely transparent background. No black or white rectangular background. No wordmark, labels, border, mockup, new letters, redesigned shapes, or multiple options. One horizontal GP, G champagne gold and P electric violet, on real transparent alpha.
```

`logo-gp-proposition.png` est la référence ensuite renvoyée par Mathis avec un détourage plus net. Les demandes suivantes ont exploré un métal plus détaillé, puis une teinte plus désaturée ; le retour final rejette ces écarts et revient au doré initial. Le fichier de référence du dossier conserve donc cette direction, pas un essai déclaré approuvé sans accord.

## Intégration du GP dans l’interface

`reference-parking.png` : mockup avec monogramme en en-tête, violet inchangé et sélection champagne très pâle. Prompt final d’intégration :

```text
Use case: precise UI logo edit.
EDIT IMAGE 1 only. User approved this exact light parking web platform with pale champagne À vendre filter, soft gold selected parking-floor and purple actions. User now asks ONE GENERATION TO SEE IT WITH THEIR GOLD-AND-VIOLET GP LOGO.
Replace ONLY THE SMALL TOP LEFT PURPLE P ICON with the GP MONOGRAM FROM REFERENCE IMAGE 2: G warm satin gold, P electric violet. Keep letter shapes recognizable and proportional to reference2, but render the small logo cleanly at interface scale with crisp edges and NO oversized glow, dark background rectangle, or fuzzy aura. White header remains white. The GP mark should be about 65–75px wide and 36–40px high, on the same original baseline. Keep the existing black wordmark "park." immediately to its right; shift only that wordmark a little right if needed to avoid overlap. Do not rename the brand, add other wording or duplicate the monogram elsewhere.
Everything outside this small upper-left brand area stays exactly as in image1: same dimensions and aspect ratio; all text, fonts, copy, prices, menu, layout, sidebar images, right property inspector, selected place12 gold tint, pale gold À vendre filter, violet outlines/dot, all violet CTA/search/Plan3D controls, mini-map and footer. NO black theme, no gold buttons, no other palette changes. The strong gold from the G is only for the logo; filter remains its already approved very pale champagne.
Do not change parking architecture, cars, shadows, photos, pillar safety markings or bay numbers. Output a single edited mockup of the identical page with this one GP header logo integration. No device/browser frame, new annotations, watermark, variants or comparison board.
```

Les formulations de conservation sont les contraintes demandées au générateur, pas une attestation d’identité pixel par pixel. Ces images sont des cibles visuelles de travail. Pour coder les composants, utiliser les valeurs explicites des tokens et des contrats, pas mesurer des dimensions immobilières sur l’image générée.

## Fichiers et statuts

- `reference-ville.png` : structure de l’exploration urbaine, ancien accent citron remplacé dans la charte actuelle.
- `reference-parking-originale.png` : première combinaison claire avec parking intérieur.
- `reference-parking-sans-gp.png` : variante à filtre champagne pâle avant intégration du GP.
- `reference-parking.png` : dernière composition du site avec GP.
- `logo-gp-violet-proposition.png` : essai monocolore violet.
- `logo-gp-champagne-proposition.png` : essai de champagne plus pâle/rosé non retenu comme préférence.
- `logo-gp-or-initial-proposition.png` et `logo-gp-proposition.png` : couleur dorée initiale et référence renvoyée par Mathis.

Aucun de ces fichiers ne constitue une vérification de disponibilité de marque. L’asset de production sera un SVG propre et lisible à petite taille, sans halo, après validation de sa construction et du nom.

## Choix final explicite et trois dernières nuances

Après trois nouvelles propositions (solaire, champagne lumineux, ambré), Mathis a choisi le fichier joint original : `logo-gp-reference-validee.png`, copie exacte du fichier codex-clipboard-7416745a-e398-47e2-bf0a-0087843d6577.png. Le choix visuel ne vaut pas vérification de disponibilité juridique. Les trois essais restent dans `variantes-dore/` sans modifier cette référence.

Prompts des trois variantes : même silhouette GP et P violet ; modifier uniquement la palette du G avec le même rendu lisse. Or solaire : #D7B34A, lumière #F8E29A, ombre #B08A2F. Champagne lumineux : #D6BE7A, lumière #F3E4B5, ombre #B79D58. Ambré : #C69A3C, lumière #EAC76A, ombre #986D20. Aucune variante n’a remplacé le fichier choisi.
