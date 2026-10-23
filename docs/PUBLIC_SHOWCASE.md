# Deux annonces de présentation — Le Raincy

`GP_PUBLIC_SHOWCASE=true` autorise deux exemples publics en lecture seule au **16–18 allée Victor Hugo, 93340 Le Raincy**, à la demande du propriétaire du site. Ce réglage est distinct de `GP_FORCE_LOCAL_DEMO` et `GP_LOCAL_DEMO`, qui restent désactivés sur Ubuntu. Les comptes et les annonces réelles restent gérés par Supabase avec les permissions existantes.

Les exemples apparaissent au catalogue uniquement lorsque **tout l’inventaire public réel est vide**. Un filtre sans résultat sur un catalogue réel ne fait jamais réapparaître des exemples. Une panne Supabase conserve son erreur, sans substituer des données fictives. Dès la première publication réelle, le catalogue donne priorité aux annonces réelles. Les liens directs des exemples restent consultables tant que le réglage est actif ; désactiver ce réglage les retire aussi des fiches et du parking partagé.

Les identifiants réservés sont `de600000-0000-4000-8000-000000000016` et `de600000-0000-4000-8000-000000000018`. Aucun utilisateur, faux vendeur, bien, plan approuvé ou réservation n’est ajouté en base. Les favoris, modifications, messages et demandes de visite sont désactivés pour ces exemples. Les autres parcours ne changent pas.

La première annonce présente la place fictive12 au niveau−1 pour un prix illustratif de18500€. La seconde présente un lot fictif de deux places,13 au niveau−1 et24 au niveau−2, pour un prix illustratif de32000€. Le parking partagé permet de cliquer sur les places et changer de niveau, avec les rendus en perspective déjà approuvés. Il ne s’agit pas d’une modélisation du parking réel à cette adresse. Prix, état, photos, dimensions et numérotation sont fictifs et signalés dans les cartes et fiches.

## Position de la carte

L’[API de géocodage IGN / BAN](https://data.geopf.fr/geocodage/search?q=16%20allee%20Victor%20Hugo%2093340%20Le%20Raincy&limit=2), consultée le22 octobre2026, retourne :

| Adresse | Identifiant BAN | Longitude, latitude |
| --- | --- | --- |
| 16 allée Victor Hugo, Le Raincy | `93062_0940_00016` | `2.514477, 48.889647` |
| 18 allée Victor Hugo, Le Raincy | `93062_0940_00018` | `2.514755, 48.889579` |

Seuls ces points d’adresse correspondent au référentiel géographique. Ils ne prouvent pas l’existence, la disposition ni la disponibilité des places présentées. Le fond de ville 3D utilise les bâtiments du fournisseur cartographique ; sa couverture et ses hauteurs ne constituent pas un relevé du bâtiment.

## Vérification

`tests/public-showcase.test.ts` couvre activation/désactivation, adresses IDF, correspondance des places12/13/24, filtres, curseurs et tris, priorité du catalogue réel, absence de repli sur panne et refus des mutations. La recette visuelle en ligne est consignée séparément après déploiement.
