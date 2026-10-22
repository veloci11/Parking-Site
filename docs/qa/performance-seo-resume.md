# Reprise — performance, indexation et exploitation

Revue bornée du 22 octobre 2026, mission 14/15. Sources et artefacts `.next` existants lus ; aucun serveur démarré, build lancé, accès DB, fichier `.env` consulté, commit, push ou déploiement. Aucun rendu de parking ni asset approuvé modifié.

**Verdict : pas de correctif produit urgent démontré dans ce périmètre.** L’indexation demeure fermée dans l’artefact de build examiné. La carte blanche de la première capture IAB n’est pas une panne établie : le coordinateur a ensuite obtenu la carte 3D visible via `Tab.getScreenshot()` et des logs de développement vides. La différence de capture/CDP et de métriques Retina ne justifie pas de modifier CityMap.

## Indexation et contenu public

| Point | Preuve locale | Conclusion et limite |
| --- | --- | --- |
| Fermeture avant ouverture | `src/app/layout.tsx` définit `noindex,nofollow` tant que `GP_PUBLIC_LAUNCH` n’est pas exactement `true` ; `src/app/robots.ts` interdit `/` ; `.next/server/app/robots.txt.body` contient `User-Agent: *` puis `Disallow: /`. | Garde cohérente avec la V1 non ouverte. Ce build ne prouve pas la configuration d’un futur hébergement. |
| Cache des robots | `.next/prerender-manifest.json` inscrit `/robots.txt` comme route statique. Le guide embarqué Next `robots.md` confirme le cache par défaut des metadata routes sans API dynamique. | Lors de l’ouverture, reconstruire et vérifier le `robots.txt` effectivement servi avec les métadonnées ; modifier seulement une variable d’un processus démarré peut conserver l’artefact statique précédent. Aucune ouverture effectuée. |
| Fiche d’annonce | `src/app/annonces/[id]/[slug]/page.tsx` attend `loadPublicListing`, fournit titre/description/canonique, redirige définitivement un ancien slug et renvoie `notFound()` si l’annonce est absente. `ListingDetail` reçoit la donnée serveur avant hydratation. | La fiche ne dépend pas uniquement d’une recherche exécutée dans le navigateur. Les annonces de démonstration reçoivent `noindex,nofollow`. |
| Projection SSR et sitemap | `src/server/catalog.ts:loadPublicListing` utilise `published_listings` avec la clé publique en mode connecté, sans repli démo en production non autorisée. `src/app/sitemap.ts` lit la même table paginée par 1 000, exclut `payload.isDemo`, et reste vide avant ouverture. | Aucun brouillon privé interrogé par ces chemins. La migration `20261021182000_availability_maintenance.sql` définit une policy restrictive pour ne lire que les publications disponibles d’un compte actif ; aucune vérification de la base distante n’a été effectuée par cette mission. |
| Catalogue de départ | `src/app/page.tsx` et `src/app/explorer/page.tsx` rendent `Explorer` ; son état initial est vide, puis il lit la recherche et charge `/api/listings` dans les effets. | Les liens des offres du catalogue arrivent après JavaScript. Point d’amélioration pour la découverte au lancement, compensé partiellement par les fiches serveur et leur sitemap ; pas d’indexation réelle revendiquée. |
| Pages privées | `src/app/(account)/layout.tsx` impose `noindex,nofollow`. Favoris/comparaison et signalement disposent aussi de métadonnées fermées. | Les règles robots complètent l’indexation ; l’autorisation applicative reste indépendante. |

## Chargement et carte

- `Explorer.tsx` charge CityMap avec `next/dynamic`, `ssr:false` et un état de chargement. CityMap importe MapLibre après montage et utilise un worker servi localement. La police Inter est locale avec `display:swap` ; son fichier pèse 352 240 octets.
- **Optimisation concrète à mesurer ultérieurement :** `Explorer.tsx` monte CityMap dès `initialized`, y compris lorsque la vue mobile Liste masque `.map-panel` (`globals.css`, règle à moins de 768 px). Le montage peut donc déclencher import, worker et style pour une carte invisible. Différer ce montage jusqu’à l’usage de Carte sur mobile est une proposition limitée ; aucun patch appliqué pendant le gel. Préserver la caméra et vérifier le passage Liste/Carte ainsi que le redimensionnement avant de l’intégrer.
- Artefacts existants : le chunk `.next/static/chunks/129dosu-bogdt.js` contenant MapLibre pèse **1 085 092 octets bruts**, soit **292 143** après gzip local ; le worker `public/vendor/maplibre-gl-6.15.0/maplibre-gl-worker.mjs` pèse **518 806 octets bruts**, soit **147 120** après gzip local. Ce sont des tailles de fichiers et une estimation de compression, pas des octets effectivement transférés, un budget dépassé ou des temps de chargement mesurés.
- L’effet d’initialisation CityMap dépend seulement de `attempt`. Il protège l’import asynchrone par `disposed`, annule son timeout et appelle `localMap.remove()` au nettoyage. La perte de contexte WebGL et certains échecs de style activent le repli ; un timeout de 15 secondes permet aussi le réessai. Aucun cycle de destruction/recréation lié aux callbacks n’est démontré dans la source.
- Le fournisseur par défaut est OpenFreeMap Liberty ; la CSP autorise son origine et le worker local. Le chargement du style, des tuiles et la disponibilité WebGL restent des dépendances à tester sur l’environnement retenu. La liste et les fiches restent le repli explicite.
- `SafePhoto.tsx` produit des variantes 480/960/1920 pour les médias d’annonce via l’API autorisée ; il évite un cache public d’optimisation d’images qui retarderait leur retrait. Le coût de cette vérification ne doit pas être supprimé au titre d’une optimisation générique.

## Exploitation et portée de la validation

La CI versionnée (`.github/workflows/ci.yml`) prévoit Node 24, installation verrouillée, format, TypeScript, tests, build puis HTTP sur une instance isolée. Sa présence ne prouve pas une exécution GitHub récente ; aucun de ces contrôles n’a été relancé par cette revue documentaire.

`src/server/readiness.ts` dispose d’un contrôle de la projection publique avec timeout de 4 secondes et réponse `private,no-store`. `scripts/check-health.ts` borne l’appel à 6 secondes, refuse une origine avec identifiants et journalise seulement statut HTTP, identifiant de requête et disponibilité. L’existence de ces outils ne prouve pas qu’un moniteur est planifié.

`docs/OPERATIONS.md` distingue démonstration, backend connecté et ouverture publique ; les workers, la livraison email, la sauvegarde/restauration et la supervision demandent leur propre preuve sur l’environnement exploité. Aucune validation distante ou restauration n’est ajoutée par cette mission.

**Aucune mesure Web Vitals terrain, Lighthouse, réseau lent ou débit matériel n’a été réalisée.** Aucune note de performance ni conformité globale n’est déduite de la présence du build. Au dégel : mesurer le chargement mobile Liste/Carte et les replis sans WebGL/tuiles, puis décider du seul ajustement de montage ci-dessus à partir des mesures.
