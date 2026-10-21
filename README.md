# GP park.

Plateforme de vente de parkings : exploration géographique et intérieure, annonces modérées, comptes, photos privées, favoris, comparaison, messagerie et visites.

## Démarrer

Node.js 24 recommandé. `npm ci`, copier `.env.example` vers `.env.local`, puis `npm run dev`. Le serveur de développement écoute exclusivement `http://127.0.0.1:3000`.

- **Mode Supabase** : renseigner `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, garder `GP_FORCE_LOCAL_DEMO=false`, appliquer les migrations `supabase/migrations/` sur un projet dédié, configurer les URL de confirmation/récupération Auth. Aucune clé service-role dans l’application.
- **Mode démo locale** : `GP_FORCE_LOCAL_DEMO=true`. Base SQLite persistante dans `.data/`, comptes d’essai et biens fictifs. Ce mode est interdit sur une origine distante. Ne jamais publier les données de démonstration comme de vrais biens.

Le plan approuvé est dans [docs/plan-construction](docs/plan-construction/README.md). Les actifs originaux et le logo sélectionné sont conservés ; Inter est chargée localement.

## Vérifier

```sh
npm run typecheck
npm test
npm run build
```

Les tests HTTP sont activés séparément avec `GP_ACCOUNT_TEST_URL=http://127.0.0.1:3000 npm test` sur un serveur **de recette isolé** en mode démo. La CI prépare son propre serveur et sa propre base. Les assertions de conception dans `docs/plan-construction/VERIFICATION.md` concernent le dossier, pas le fonctionnement de l’application.

## Architecture

Next App Router / React / TypeScript strict ; Supabase Auth + PostgreSQL/PostGIS/RLS + Storage ; MapLibre/OpenFreeMap ; Three.js/React Three Fiber. Une API commune dessert les adaptateurs Supabase et démo locale. Prix en centimes, prix total d’un lot, surfaces inconnues `null`, mutations versionnées, projection publique explicite, révisions modérées.

## Périmètre et lancement

V1 gratuite. **Aucune facturation ni abonnement Stripe actif** : les forfaits mensuels sont réservés à la V2. Aucun encaissement du prix immobilier. Les scènes de démonstration sont schématiques ; un parking réel exige ses plans, mesures, photos et une validation. Les contenus opérateur/légaux et la marque nécessitent validation avant ouverture. `GP_PUBLIC_LAUNCH=false` maintient le site hors indexation.

Voir [statut détaillé](docs/IMPLEMENTATION_STATUS.md), [exploitation](docs/OPERATIONS.md) et [sources](docs/plan-construction/09_DECISIONS_ET_SOURCES.md). Les limites et vérifications effectivement exécutées y sont distinguées du travail encore nécessaire avant production.

Pour ouvrir les deux prévisualisations simultanément : `npm run build`, puis `npm run preview:demo` et `npm run preview:connected` dans deux terminaux. Les deux serveurs lisent le même build et ne réécrivent pas les fichiers générés de développement. Éviter deux processus `next dev` avec des `distDir` différents dans le même checkout : les déclarations TypeScript générées sont partagées.
