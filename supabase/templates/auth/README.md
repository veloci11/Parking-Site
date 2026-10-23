# Emails d’authentification GP park

Modèles HTML pour Supabase Auth, avec le logo GP existant, un fond blanc, un bouton violet et des textes français courts. `manifest.json` contient les sujets à utiliser.

| Supabase → Authentication → Emails          | Fichier                 |
| ------------------------------------------- | ----------------------- |
| Confirm signup                              | `confirmation.html`     |
| Reset password                              | `recovery.html`         |
| Change email address                        | `email-change.html`     |
| Password changed (notification de sécurité) | `password-changed.html` |

Les deux derniers modèles sont prêts pour les fonctions correspondantes mais ne créent ni parcours de changement d’adresse ni activation automatique d’une notification.

## Installation

Configurer d’abord un fournisseur SMTP dédié au domaine autorisé par le propriétaire. Copier ensuite le HTML complet et son sujet dans chaque écran Supabase correspondant. Désactiver la réécriture/suivi des liens chez le fournisseur SMTP. Ne pas committer de clé ou de mot de passe SMTP.

Conserver `{{ .ConfirmationURL }}` tel quel pour confirmation, récupération et changement d’adresse. Ce lien contient le jeton Supabase et la redirection fournie par l’application ; le remplacer par `{{ .SiteURL }}` ou construire un lien sans état signé casse le parcours PKCE. Le navigateur de départ doit conserver son cookie de vérification, d’où la consigne concise dans les emails de confirmation et récupération.

Origine canonique : `https://parking.gilmathis.com`. Retour autorisé : `https://parking.gilmathis.com/api/auth/callback**`. Les chemins du logo et du site sont absolus afin de fonctionner dans une messagerie. Aucune donnée de profil éditable par l’utilisateur n’est interpolée dans le HTML.

## État vérifié le 22 octobre 2026

- API publique Auth : inscription autorisée, connexion email activée, confirmation obligatoire, comptes anonymes désactivés.
- Dashboard consulté par le coordinateur : aucun SMTP personnalisé et édition des modèles bloquée tant que le fournisseur n’est pas configuré. Ces fichiers sont **préparés**, pas encore actifs dans les emails reçus.
- Aucun email de test n’a été envoyé à un utilisateur et aucun compte réel n’a été créé par cette recette.
- Le fournisseur par défaut restreint les destinataires et ne permet pas de conclure que tout nouveau client recevra un email. Le design ne résout pas ce point d’exploitation.

## Recette après configuration SMTP

Sur une adresse de test contrôlée et autorisée : inscription → réception → clic depuis le navigateur de départ → compte ; déconnexion → connexion ; récupération → réception → nouveau mot de passe → ancien mot de passe refusé → nouveau accepté. Tester également un renvoi de confirmation, un ancien lien expiré, un lien déjà utilisé et le retour à l’annonce demandée. Vérifier le rendu mobile, les courriers indésirables et l’expéditeur effectivement reçu. Effacer ensuite uniquement les données du compte de test identifié.

Les tests de code `tests/auth-connected.test.ts` utilisent le vrai SDK Supabase SSR avec un transport réseau isolé. Ils contrôlent challenge PKCE, cookies, échanges, état signé, comptes distincts, consommation unique, erreurs SMTP et limites d’envoi. Ils ne prouvent pas la livraison d’un email réel.

Sources officielles vérifiées : [modèles email](https://supabase.com/docs/guides/auth/auth-email-templates), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [changement de personnalisation du 3 juin 2026](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).
