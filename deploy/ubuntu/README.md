# GP park sur Ubuntu

Application : https://parking.gilmathis.com — service utilisateur `gp-park.service`.

## Installation actuelle

- Hôte SSH : `ubuntu`, utilisateur `mathis`, gestionnaire systemd utilisateur avec linger actif.
- Racine : `/home/mathis/gp-park/`.
- Source applicative : commit `1fdf563b17d4b954435d500f211a0a2169a02bd7`.
- Release courante : `releases/20261022-1fdf563-parking`, lien `current`.
- Build Linux : `kEIJcoXo8PKR1eZavY5Sr` ; Node 24.22.1 Linux x64 vérifié par SHA-256 officiel sous `runtime/node`.
- Configuration privée : `shared/production.env`, droits 0600. Ne jamais copier son contenu dans Git ou les logs.
- Next écoute uniquement `127.0.0.1:3010`. Cloudflare Tunnel `encar-dashboard` route uniquement ce nom vers ce port ; la route du dashboard existant reste intacte.
- Cloudflare CNAME proxifié `parking.gilmathis.com`, redirection HTTP → HTTPS limitée à cet hôte avec chemin et paramètres conservés.
- Supabase Auth : Site URL `https://parking.gilmathis.com`, redirection `https://parking.gilmathis.com/api/auth/callback**`. La redirection locale préexistante reste conservée.
- Démo et personnages désactivés. Données et comptes dans Supabase, sans service-role dans l’application.
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

Voir [preuve HTTP](../../docs/qa/ubuntu-deployment/http-smoke.json) et [rapport de déploiement](../../docs/qa/UBUNTU_DEPLOYMENT_2026-10-22.md). Les prérequis humains, la validation sur un vrai parking, l’envoi email réel, la purge CDN différée et les workers opérateur ne sont pas déduits d’un hébergement fonctionnel.
