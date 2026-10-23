# Disponibilité et maintenance

## Disponibilité indépendante du contenu

La première publication contrôlée ouvre 90 jours de disponibilité. Le vendeur actif, avec email confirmé, peut reconfirmer une annonce publiée avant l’échéance via `POST /api/listings/:id/availability`, corps `{ "version": 3 }`. Le serveur contrôle propriétaire, version et compte. La confirmation ajoute 90 jours à partir du moment courant et incrémente la version, sans modifier la date du contenu ou l’ordre de publication.

Une modification ordinaire ou la revue d’une modification pendant une période encore valide ne repousse pas l’échéance. À échéance, les lectures publiques d’annonces, le contact et les scènes sont refusés immédiatement par SQL, même si le job n’a pas encore tourné. Le job clôt ensuite la publication, libère les revendications actives et marque l’annonce `expired`. Une annonce expirée doit être éditée puis resoumise à la modération : la confirmation ou la reprise d’une pause ne la réactive pas. Une approbation après expiration ouvre une nouvelle période.

Les dates exposées sont `availabilityConfirmedAt` et `availabilityExpiresAt`. L’historique des révisions et les pièces privées sont conservés. Le mécanisme Supabase est l’implémentation de production ; la démo locale teste le point de confirmation, et n’installe aucun ordonnanceur distant.

## Job opérateur volontaire

Variables privées : `GP_MAINTENANCE_SUPABASE_URL` et `GP_MAINTENANCE_SERVICE_ROLE_KEY`. Ce secret de maintenance est distinct de la configuration publique de l’application, ne doit jamais figurer dans Git, et ne s’utilise que dans un environnement opérateur restreint. La migration `20261021182000_availability_maintenance.sql` réserve les fonctions de job à `service_role`, sans autorisation `anon` ou `authenticated`.

```sh
# Plan seulement : aucune mutation, aucun envoi.
npx tsx scripts/maintenance.ts

# Exécution uniquement pour une sélection explicite de 1 à 100 UUID distincts.
npx tsx scripts/maintenance.ts --execute --ids UUID_1,UUID_2 --policy availability-v1-retention-observe
```

Planifier la lecture/exécution opérationnelle au moins quotidiennement selon les volumes, après configuration et recette du système d’exploitation/hébergement. **Aucun ordonnanceur n’est installé ou activé par ce fichier.** L’opérateur prépare les IDs du plan puis lance une sélection bornée ; il n’existe pas de `--all` implicite.

Les rappels J-14 et J-3 utilisent l’outbox et une clé stable composée de l’annonce et de son échéance. Répéter un lot ne crée pas de notification en double. Si une première exécution survient seulement à J-3, elle produit le rappel J-3, sans envoyer un rappel J-14 déjà dépassé. Le worker d’email conserve ses propres conditions explicites d’activation ; ce job n’envoie pas directement d’email.

Après expiration, le job supprime la projection publique par SQL puis retire les objets correspondants du bucket `public-approved` **par l’API Storage**. Il ne supprime jamais `storage.objects` directement. Les objets sources privés restent conservés. Un verrou `availability_cleanup_pending` empêche une nouvelle publication jusqu’à la fin de cette suppression, évitant de supprimer une image venant d’être republiée. Une erreur Storage laisse l’annonce masquée et le verrou actif ; reprendre les mêmes IDs après correction. La finalisation contrôle à nouveau la version. Des éditions concurrentes peuvent demander une nouvelle exécution bornée.

La suppression des objets publics révoque leur accès à l’origine après le passage du job. Les fichiers déjà téléchargés et les caches externes ne peuvent pas être rappelés ; un délai de cache peut subsister. Les routes applicatives et les scènes sont masquées dès l’échéance.

## Rétention : observation uniquement

Le plan signale au maximum 100 candidats de chaque catégorie :

- brouillons sans publication de plus de 180 jours ;
- médias de plus de 7 jours non référencés dans les brouillons, dernières publications, révisions, projections publiques ou scènes ;
- sources de plans de plus de 7 jours sans modèle référent ;
- fichiers d’export de plus de 7 jours, si `GP_EXPORT_PATH` désigne explicitement leur dossier privé. Seuls le hash du nom et la taille sont affichés.

**Aucune purge de rétention n’est implémentée ni activée.** Les historiques de vente, messages, pièces justificatives, audits et obligations légales ne font l’objet d’aucune suppression automatique. Les seuils ne constituent pas une politique juridique validée. Une purge ultérieure nécessite une politique approuvée, des exclusions pour conservation obligatoire, un aperçu, une sélection bornée et des contrôles de références renouvelés au moment de la suppression.

## Vérification et limites de livraison

`tests/lifecycle.test.ts` couvre les seuils, la période exacte et le point de confirmation dans une base SQLite temporaire : droits, version, expiration et compte suspendu. La migration a également été compilée dans une instance PostgreSQL 14 isolée ; une transaction de fixtures fictives annulée a vérifié première publication, rappels idempotents, masquage à échéance, interdiction de reprise, clôture, verrou Storage et remise en revue. Les helpers de rôle/JWT de ce banc sont des substituts locaux ; ce test ne prouve pas un déploiement Supabase réel.

Aucune maintenance n’a été lancée sur les données distantes ou humaines durant cette livraison. L’application de la migration et la configuration du calendrier opérationnel restent des actions distinctes.
