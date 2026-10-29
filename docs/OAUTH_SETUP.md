# Connexion Google et Apple — préparation

## État de la livraison

Les parcours d’inscription et de connexion sont implémentés avec le SDK Supabase SSR et PKCE. **Ils ne sont pas activés en production** : le 24 octobre 2026, le coordinateur a confirmé `google=false` et `apple=false` dans les paramètres publics Auth du projet. Le propriétaire n’a pas encore de projet Google Cloud ni de compte Apple Developer. Aucun compte fournisseur, abonnement ou secret fournisseur n’a été créé.

L’application interroge les fournisseurs activés dans Supabase via `/api/auth/oauth/providers`. Seuls Google et Apple peuvent apparaître sur Connexion et Créer un compte. Si le fournisseur est désactivé, si le backend est en démonstration, si les paramètres ne répondent pas ou si le secret de parcours manque, aucun bouton social inutilisable n’est affiché. Email/mot de passe reste indépendant.

La suite de ce chantier a été mise de côté à la demande du propriétaire, pour privilégier les corrections UX et les performances. Avant toute activation, corriger également le fallback du trigger `gp_new_user()` pour les noms fournisseurs d’un seul caractère ; ce cas ne doit pas faire échouer la création du profil. Aucune migration de ce point n’a été appliquée.

## Adresses à configurer

| Réglage | Valeur |
| --- | --- |
| Site URL Supabase | `https://parking.gilmathis.com` |
| Retour du fournisseur vers Supabase | `https://srrmysturoloovpuuojp.supabase.co/auth/v1/callback` |
| Retour Supabase vers GP park | `https://parking.gilmathis.com/api/auth/oauth/callback` |
| Redirect URLs Supabase pour ce parcours et ses paramètres signés | `https://parking.gilmathis.com/api/auth/oauth/callback**` |

Conserver l’autorisation existante `/api/auth/callback**` utilisée par les emails. Ne pas confondre le callback **fournisseur → Supabase** avec le callback **Supabase → application**. Ne pas autoriser globalement tous les domaines ou toutes les pages. Le retour final est reconstruit par le serveur depuis une liste de routes internes.

Le serveur utilise les variables Supabase publiques déjà présentes et `NEXT_PUBLIC_SITE_URL`. **`GP_AUTH_FLOW_SECRET` doit être un secret serveur aléatoire d’au moins 32 caractères**, partagé entre les instances de l’application, sans préfixe `NEXT_PUBLIC_`. Aucun secret OAuth Google/Apple n’est nécessaire dans le navigateur ou le dépôt : les secrets fournisseurs se configurent dans Supabase. Une rotation du secret applicatif invalide les parcours ouverts, y compris les parcours email existants.

## Google

Dans un projet Google Cloud détenu par le propriétaire, configurer la marque et l’écran de consentement Google Auth Platform : GP park, coordonnées de contact, domaine `gilmathis.com`, accueil, confidentialité et conditions réels. Créer un client OAuth de type **Application Web**, origine JavaScript `https://parking.gilmathis.com` et URI de redirection vers le callback **Supabase** du tableau. Renseigner le Client ID et le Client Secret dans Authentication → Sign In / Providers → Google, puis activer ce fournisseur. Tant que l’application Google est en test, contrôler la liste des utilisateurs de test ; suivre les exigences de publication affichées par Google avant ouverture publique. Aucun accès Drive, contacts ou Gmail n’est demandé par GP park. [Guide officiel Google/Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

## Apple

Un compte Apple Developer est nécessaire. Préparer l’App ID avec Sign in with Apple, un **Services ID Web**, le Team ID et une clé de signature. Dans la configuration Web du Services ID, déclarer `srrmysturoloovpuuojp.supabase.co` et le callback **Supabase** du tableau. Configurer le Services ID en premier dans les Client IDs du fournisseur Apple dans Supabase, avec le secret signé. Conserver le fichier `.p8` dans un coffre privé. Le secret Web doit être renouvelé avant son expiration, au plus tard à six mois ; prévoir cette maintenance lors de l’activation.

Apple peut fournir une adresse relais privée et ne fournit pas le nom complet dans ce flux OAuth Web. Le profil GP park utilise alors « Membre », modifiable dans les paramètres ; l’adresse n’est pas utilisée comme nom public. Enregistrer les sources d’email auprès d’Apple pour que les futurs emails GP park puissent atteindre les adresses relais. [Guide officiel Apple/Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple).

## Parcours applicatif

1. L’utilisateur choisit Google ou Apple, puis confirme explicitement les conditions et la lecture de la confidentialité affichées. Le serveur compare les versions courantes.
2. `POST /api/auth/oauth/start` exige la même origine, un fournisseur autorisé et activé et les versions acceptées. Il crée une intention signée de dix minutes en cookie HttpOnly, Secure en HTTPS, SameSite=Lax. Le code PKCE est géré par le SDK ; son `flowId` est lié à l’intention signée.
3. Le callback exige ce cookie et son nonce, échange le code avec **le vérificateur de ce parcours**, vérifie l’identité auprès d’Auth, le compte actif et les claims. Les droits proviennent des tables protégées, jamais des métadonnées du fournisseur. Le trigger existant `gp_new_user()` crée les nouveaux comptes avec le rôle `member`.
4. `gp_accept_terms` enregistre la confirmation explicite. Un changement de version pendant le parcours interrompt la connexion. Aucun nouveau cookie de session n’est livré si l’identité ou le consentement échoue. Une erreur avant échange ne déconnecte pas un compte déjà connecté.
5. Le navigateur revient à l’annonce, aux messages ou à la page interne demandée. Annulation/expiration conduit à Connexion avec une explication concise. Les codes et erreurs internes du fournisseur ne sont pas affichés. Les réponses privées sont sans cache ; les appels serveur OAuth sont bornés et l’application ne rejoue pas une mutation.

## Recette avant activation publique

Les tests automatisés utilisent le SDK SSR réel avec un transport HTTP isolé. `tests/auth-oauth.test.ts` couvre les deux fournisseurs, les boutons activables, l’origine, le consentement, les versions, PKCE et ses parcours concurrents, les redirections, la session existante, l’annulation, le compte suspendu/non confirmé et l’absence de cookie de session après échec. Aucun test ne contacte Google/Apple ni ne crée de vrai compte.

Après configuration fournisseur, tester avec des comptes de recette autorisés : première inscription, déconnexion puis reconnexion, retour à une annonce, refus du consentement fournisseur, expiration, compte Apple avec adresse masquée et nom public. Vérifier en base le rôle membre et la trace d’acceptation, puis vérifier le rendu mobile. Les identités réelles, la délivrabilité et les consoles des fournisseurs **ne sont pas validées par les tests isolés**.

Les opérations sensibles déjà existantes (export, suppression, changement de mot de passe) exigent une réauthentification par mot de passe. Un compte exclusivement social n’en possède pas encore : cette étape n’est ni supprimée ni contournée. Avant une activation commerciale complète de ces comptes, valider la création d’un mot de passe par le parcours email de récupération, ou livrer une réauthentification sociale dédiée. Le SMTP propre à GP park reste différé ; la présente livraison ne prétend pas résoudre sa délivrabilité.

Pour désactiver un fournisseur, le désactiver dans Supabase : il disparaît au prochain chargement du formulaire et le serveur refuse un nouveau démarrage. Aucun changement de rôle, suppression de compte ou migration SQL n’est nécessaire pour cette livraison.
