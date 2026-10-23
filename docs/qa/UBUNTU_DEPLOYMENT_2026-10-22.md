# Déploiement Ubuntu / Cloudflare — 22 octobre 2026

À la demande du propriétaire, le localhost du Mac a été arrêté et le site déployé sur Ubuntu. Domaine définitif corrigé : **https://parking.gilmathis.com**.

## État effectif

- Source applicative `1fdf563b17d4b954435d500f211a0a2169a02bd7`, build Linux final `kEIJcoXo8PKR1eZavY5Sr` sous Node24.22.1.
- Service utilisateur systemd `gp-park.service`, actif et activé au démarrage avec linger ; écoute loopback `127.0.0.1:3010`. Le redémarrage lors du changement d’origine a été exercé et la disponibilité Supabase retrouvée.
- CNAME Cloudflare proxifié et route du tunnel vers3010. HTTP redirige en301 vers HTTPS, en conservant `/connexion?next=%2Fcompte`.
- Site URL et callback Supabase enregistrés puis relus après actualisation. Le callback local antérieur reste conservé.
- Les services `encar-dashboard`, `encar-bot` et `cloudflared-dashboard` restent actifs ; le dashboard local8080 répond200.

## Correction du nom demandée

Le nom initial « parkin » a été remplacé par « parking » dans le DNS, la route du tunnel, la règle HTTPS, l’environnement et le build de l’application, Site URL et les callbacks Auth. Le DNS a été renommé, sans second enregistrement conservé. Vérification du tableau Cloudflare : **0 ligne parkin, 1 ligne parking**. Requête au serveur DNS autoritaire : aucune réponse A pour l’ancien nom et des adresses Cloudflare pour le bon nom. Aucun alias ni redirection de l’ancien nom n’est conservé.

## Vérifications réellement exécutées

- Build de production et typage Linux réussis. Suite sur Ubuntu : **233 tests,230 réussis,0échec,3conditionnels ignorés**. Cette suite précède la seconde construction qui modifie seulement l’origine canonique ; le build final a ensuite reçu sa propre recette HTTP et navigateur.
- **17 contrôles HTTP publics réussis** depuis Ubuntu, avec DNS normal et TLS vérifié, sans substitution de résolution. Voir `ubuntu-deployment/http-smoke.json` : accueil, comptes/dépôt, Supabase prêt, session anonyme, catalogue, refus admin/conversations anonymes, démo indisponible, origine étrangère refusée, politique Auth, noindex et égalité SHA-256 du logo et des deux rendus approuvés.
- Après correction, HTTPS200 et HTTP301 vérifiés depuis le Mac par son DNS normal. L’ancien nom avait initialement subi un cache négatif du réseau du Mac ; cette observation n’est pas utilisée pour le domaine définitif.
- Navigateur intégré sur le domaine définitif : page et carte3D de Paris rendues, zéro erreur console capturée, capture `ubuntu-deployment/public-site.png`.
- Captures de configuration : `ubuntu-deployment/cloudflare-dns.png` et `ubuntu-deployment/auth-urls.png`.
- Les six CI du code applicatif1fdf563 sont réussies. Un éventuel commit ultérieur de documentation/service a ses propres statuts, distincts du code compilé.

## Données et limites

Le site est connecté à Supabase ; aucune fausse annonce ni aucun personnage administrateur n’a été importé pour remplir le site public. Le catalogue public contient **zéro annonce** à la fin du contrôle. Les rendus approuvés sont livrés et leur intégrité vérifiée ; leur affichage sur une vraie annonce dépend du futur inventaire et du rattachement validé.

Le site est accessible en HTTPS, mais reste sans indexation (`GP_PUBLIC_LAUNCH=false`). Aucun compte humain créé et aucun email envoyé par cette recette ; le pilote réel, l’identité opérateur, la réception email/MFA humaine, la purge CDN différée, les notifications planifiées et la restauration réelle gardent leur statut précédent. Aucun paiement activé.

Les secrets sont conservés dans un fichier privé0600 sur le serveur, sans clé administrative Supabase dans l’application. Le Mac n’héberge plus le site sur3000/3001/3002. L’onglet du nouveau site reste ouvert comme résultat pour le propriétaire.
