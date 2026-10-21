# Vérification du dossier

Ces contrôles concernent les fichiers de conception. Aucun test de l’application, de production, de paiement ou d’un parking réel n’est revendiqué.

| Contrôle | Résultat | Détail |
|---|---|---|
| Une police principale | OK |  |
| Sept tailles autorisées | OK |  |
| Tailles des tokens cohérentes | OK |  |
| Palette de sélection courante | OK |  |
| Contraste texte textPrimary/canvas | OK | 18.36:1 |
| Contraste texte textSecondary/canvas | OK | 6.20:1 |
| Contraste texte textMuted/canvas | OK | 4.97:1 |
| Contraste texte onBrand/brand | OK | 6.18:1 |
| Contraste texte onAccent/accentSoft | OK | 15.58:1 |
| Contraste texte onAccent/accent | OK | 7.88:1 |
| Contraste limite de contrôle | OK | 3.13:1 |
| JSON Schema parking-level.schema.json | OK |  |
| JSON Schema listing-submission.schema.json | OK |  |
| Fixture schématique valide | OK | [] |
| Refus mesuré sans calibrage | OK |  |
| Refus ressource externe | OK |  |
| Refus traversée de chemins | OK |  |
| Refus image comme modèle | OK |  |
| Refus modèle comme aperçu | OK |  |
| Refus manifest public pour annonce area | OK |  |
| Refus champ privé dans manifest | OK |  |
| Refus identifiant non UUID | OK |  |
| 35 tâches uniques | OK |  |
| Dépendances existantes | OK |  |
| HTML IDs uniques Dossier-complet.html | OK |  |
| HTML IDs uniques Charte-visuelle.html | OK |  |
| PNG lisible reference-parking.png | OK |  |
| PNG lisible logo-gp-champagne-proposition.png | OK |  |
| PNG lisible logo-gp-reference-validee.png | OK |  |
| PNG lisible logo-gp-or-initial-proposition.png | OK |  |
| PNG lisible reference-parking-originale.png | OK |  |
| PNG lisible logo-gp-proposition.png | OK |  |
| PNG lisible reference-ville.png | OK |  |
| PNG lisible logo-gp-violet-proposition.png | OK |  |
| PNG lisible reference-parking-sans-gp.png | OK |  |
| PNG lisible 01-or-solaire.png | OK |  |
| PNG lisible 02-or-champagne.png | OK |  |
| PNG lisible 03-or-ambre.png | OK |  |
| Logo avec transparence réelle | OK |  |
| Logo approuvé conservé à l’identique | OK |  |
| 18 rôles spécialisés préparés | OK |  |
| Rôles A00 à A17 | OK |  |
| Brief complet A00_COORDINATEUR.md | OK |  |
| Brief complet A01_DESIGN_SYSTEM.md | OK |  |
| Brief complet A02_DONNEES_CONTRATS.md | OK |  |
| Brief complet A03_IDENTITE_SECURITE.md | OK |  |
| Brief complet A04_BACKEND_ANNONCES.md | OK |  |
| Brief complet A05_FRONT_PUBLIC.md | OK |  |
| Brief complet A06_COMPTE_DEPOT.md | OK |  |
| Brief complet A07_MEDIAS.md | OK |  |
| Brief complet A08_CARTE_VILLE.md | OK |  |
| Brief complet A09_RECONSTRUCTION_3D.md | OK |  |
| Brief complet A10_VIEWER_3D.md | OK |  |
| Brief complet A11_QUALITE_REELLE.md | OK |  |
| Brief complet A12_MESSAGES_NOTIFICATIONS.md | OK |  |
| Brief complet A13_ADMIN_MODERATION.md | OK |  |
| Brief complet A14_SEO_ACCESSIBILITE.md | OK |  |
| Brief complet A15_QA_RECETTE.md | OK |  |
| Brief complet A16_DEVOPS_PERFORMANCE.md | OK |  |
| Brief complet A17_DROITS_ABONNEMENTS.md | OK |  |
| Fonte WOFF2 valide | OK |  |
| Licence Inter présente | OK |  |

440 assertions documentaires exécutées : JSON Schema et fixture, contre-exemples, tokens, contrastes des paires prévues, dépendances, liens locaux, ancres HTML, actifs image et fonte.

Les contrastes calculés ne remplacent pas la recette accessibilité du site. La conformité du modèle aux dimensions réelles, les policies RLS, les emails et les abonnements seront testés après développement.
