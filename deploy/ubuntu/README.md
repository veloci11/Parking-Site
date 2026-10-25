# GP park sur Ubuntu

Application : https://parking.gilmathis.com — service utilisateur `gp-park.service`.

## Installation actuelle

- Hôte SSH : `ubuntu`, utilisateur `mathis`, gestionnaire systemd utilisateur avec linger actif.
- Racine : `/home/mathis/gp-park/`.
- Source applicative : commit `84a6246a75eaf0d3501ec2adf0a5c5db1c583589`.
- Release courante : `releases/20261025-84a6246-listing-details`, lien `current`.
- Build Linux : `flE3vcutQb7xkl0d8j_Sg` ; Node 24.22.1 Linux x64 vérifié par SHA-256 officiel sous `runtime/node`.
- Configuration privée : `shared/production.env`, droits 0600. Ne jamais copier son contenu dans Git ou les logs.
- Next écoute uniquement `127.0.0.1:3010`. Cloudflare Tunnel `encar-dashboard` route uniquement ce nom vers ce port ; la route du dashboard existant reste intacte.
- Cloudflare CNAME proxifié `parking.gilmathis.com`, redirection HTTP → HTTPS limitée à cet hôte avec chemin et paramètres conservés.
- Supabase Auth : Site URL `https://parking.gilmathis.com`, redirection `https://parking.gilmathis.com/api/auth/callback**`. La redirection locale préexistante reste conservée.
- Backend local et personnages désactivés. Comptes et annonces réelles dans Supabase, sans service-role dans l’application. `GP_PUBLIC_SHOWCASE=false` : quatre annonces réelles publiées et sept photos ; les exemples fictifs ne sont pas visibles.
- `GP_PUBLIC_LAUNCH=false` : pas d’indexation tant que les prérequis métier et humains ne sont pas validés. Cela ne restreint pas l’accès au site HTTPS.

## Commandes opérateur

```sh
ssh ubuntu 'systemctl --user status gp-park.service --no-pager'
ssh ubuntu 'journalctl --user -u gp-park.service -n 50 --no-pager'
ssh ubuntu 'systemctl --user restart gp-park.service'
curl -fsS https://parking.gilmathis.com/api/ready
```

Le service redémarre automatiquement après une panne et au démarrage de l’hôte. Il ne nécessite ni terminal local ouvert ni processus Next sur le Mac. Ne pas redémarrer les autres services du serveur pour mettre à jour GP park.

## Mise à jour et retour arrière

Créer une nouvelle release depuis un commit Git propre, sans `.data`, `.env.local`, `.git` ni données de démonstration privées. Installer les dépendances et construire sur Linux avec Node 24 et la même origine canonique HTTPS ; les variables `NEXT_PUBLIC_` sont intégrées au build. Configurer le fichier privé hors Git, puis exécuter `npm ci` et `npm run build` dans la nouvelle release. Vérifier avant de déplacer le lien `current` et de redémarrer le seul service `gp-park`.

Après bascule : `/api/ready`, session anonyme, catalogue, refus des personnages de démo et des API privées, connexion, carte, assets approuvés, redirection HTTPS et logs. Une ancienne release construite pour un autre nom de domaine doit être reconstruite avec l’origine correcte avant réutilisation. Les migrations et données Supabase restent distinctes du retour arrière applicatif ; aucune base ne doit être restaurée ou supprimée pour ce seul changement de release.

## État de recette

État courant : [livraison du 24 octobre](../../docs/qa/production-readiness-2026-10-24/RELEASE.md), [contrôles HTTP live](../../docs/qa/production-readiness-2026-10-24/live-http-checks.json) et [contrôles mobile live](../../docs/qa/production-readiness-2026-10-24/live-mobile-checks.json). Les anciens rapports datés restent historiques. Les prérequis humains, la validation sur un vrai parking, l’envoi email réel, la purge CDN différée et les workers opérateur ne sont pas déduits d’un hébergement fonctionnel.
