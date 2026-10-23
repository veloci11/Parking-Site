# Recette Auth et emails — 22 octobre 2026

## Changements

- Connexion et inscription réduites à un formulaire ; suppression des slogans et du panneau promotionnel.
- Inscription possible pour un acheteur sans déclaration de statut vendeur. Le champ de profil reste nullable, conformément au trigger SQL et au snapshot de publication existants.
- Renvoi d’un email de confirmation depuis le formulaire de vérification, avec nouveau challenge PKCE, état signé et message n’exposant pas l’existence du compte.
- Erreurs d’envoi SMTP et limites de fréquence signalées comme échecs ; aucun message de succès quand le fournisseur refuse.
- Récupération : retour attendu conservé lors d’un échange échoué, confirmation du nouveau mot de passe, fermeture de toute session échangée avec un compte ne correspondant pas à l’état signé.
- Quatre modèles email HTML et sujets préparés dans `supabase/templates/auth` (confirmation, récupération, modification d’email, notification de changement de mot de passe). Les deux modèles supplémentaires ne créent ni fonction ni notification activée.

## Vérifications

`npx tsx --test tests/auth-connected.test.ts tests/auth-commands.test.ts` : **10 tests réussis**. Le transport Supabase est strictement isolé, mais le SDK SSR installé est réel. Le banc échoue s’il essaie de joindre un autre hôte.

Les tests exercent l’inscription avec consentement, la correspondance challenge/verifier SHA-256, les cookies Secure/HttpOnly/SameSite, le callback et son retour, le renvoi de confirmation, l’état de récupération, la consommation à usage unique, le rejeu refusé, l’expiration de l’état signé, l’absence de cookie PKCE, le mauvais compte et les refus/limites du fournisseur d’emails.

`npx tsx --test tests/backend-admin-history.test.ts tests/moderation-mfa.test.ts tests/context-reports.test.ts` : **9 tests réussis**. Profils nullables, historique privé, restrictions administrateur, MFA obligatoire, signalement limité au contexte transmis, propriétaire/tiers et décisions ont été revérifiés.

`npm run typecheck` : réussi après les changements Auth.

## Revue indépendante de navigation

Les changements de navigation effectués par l’agent interface conservent les entrées de modération pour modérateur/administrateur et les outils réservés au seul administrateur. Le garde MFA reste actif. La sécurité du compte reste accessible depuis Paramètres. Le suivi des signalements de l’utilisateur est accessible depuis Messages et utilise `/api/report-context/mine`, distinct des routes administratives. Aucun changement des règles d’autorisation ou des RLS n’a été réalisé ici.

## État réel vérifié et limites

Lecture de `/auth/v1/settings` du projet connecté, sans sortie de clé : inscription activée, email activé, confirmation requise, comptes anonymes désactivés. Le coordinateur a constaté dans le dashboard l’absence de SMTP personnalisé et le blocage de l’édition des modèles tant que ce fournisseur n’est pas configuré. Les nouveaux templates sont donc préparés, **pas envoyés ni actifs** à cette étape.

Aucun compte réel n’a été créé, modifié ou supprimé par cette recette ; aucun email envoyé à un utilisateur. Le compte réel observé par le coordinateur est conservé. La réception réelle, le clic depuis une boîte mail, l’expéditeur et le rendu dans des clients email doivent être validés après configuration SMTP. Les tests de transport isolé ne prouvent pas la délivrabilité.
