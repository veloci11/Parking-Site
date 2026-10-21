# 05 — Architecture, modèle de données et contrats serveur

## 1. Stack retenue pour réduire le nombre de systèmes

| Couche | Choix | Responsabilité |
|---|---|---|
| Application | Next.js App Router, React, TypeScript strict | Pages publiques indexables, espace compte, administration, API |
| UI | CSS variables issues des tokens + Tailwind ; primitives accessibles réutilisables | Respect de la charte, composants communs |
| Formulaires | React Hook Form + Zod | Champs, étapes, schémas partagés ; validations finales côté serveur |
| Données et identité | Supabase : PostgreSQL, Auth, Storage | Une base relationnelle, sessions et fichiers |
| Géographie | PostGIS | Index géographiques et recherches de zone [documentation](https://supabase.com/docs/guides/database/extensions/postgis) |
| Carte ville | MapLibre GL JS + OpenFreeMap | Carte vectorielle et volumes de bâtiments |
| Scène intérieure | Three.js + React Three Fiber, glTF/JSON | Niveau, sélection d’unités et annotations |
| Courriels | SMTP transactionnel configurable, fournisseur arrêté au lancement | Vérification email et notifications ; jamais de serveur email artisanal |
| Jobs | Table de jobs + worker applicatif séparé et planificateur | Images, courriels, nettoyage, expiration et publication d’assets |
| V2 facturation | Stripe Billing + Checkout abonnement + Customer Portal | Mensualités, statut, gestion et factures |
| Vérification | Vitest, Testing Library, Playwright, contrôles d’accessibilité | Logique métier, permissions et parcours |

Choisir au démarrage les versions stables compatibles, puis les verrouiller dans un lockfile et consigner leurs numéros. Ne pas installer arbitrairement « latest » à chaque déploiement. Le dossier n’invente pas de versions actuellement installées : aucun projet applicatif n’est initialisé.

Next peut être hébergé sur un service compatible Node ; PostgreSQL/Storage dans une région UE adaptée au projet. Hébergeur et offre commerciale à choisir avec les coûts réels. Pas de microservices, Elasticsearch, Redis ni application mobile native en V1 sans besoin mesuré.

## 2. Modules et dépendances

```text
app public / compte / admin
          ↓
domain : identity, listings, catalog, geography, parking-scenes,
         quality, conversations, moderation, entitlements
          ↓
services : database, object-storage, mail, jobs, map-provider
          ↓
PostgreSQL + Auth + Storage

V2 billing → entitlements
```

Les scènes ne calculent aucun droit de publication. La facturation ne modifie pas les plans d’un parking. La carte reçoit des objets publics minimaux, pas les lignes privées de la base. Les validations métier ne sont pas dupliquées dans les composants.

## 3. Arborescence cible du futur code

```text
src/app/(public)/explorer, annonces, parkings, comparer
src/app/(auth)/connexion, inscription, reinitialiser
src/app/(account)/compte
src/app/(admin)/admin
src/app/api/v1
src/components/ui/                # primitives communes
src/features/{identity,listings,catalog,map,parking3d,quality,messages,admin,billing}
src/domain/{schemas,policies,types}
src/lib/{supabase,storage,mail,observability}
src/styles/tokens.css             # généré depuis les tokens
supabase/migrations/              # schéma, fonctions, RLS, index
workers/                         # jobs et traitement des médias
tests/{unit,integration,e2e,fixtures}
public/brand, public/fonts
```

Cette structure est une spécification, pas un dossier déjà créé ou déployé. Une feature n’importe pas directement le code interne d’une autre : utiliser ses contrats métier.

## 4. Entités principales

Conventions : UUID pour identifiants, horodatages UTC `timestamptz`, argent en centimes entiers EUR, longueurs en mm dans les fiches et en mètres dans la scène, surfaces en `numeric`, valeurs inconnues `NULL`. Affichage français via `Intl`. `created_at`, `updated_at`, `row_version` sur les objets modifiables. Contraintes et transitions validées en base ou dans une fonction transactionnelle.

| Table | Champs structurants et règles |
|---|---|
| `profiles` | `user_id` = Auth, nom public, type particulier/professionnel, préférences ; aucune colonne de rôle auto-modifiable |
| `account_statuses` | user_id, active/suspended/deletion_pending/deleted ; modifiable seulement par procédure contrôlée |
| `app_roles` | user_id, member/moderator/admin, accordé par, date ; aucun write client |
| `private_contacts` | user_id, téléphone, coordonnées et préférences ; jamais dans un select public |
| `seller_profiles` | user_id, type, raison sociale et identifiants utiles si professionnel ; statut de vérification distinct et périmètre précis |
| `parkings` | id, référence interne, métadonnées communes, public_name assaini ; le consentement de localisation publique reste porté par chaque révision d’annonce, pas globalement par le parking ; géométrie/nom non validés non publics |
| `parking_private_locations` | parking_id, adresse exacte, point exact PostGIS, documents ; accès très limité |
| `parking_contributors` | parking_id, user_id, périmètre accordé ; ne donne pas accès aux contacts ou unités d’un autre vendeur |
| `parking_levels` | id, parking_id, code, altitude locale, libellé, ordre |
| `spaces` | id stable, level_id, numéro de place, référence lot privée, dimensions physiques et source ; modifications canoniques administrées |
| `listings` | id, seller_id, lifecycle_state, current_published_revision_id nullable, disponibilité confirmée, dates de fin ; ne contient pas tout le contenu en clair public |
| `listing_revisions` | id, listing_id, revision_no, submission_state, titre, description, prix_total_cents, quantité, occupation, infos vendeur, localisation souhaitée ; snapshots commerciaux immuables après soumission |
| `revision_units` | revision_id, id local, space_id nullable, dimensions et références soumises, part du lot ; brouillon tant que non rapproché |
| `listing_space_links` | listing_id, revision_id, space_id ; lien approuvé avec le bon modèle ; ensemble de places explicitement couvert |
| `active_space_claims` | space_id UNIQUE, listing_id ; créé/libéré transactionnellement pour empêcher deux publications actives de la même unité canonique |
| `quality_observations` | parking/level/space/revision cible, catégorie, valeur structurée, source, date, auteur et photos ; périmètre déclaré/documenté/mesuré |
| `media_assets` | propriétaire, cible, visibilité, état quarantine/processing/ready/rejected, object_key, hash, mime réel, taille, variantes, date de prise connue |
| `revision_media` | revision_id, media_id, ordre, couverture, légende ; une couverture publique obligatoire |
| `media_space_links` | media_id + space_id, périmètre de preuve, légende ; photo de groupe possible sans duplication du fichier |
| `private_documents` | propriétaire et dossier, asset_id, finalité, échéance de rétention ; aucun lien public |
| `scene_versions` | parking_id, level_id, version, fidélité, statut, manifest_key, model_key, sources, revue et approbateur |
| `scene_space_links` | scene_version_id, space_id, mesh_name ; unique par version/space ; cardinalité vérifiée |
| `published_listings` | projection publique minimale, immutable par le client ; seulement champs autorisés, position publique, révision et médias approuvés |
| `favorites` | user_id + listing_id UNIQUE |
| `conversations` | id, listing_id, buyer_id, seller_id, état ; UNIQUE(listing_id,buyer_id,seller_id) |
| `messages` | id, conversation_id, sender_id, corps texte, created_at, client_request_id unique par émetteur ; pièces jointes hors V1 |
| `visit_requests` | conversation_id, message_id, créneaux proposés facultatifs, requested/accepted/declined/canceled, row_version, horaire confirmé nullable et fuseau explicite ; ne crée pas de réservation immobilière |
| `reports` | auteur, cible, catégorie, détails, état, modérateur ; pas public |
| `moderation_cases` | objet/version, décision, motif, acteur, date ; journal non réécrit par le vendeur |
| `notifications` | user_id, catégorie, objet, lu, préférence ; contenu privé minimal |
| `notification_outbox` | type, payload minimal, destinataire, dedupe_key UNIQUE, essais, état ; assure envoi après transaction |
| `audit_events` | acteur, action, cible, avant/après redigé, timestamp, request_id ; accès restreint |
| `jobs` | type, cible, version, déduplication, état, tentatives, next_run_at ; prise en charge verrouillée |
| `plan_definitions`, `plan_entitlements` | droits configurables, V1 profil gratuit ; tarifs V2 séparés |
| `account_entitlement_overrides` | exceptions explicites et datées, motif, administrateur ; aucune exception cachée pour Mathis |

V2 ajoute `billing_customers`, `subscriptions`, `subscription_items`, `billing_events`, `billing_price_versions`, `entitlement_snapshots`. Les noms et contrats sont prévus maintenant ; les secrets, endpoints de paiement et tables opérationnelles Stripe ne sont activés qu’en V2.

## 5. Projection publique et confidentialité

Ne pas exposer une table privée puis masquer des champs en CSS. `published_listings` est alimentée uniquement par une transaction de publication qui copie une liste blanche. Elle omet adresse exacte non consentie, documents, emails, coordonnées privées, notes de modération et références de titre privées.

La géométrie publique est distincte du point exact. Le choix `area` utilise un point de secteur stable et un libellé explicite, pas un bruit aléatoire récupérable par moyennage. Aucune URL de modèle, métadonnée, image EXIF, API de clustering ou recherche par distance ne doit révéler le point exact caché. Un modèle intérieur public est assaini et ne contient aucun secret d’accès. En V1, les annonces `area` n’exposent pas de scène partagée ni de parking_id/level_id/space_id canoniques publics ; leurs DTO utilisent seulement des identifiants de présentation propres à l’annonce. Les routes publiques parking/niveau/scène n’acceptent que des contextes exact_opt_in approuvés et ne font aucun lien vers annonces area, même si le parking est partagé. Contrôler la même séparation dans géométries, manifestes, recherche et caches.

## 6. Index et cohérence

- Index GiST sur position publique et, séparément, position privée restreinte ; recherche publique exclusivement sur la première.
- Index `(lifecycle_state,published_at,id)`, `(seller_id,updated_at)`, prix, type, quantité selon requêtes mesurées ; FTS français avec index GIN sur projection publique.
- FK strictes, contraintes d’unicité des favoris et conversations ; unicité des révisions par annonce ; une seule version de scène active par niveau.
- Suppression logique de publication, purge différée des données selon politiques ; `ON DELETE` explicitement choisi pour chaque relation.
- Contrôle optimiste `If-Match`/`row_version` sur brouillons ; conflit 409 au lieu d’un écrasement silencieux.

## 7. API V1

Préfixe `/api/v1`. Réponses JSON ; DTO publics/privés distincts ; erreurs `{error:{code,message,fields?,requestId}}`. Codes stables : `UNAUTHENTICATED`, `EMAIL_UNVERIFIED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `VERSION_CONFLICT`, `QUOTA_EXCEEDED`, `PUBLICATION_NOT_AVAILABLE`, `RATE_LIMITED`, `SCENE_NOT_READY`. Jamais de stack SQL au client.

| Méthode et route | Usage | Autorisation |
|---|---|---|
| GET `/catalog/listings` | Filtres, tri, curseur ; champs publics | Public |
| GET `/catalog/map` | bbox validée, regroupements/points publics, précision annoncée | Public |
| GET `/catalog/listings/:id` | Fiche publiée et état courant | Public |
| GET `/catalog/parkings/:id/levels` | Niveaux et unités publics autorisés | Public après contrôle de visibilité |
| GET `/catalog/levels/:id/scene` | Manifest et asset assaini de version active | Même contrôle ; pas de source privée |
| GET `/me`, PATCH `/me/profile` | Profil autorisé ; whitelist de champs | Membre actif |
| POST `/listings` | Nouveau brouillon vide, seller_id imposé par session | Membre actif |
| GET `/me/listings`, GET `/listings/:id/draft` | Annonces personnelles et brouillons | Propriétaire ou modérateur autorisé |
| PATCH `/listings/:id/draft` | Sauvegarde avec row_version | Propriétaire |
| POST `/listings/:id/submit` | Contrôles complets et entrée en modération | Propriétaire + email vérifié |
| POST `/listings/:id/lifecycle` | pause/sold/withdraw et confirmations | Propriétaire, transitions autorisées |
| POST `/uploads/intents` | Jeton court de dépôt privé, type et taille bornés | Propriétaire du dossier |
| POST `/uploads/:id/complete` | Vérifier objet réel et lancer traitement ; idempotent | Même propriétaire |
| PUT / DELETE `/favorites/:listingId` | Ajouter/retirer sans doublon | Membre actif |
| POST `/conversations` | Créer/réutiliser conversation sur annonce publiée | Acheteur actif vérifié, différent du vendeur |
| GET `/conversations`, GET `/conversations/:id/messages` | Messages paginés | Participants seulement |
| POST `/conversations/:id/messages` | Texte + client_request_id | Participant autorisé ; blocage/annonce contrôlés |
| POST `/conversations/:id/visit-requests` | Message structuré de demande | Acheteur participant |
| POST `/visit-requests/:id/decision` | Accepter/refuser côté vendeur ; annuler côté participant ; expectedVersion et horaire confirmé facultatif validé | Participants selon action, jamais un tiers |
| POST `/reports` | Signalement borné et dédupliqué | Membre ; support public anti-abus séparé |
| POST `/admin/revisions/:id/decision` | approve/changes_requested/reject | Modérateur habilité |
| POST `/admin/scenes/:id/approve` | Contrat, preuves et mapping vérifiés | Administrateur de scène |
| POST `/me/export`, DELETE `/me` | Démarrer export/suppression, réauthentification sensible | Propriétaire |

## 8. Exemples de contrats

```json
{
  "id": "listing_uuid",
  "revision": 3,
  "title": "Deux places couvertes",
  "saleMode": "bundle",
  "spaceCount": 2,
  "totalPriceCents": 3100000,
  "currency": "EUR",
  "location": {"city":"Lyon","precision":"area","coordinates":[4.86,45.76]},
  "areaPerSpaceM2": {"min":null,"max":null,"knownCount":0,"totalCount":2},
  "totalAreaM2": null,
  "scene": {"available":false,"fidelity":"photos_only","reason":"location_area"},
  "availability":"published",
  "isDemo":true
}
```

La position ci-dessus est un exemple de secteur et non l’adresse d’un bien réel. Réponse de liste : `{items,nextCursor,totalEstimate,filtersApplied}` ; `totalEstimate` explicitement estimé si applicable. Curseur opaque et stable fondé sur la clé de tri + id ; bornes de pagination validées.

## 9. Transactions et situations concurrentes

**Publication** : verrouiller annonce et révision → vérifier état compte/droits → vérifier unités, conflits et quota → approuver médias et mapping → écrire claims et projection publique → basculer révision courante → événement outbox → commit. Si une étape échoue, rien n’est partiellement publié.

**Mise à jour** : créer/éditer un brouillon distinct ; la soumission fige son contenu. En cas de correction, nouvelle révision ou réouverture contrôlée sans modifier une version auditée. Une décision portant sur une vieille version échoue en conflit.

**Vendu/retrait** : retirer immédiatement de la recherche, libérer les claims appropriés, conserver les références minimales des conversations, invalider les caches ; ne pas supprimer les messages de l’acheteur. La scène géométrique peut rester pour d’autres unités, mais l’ancien prix n’est plus actif.

**Upload** : l’asset public n’existe qu’après traitement/revue ; un callback répétitif ne crée pas plusieurs variantes. Les brouillons abandonnés et objets orphelins sont nettoyés par un job à échéance documentée.

## 10. Sessions, clés et migrations

Utiliser le modèle SSR officiel de Supabase, clients serveur et navigateur séparés, sessions vérifiées côté serveur ; ne pas faire confiance à un objet session non validé pour autoriser une mutation. [Guide SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs).

Clé publiable côté navigateur seulement avec RLS correctement activée. Secret service-role, SMTP et futurs secrets Stripe : serveur/worker uniquement. Rôle modérateur lu dans une source serveur contrôlée, jamais dans des métadonnées utilisateur éditables.

Migrations SQL numérotées, relues, appliquées d’abord en local puis staging. Sauvegarde avant opération à risque ; migration de données testée sur copie. Types TypeScript générés depuis le schéma. Les endpoints côté navigateur n’obtiennent pas un accès administratif générique pour contourner la RLS.
