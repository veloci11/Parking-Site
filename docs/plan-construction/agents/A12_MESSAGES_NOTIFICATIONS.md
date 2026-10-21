# A12 — Messagerie, visites et notifications

**Tâches de référence :** P050, P051, P052.

## Objectif

Permettre un contact acheteur-vendeur privé, fiable et clairement lié à l’annonce.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [01_PRODUIT_ET_PARCOURS.md](../01_PRODUIT_ET_PARCOURS.md)
- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)
- [06_COMPTES_SECURITE_MODERATION.md](../06_COMPTES_SECURITE_MODERATION.md)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `src/features/messages/**`
- `src/features/notifications/**`
- `src/app/(account)/compte/messages/**`
- `src/app/api/v1/conversations/**`
- `workers/mail/** et outbox, fichiers réservés`

## Travail à réaliser

- Créer/réutiliser la conversation entre les participants réels d’une annonce autorisée.
- Implémenter texte simple, pagination, idempotence, anti-abus, blocage et signalement.
- Distinguer demande de visite et confirmation ; conserver l’historique autorisé après retrait.
- Écrire l’événement dans l’outbox après transaction, gérer retry/déduplication et préférences email.

## Dépendances de départ

- Auth A03, annonce/publication A04, composants A01 et jobs/config SMTP A16.

## Livrables attendus

- API et interface de conversation privées.
- Demande de visite structurée et notifications de test.
- Contrat outbox, retries, déduplication et erreurs récupérables.

## Critères de fin et vérification

- Prévoir une décision de visite versionnée : vendeur accepte/refuse ; un participant peut annuler. Sans horaire confirmé, afficher « À organiser », pas « Visite confirmée ».



- Aucun tiers ne lit les messages en changeant un ID.
- Double clic/retry n’envoie qu’un message et une notification.
- Aucune visite confirmée sans acceptation ; aucun nouvel auto-contact ou contact sur annonce indisponible.

## Limites propres au rôle

- Ne pas envoyer de messages ou emails réels à des tiers pendant une mission de test.
- Ne pas intégrer de pièces jointes en V1 ni d’HTML libre.
- Ne pas inclure adresse privée ou texte sensible complet dans les notifications email.

## Format du rapport de sortie

```text
Rôle / tâche :
Résultat obtenu :
Fichiers modifiés :
Contrats consommés / changements proposés :
Contrôles exécutés et résultats :
Non testé / limites :
Dépendance ou décision encore attendue :
État exact : spécifié | local | intégré | staging vérifié | production vérifiée
Transmission suivante : [rôle, livrable et version prêts]
```

Ne pas transformer une proposition, fixture ou capture en preuve de fonctionnement réel. Remonter une incertitude avec le travail indépendant déjà réalisé ; ne pas inventer une donnée pour débloquer une scène.
