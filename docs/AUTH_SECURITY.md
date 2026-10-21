# Authentification et déclarations versionnées — V1 locale

Le module `src/server/auth-commands.ts` utilise Supabase Auth avec les cookies SSR. Le mode démo reste séparé, limité à la boucle locale, et ne prouve pas la livraison d’un email réel.

## Configuration avant ouverture

- Appliquer la migration `20261021183814_auth_commands_consent.sql` après revue et conserver les migrations précédentes.
- Configurer **GP_AUTH_FLOW_SECRET**, secret serveur aléatoire d’au moins 32 caractères, dans le gestionnaire de secrets de chaque environnement. Ne pas l’exposer avec un préfixe `NEXT_PUBLIC_`, le journaliser ni le committer. Le placeholder `.env.example` n’est pas une valeur exploitable. La rotation invalide les liens et autorisations de récupération encore ouverts.
- Garder le callback externe **`/api/auth/callback`** sur l’origine canonique autorisée dans Supabase. Les emails d’inscription et de récupération pointent vers ce chemin, avec un état signé. Aucun autre callback fournisseur n’est requis.
- Compléter et valider les documents de l’opérateur avant ouverture ; les versions actuelles `2026-10-21-v1-preparation` sont explicitement des documents de préparation. Mettre à jour ensemble les documents publiés et `gp_auth_policy()` dans une migration. Une acceptation n’est pas une certification juridique, d’identité ou de propriété.

## Parcours et protections

L’inscription reçoit les versions présentées et une confirmation explicite. Le serveur compare ces versions à sa politique courante avant l’appel Auth. Un trigger enregistre la déclaration initiale immuable ; modifier ultérieurement les métadonnées Auth ne réécrit pas cette trace. Les anciens comptes restent sans acceptation jusqu’à une démarche explicite dans leurs paramètres. Les données sont visibles uniquement par leur propriétaire via RLS.

Les retours après connexion passent par une liste de pages internes autorisées. Les paramètres de recherche et l’intention de contact admis sont reconstruits ; URLs externes, chemins API, séparateurs encodés et contrôles sont refusés. La préparation locale d’annonce et le texte de contact restent dans le stockage de session du navigateur, sans créer de session Auth ou envoyer de message automatiquement.

La récupération exige un état signé de type récupération, lié au compte par un digest HMAC sans adresse email en clair, et un échange PKCE réussi dont le marqueur du vérificateur est explicitement `recovery`. Un code de confirmation ordinaire et l’état de récupération d’un autre compte sont refusés. Le serveur vérifie l’utilisateur via Auth et les claims JWT avec le SDK avant d’émettre une autorisation HttpOnly de 15 minutes, liée à l’utilisateur et à l’identifiant de session. Une session ordinaire, un paramètre `next=/reinitialiser` ou un état d’inscription ne permettent pas une réinitialisation. Le nonce est consommé une seule fois en base avant la modification du mot de passe. Un échec du fournisseur après consommation nécessite un nouveau lien ; aucun succès n’est affiché sans réponse positive d’Auth.

Le changement depuis les paramètres vérifie réellement le mot de passe actuel dans un client Auth isolé, puis effectue la modification avec la session courante afin de conserver son niveau MFA. Il ferme ensuite la session courante. L’interface ne promet pas la révocation immédiate de tous les JWT déjà émis ailleurs.

Les anciennes branches Supabase d’inscription, récupération, réinitialisation et callback délèguent au même module. Les anciennes routes de démo restent pour les jeux de données locaux, sans accès au mode connecté. Les réponses privées utilisent `Cache-Control: private, no-store`. Ni les codes PKCE, états signés, secrets TOTP ni mots de passe ne doivent être inclus dans les rapports ou captures.

La migration025 définit `gp_private.configuration.mfa_required=true` : modération et administration connectées exigent une session AAL2 en plus du rôle, de l’activation du compte et de la vérification email. Les RPC et policies RLS consomment ce réglage privé ; les membres ne peuvent pas le désactiver. Le registre et les dérogations de quotas conservent leur garde AAL2 explicite. `GP_REQUIRE_ADMIN_MFA=true` dans l’exemple ajoute un contrôle applicatif. La démonstration SQLite en boucle locale conserve son exception déclarée sans faux TOTP. L’enrôlement et la récupération des opérateurs humains restent à réaliser ; l’application de la migration ne les effectue pas.

## Preuves et limites

- `tests/auth-commands.test.ts` : retours autorisés/refusés, signatures altérées/expirées, consentement obligatoire et versions, enregistrement démo, ancien mot de passe requis, fermeture de session, retour sûr après callback invalide.
- `supabase/tests/auth-commands-consent.sql` : trigger de déclaration, absence d’acceptation automatique, RLS, refus des versions obsolètes et confirmations nulles, consommation liée à la session, replay et privilèges directs. Exécution réelle sous transaction annulée ; aucun appel réseau Auth ni email.
- `supabase/tests/moderation-mfa-default.sql` : politique installée par025, refus AAL1, permissions distinctes modérateur/admin en AAL2, refus d’un membre et de comptes non vérifiés/suspendus, lecture privée protégée et impossibilité de désactiver le réglage ; transaction annulée, aucun secret TOTP.
- Le parcours email complet inscription → clic reçu → retour, et récupération → clic → nouveau mot de passe, reste à vérifier avec le fournisseur configuré avant ouverture. Les tests SQL et démo ne remplacent pas cette recette.
