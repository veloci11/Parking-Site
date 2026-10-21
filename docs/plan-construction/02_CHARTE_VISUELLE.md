# 02 — Charte visuelle et composants

## 1. Référence et règle d’autorité

Les références sont `assets/reference-ville.png` et `assets/reference-parking.png`. Fond blanc, sans serif très lisible, violet électrique, sélection dorée douce, carte lavande, surfaces simples, angles arrondis contenus. La vue parking conserve le même en-tête, les mêmes filtres, les mêmes résultats et la même fiche.

Ne pas revenir aux propositions noir/or. Aucun changement de thème par page. L’objectif est de coder un système stable, pas de réinventer la mise en page pour chaque écran. Les tokens structurés sont dans `specs/design-tokens.json` ; ce fichier prime sur des valeurs recopiées à la main.

## 2. Police : une seule famille

**Inter variable, auto-hébergée en WOFF2**, avec sa licence conservée. Source officielle : [Inter](https://rsms.me/inter/). C’est un choix de réalisation proche de la maquette, pas l’affirmation que l’image générée utilise exactement cette police. Le logo GP est un dessin vectoriel distinct, pas une seconde police d’interface.

Pile : `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Les polices de repli servent uniquement au chargement ou à une défaillance. Utiliser des chiffres tabulaires pour prix, dimensions et tableaux. Pas de faux gras ou faux italique ; pas de chargement d’une famille différente dans un composant tiers.

### Échelle autorisée : sept tailles

| Token | Ordinateur | Mobile | Graisse | Interligne | Usage |
|---|---:|---:|---:|---:|---|
| `hero` | 48 px | 32 px | 800 | 1,08 | « Votre prochaine place est ici. », une fois par vue principale |
| `pageTitle` | 32 px | 24 px | 700 | 1,20 | Titre de page compte, dépôt, fiche |
| `sectionTitle` | 24 px | 20 px | 700 | 1,25 | Sections et formulaires |
| `cardTitle` | 20 px | 20 px | 700 | 1,30 | Lieu et titre d’une fiche |
| `body` | 16 px | 16 px | 400 | 1,50 | Texte, champs et messages |
| `secondary` | 14 px | 14 px | 400 | 1,45 | Descriptions courtes, navigation secondaire |
| `caption` | 12 px | 12 px | 500 | 1,40 | Date, référence, attribution, aide courte |

Tailles uniques : **12, 14, 16, 20, 24, 32, 48 px**. Prix de l’aperçu : `pageTitle` ; prix dans une ligne de résultat : `body` gras. Pas de huitième taille pour un prix, un badge ou un menu. Les champs restent à 16 px sur mobile.

Graisses autorisées : 400 texte, 500 navigation/métadonnées, 600 labels/boutons, 700 titres/prix, 800 grand titre. Le même token peut recevoir une de ces emphases dans un composant défini ; pas de variation libre par page. Tracking : `hero -0.035em`, `pageTitle -0.025em`, autres titres `-0.015em`, corps `0`. Longs textes : maximum 65 caractères environ par ligne.

## 3. Palette

| Token | Valeur | Usage |
|---|---|---|
| `canvas`, `surface` | `#FFFFFF` | Fond et panneaux |
| `surfaceSubtle` | `#F8F9FC` | Fond doux, sections de compte |
| `textPrimary` | `#12141D` | Titres et corps |
| `textSecondary` | `#596174` | Texte secondaire lisible |
| `textMuted` | `#667085` | Métadonnées et aide |
| `brand` | `#6D28FF` | CTA, lien actif, sélection |
| `brandHover` | `#5720CC` | Survol CTA |
| `brandSoft` | `#F0E9FF` | Fond léger sélectionné |
| `accent` | `#C9A558` | Base dorée du G et voile de sélection de place |
| `accentSoft` | `#F3ECD9` | Fond champagne très pâle du filtre actif et repère de carte |
| `accentBorder` | `#D7C6A6` | Bordure douce du filtre actif |
| `onBrand` | `#FFFFFF` | Texte sur violet |
| `onAccent` | `#12141D` | Texte sur champagne pâle ; jamais blanc |
| `border` | `#E5E7EF` | Séparateurs décoratifs |
| `controlBorder` | `#8992A5` | Limite de champ quand nécessaire pour son identification |
| `mapLand` / `mapBuilding` | `#F0EFFA` / `#DAD6ED` | Carte indicative claire |
| `mapWater` / `mapPark` | `#A8D6F0` / `#DCEAC8` | Eau et végétation |
| `success` / `warning` / `danger` | `#166534` / `#92400E` / `#B42318` | Texte d’état accompagné d’un libellé |

Le doré ne sert pas à écrire un paragraphe sur blanc. Les CTA restent violets. Le voile doré du sol utilise une opacité cible de 22 %, ajustée pour conserver sa texture ; les filtres actifs ont le fond `accentSoft`, bordure `accentBorder` et texte foncé. Aucune capsule en or saturé. La couleur seule ne dit jamais « sélectionné », « vendu » ou « problème » : ajouter texte, contour, icône ou motif. Le fond de sélection d’une place ne remplace pas sa vraie texture d’état ; le filtre peut être masqué.

## 4. Espacements, formes et dimensions

Échelle d’espacement unique : **4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px**. Pas de `margin: 17px` pour corriger une page. Grille par défaut : 8 px ; les demi-pas 4/12/20 sont réservés aux ajustements prévus des composants.

Rayons : 8 px champs et petites images, 12 px cartes, 16 px panneau de bien, 24 px grand groupe de recherche ; `999px` seulement pour puces, avatars, boutons ronds. Bordures 1 px ; focus et sélection 2 px. Ombres : une légère pour un panneau flottant, une moyenne pour une modale ; pas d’ombre sur toutes les lignes de résultats.

Conteneur éditorial maximum : 1 280 px ; espace de recherche plein écran. En-tête 76 px sur grand écran, 64 px sur mobile. Colonne résultats 320–400 px selon largeur ; inspecteur 320–360 px. À 1 440 px : gauche 360 px, carte flexible, inspecteur 336 px superposé dans la zone cartographique. À moins de 1 180 px, privilégier un seul panneau latéral. Ces mesures de grille sont des tokens de layout, pas des tailles de police supplémentaires.

## 5. Bibliothèque de composants à créer une fois

| Composant | Variantes et dimensions | États obligatoires |
|---|---|---|
| `Button` | primary violet, secondary contour, ghost, danger ; hauteur 44/48 px ; texte body 600 | défaut, hover, focus, pressé, chargé, désactivé |
| `IconButton` | carré/rond 44 px ; icône 20 px | libellé accessible, actif, focus, disabled |
| `Input`, `Select`, `Textarea` | label secondary 600 ; texte body ; champ 48 px | vide, rempli, invalide, lecture seule, chargement |
| `FilterChip` | hauteur 44 px, capsule ; champagne très pâle pour filtre actif, blanc sinon ; texte foncé | non choisi, choisi, supprimer, focus |
| `ListingRow` | photo ratio 16:9, titre cardTitle, prix body 700 ; diviseur commun | sélection, favori, vendu, image absente |
| `ListingInspector` | surface blanche, rayon 16, photo 4:3, prix pageTitle | chargé, fermé, erreur, retiré |
| `MediaGallery` | ratios cohérents, légende et compteur | navigation clavier/tactile, chargement, échec |
| `StatusBadge` | secondary ou caption selon densité ; icon + texte | neutre, publié, en attente, vendu, correction |
| `StatePanel` | titre sectionTitle, explication body, action simple | vide, indisponible, erreur, hors ligne |
| `Dialog`, `Drawer` | focus contenu, fermeture explicite, titre | ouverture, confirmation, erreur |
| `WizardStep` | titre sectionTitle, aide secondary, étapes numérotées | incomplet, sauvegardé, erreur, envoi |
| `QualityFact` | libellé body, valeur et date, source | déclaré, documenté, mesuré, non renseigné |
| `PlanTabs` | Ville / Plan 3D / Photos selon contexte | actif, indisponible avec explication |
| `MapMarker` | prix total body 700, selected champagne pâle + contour violet | groupé, sélectionné, plusieurs annonces |

Icônes : une seule bibliothèque, Lucide, trait 1,75–2 px. Tailles permises 16/20/24 px, commandes de carte dans une cible 44 px. Pas d’emojis comme icônes produit. Tous les composants métier sont construits sur les primitives communes.

## 6. Mobile et accessibilité

Points de rupture : `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`. Recette aux largeurs 390, 768, 1 024 et 1 440 px. Les bascules métier utilisent les seuils de layout prévus, sans multiplier les media queries locales.

Sur mobile : une seule vue principale à la fois, bouton Liste/Carte, panneau inférieur dépliable. Filtres en modale avec boutons Appliquer/Réinitialiser. Pas de scène 3D à manipuler derrière un dialogue actif. Navigation et commande de fermeture restent accessibles au clavier et au lecteur d’écran.

Cibles de réalisation : contraste WCAG AA pour texte et commandes, focus visible, zoom texte à 200 %, aucune action exclusivement au survol, toutes les places accessibles depuis une liste HTML. Voir [référence W3C](https://www.w3.org/WAI/WCAG22/quickref/). La conformité réelle sera vérifiée sur le site développé ; elle n’est pas établie par une maquette.

## 7. Animations

Trois durées : `fast 120ms`, `normal 200ms`, `slow 320ms` ; caméra au plus 700 ms quand il faut comprendre un déplacement. Courbe interface `cubic-bezier(0.2,0.8,0.2,1)`. Utiliser opacity/transform ; pas d’animation permanente des prix, formulaires ou textes.

Effets autorisés : sélection synchronisée carte/liste, glissement de l’inspecteur, fondu entre niveaux, surbrillance de la place, transition d’orientation de caméra, retour d’enregistrement d’un brouillon. Éviter les effets qui modifient la couleur ou la lumière réelle des défauts du parking.

`prefers-reduced-motion` désactive déplacements et orbites : changement immédiat de position, visibilité et focus conservés. Aucun son automatique. Les scènes ne tournent pas toutes seules. Une scène quittée est déchargée pour libérer mémoire et batterie.

## 8. Logo GP

Objectif : garder le P géométrique violet de la référence, ajouter un G devant, même épaisseur, rayon, construction et hauteur. Le monogramme doit rester lisible comme **G puis P** à 24 et 32 px. Le mot « park. » des maquettes n’est pas un nom commercial validé ; la décision de nom reste séparée.

Livraison cible avant production : SVG optimisé, variante couleur sur blanc, monochrome sombre, blanche, favicon et exports PNG. Zone de respiration : un quart de la hauteur. Taille minimale du monogramme complet : 24 px ; pour favicon 16 px, variante simplifiée spécifiquement validée. Le G reprend l’or initial préféré (#C9A558, clair #E5D3A3, ombre #A67D36) et le P reste violet. Le site garde sa base blanche/violette ; aucun bouton principal doré. Pas de refonte du P. Le dernier filtre actif utilise un doré beaucoup plus pâle, comme sur la place.

La proposition jointe est une piste raster de travail. Le dernier retour demande le même rendu lisse et géométrique sur G et P : pas de métal réaliste brossé uniquement sur le G, ni de halo dans le petit logo d’interface. Le SVG final sera dessiné et comparé à cette piste après choix. La vérification de disponibilité du signe et du nom n’est pas équivalente à une recherche web générale ; voir INPI/EUIPO dans le document 09. Aucune exclusivité n’est affirmée.

## 9. Règles à imposer au futur code

- Un seul fichier de tokens ; générer les variables CSS et les correspondances du thème à partir de celui-ci.
- Les composants importent ces tokens, jamais une couleur hexadécimale ou une taille de texte nouvelle.
- Interdire les classes de taille arbitraire et les styles de police en ligne dans l’interface, sauf exception nommée du registre design.
- Tests visuels des composants et des quatre écrans principaux : exploration, parking, dépôt, compte.
- Contrôler les états clavier et mobile, pas uniquement une capture au repos.
- Une évolution de token est documentée et appliquée globalement ; un besoin local se résout d’abord avec un composant existant.
