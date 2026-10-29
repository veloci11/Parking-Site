# Sauvegarde et préparation de restauration

État : outil opérateur optionnel, jamais lancé sur le projet distant pendant cette livraison. Les tests portent sur des fichiers locaux inertes. **Aucune restauration réelle n’est validée.** Le CLI fournit une sauvegarde complète et un plan de restauration vérifié ; la restauration des schémas gérés par Supabase reste une opération manuelle.

## Périmètre et accès

`scripts/backup-project.ts` exporte une archive PostgreSQL personnalisée (`pg_dump`, sans propriétaires ni privilèges), inventorie **tous** les buckets par API Storage, y compris `private-uploads`, `public-approved` et `scene-sources`, puis télécharge leurs objets. Le manifeste conserve les chemins originaux, la confidentialité des buckets, leurs limites et le SHA-256 de chaque fichier. L’archive SQL contient des données personnelles et des informations Auth : conserver l’ensemble chiffré sur un support privé, jamais dans Git ou dans une pièce jointe publique.

Le compte opérateur doit disposer d’un `pg_dump` compatible avec la version du serveur et d’un accès autorisé à la base. Fournir les variables depuis un gestionnaire de secrets ou un environnement local privé :

- `GP_BACKUP_SUPABASE_URL` : URL explicite du projet source.
- `GP_BACKUP_DATABASE_URL` : connexion PostgreSQL du **même** projet, avec encodage URL des identifiants. Vérifier manuellement que projet, hôte et utilisateur correspondent avant exécution.
- `GP_BACKUP_SERVICE_ROLE_KEY` : secret opérateur nécessaire à l’inventaire de tous les objets privés. Il n’est jamais utilisé par l’application ni écrit dans le manifeste. Ne jamais utiliser de variable `NEXT_PUBLIC_…` pour ce secret.
- `GP_PG_DUMP_BIN` : chemin optionnel de `pg_dump` (par exemple l’installation Homebrew).

Les identifiants PostgreSQL sont transmis à `pg_dump` via ses variables PG, jamais dans les arguments de commande affichés. Éviter les terminaux enregistrés et les journaux d’environnement.

## Utilisation

Depuis la racine du dépôt :

```sh
# Lecture du plan seulement : aucun accès distant.
npx tsx scripts/backup-project.ts backup --dir /chemin/prive/sauvegarde-neuve

# Export réel volontaire ; le dossier final doit être neuf et hors du dépôt.
npx tsx scripts/backup-project.ts backup --execute --dir /chemin/prive/sauvegarde-neuve

# Recalcul local de tous les hashes et contrôle des chemins.
npx tsx scripts/backup-project.ts verify --dir /chemin/prive/sauvegarde-neuve
```

Sans `--dir`, le dossier est créé sous `~/.gp-parking-backups/`. Dossiers 0700, fichiers 0600. Une erreur laisse une sauvegarde partielle : sans manifeste final valide, elle n’est pas exploitable comme sauvegarde vérifiée. Le processus doit avoir terminé et `verify` doit réussir avant rotation des anciennes copies. Aucun effacement automatique n’est prévu.

Le dump PostgreSQL utilise son instantané transactionnel, mais l’inventaire Storage n’est pas atomique avec celui-ci. Suspendre les écritures et le worker d’envoi pendant une sauvegarde de référence, ou conserver les versions des objets et refaire une vérification après export. Le résultat signale `consistentSnapshot: false` : il ne promet pas de cohérence interservices sans cette procédure opérateur.

## Préparer une restauration isolée

Définir `GP_RESTORE_SUPABASE_URL` vers **un autre projet de staging**, puis :

```sh
npx tsx scripts/backup-project.ts restore-plan --dir /chemin/prive/sauvegarde-neuve --confirm-destination REF_PROJET_DESTINATION
```

Le CLI vérifie les hashes, refuse le projet source et exige la référence de destination explicite. Cette commande ne modifie aucune base ni aucun objet. Il n’existe pas d’option permettant de contourner ce refus. Elle fournit une procédure manuelle : inspecter d’abord `pg_restore --list database.dump`, restaurer les données et fonctions applicatives avec un accès opérateur restreint, traiter séparément les schémas Auth/Storage gérés par le fournisseur, recréer les buckets avec leur confidentialité, puis envoyer chaque fichier à son chemin exact **par l’API Storage**. Ne pas restaurer aveuglément des tables système sur un projet Supabase initialisé.

Avant acceptation : comparer inventaires et hashes, tester comptes/rôles/RLS, refus des sources privées aux tiers, annonces/photos, correspondances des places et revue des scènes. Conserver les notifications et sorties email désactivées pendant cet essai. Mesurer réellement le délai de restauration avant de fixer un RTO/RPO. Configurer séparément les sauvegardes/PITR du fournisseur et une copie chiffrée hors site ; ce CLI ne sauvegarde pas la configuration des domaines, SMTP, secrets d’hébergement ou services externes.

## Vérification livrée

`tests/backup.test.ts` utilise exclusivement un dossier temporaire : intégrité des octets, détection de corruption, refus des chemins traversants, refus d’une restauration vers le projet source et exigence de confirmation. Aucun compte humain ni projet distant n’est utilisé.
