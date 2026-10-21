# A06 — Compte et dépôt vendeur

**Tâches de référence :** P012, P020.

## Objectif

Permettre de créer un compte et déposer une annonce complète en conservant les données et en expliquant les erreurs.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [01_PRODUIT_ET_PARCOURS.md](../01_PRODUIT_ET_PARCOURS.md)
- [02_CHARTE_VISUELLE.md](../02_CHARTE_VISUELLE.md)
- [03_ANNONCES_ET_QUALITE.md](../03_ANNONCES_ET_QUALITE.md)
- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)
- [06_COMPTES_SECURITE_MODERATION.md](../06_COMPTES_SECURITE_MODERATION.md)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `src/app/(auth)/** : interface uniquement`
- `src/app/(account)/compte/** sauf messages et abonnement`
- `src/features/account/**`
- `src/features/listings/editor/**`

## Travail à réaliser

- Construire inscription/connexion/récupération UI sur le contrat serveur A03.
- Implémenter huit étapes du dépôt, sauvegarde stable, reprise et conflit de version.
- Réutiliser les champs qualité A11 et uploads A07 ; distinguer plans privés et photos publiques.
- Gérer les annonces personnelles, correction, pause et vendu ; prévisualiser exactement l’information publique.

## Dépendances de départ

- Primitives A01 ; schémas/API A02/A04 ; Auth A03 ; composants A07/A11.

## Livrables attendus

- Assistant et espace compte avec états complets.
- Messages de validation utiles et liens vers les champs en erreur.
- Preuves du parcours brouillon repris et soumission après vérification email.

## Critères de fin et vérification

- Exposer Déposer et les accès compte depuis l’en-tête commun. Distinguer galerie d’annonce (20), galerie propre à une place (6) et plafond global (120 images par annonce V1), sans multiplier des copies de fichier pour un groupe.



- Aucune perte de saisie après erreur ou reconnexion.
- Compte non vérifié ne soumet pas ; les données des autres comptes ne s’affichent pas.
- Bundle d’un seul site, nombre de places et prix total restent explicites.

## Limites propres au rôle

- Ne pas créer un second compte pour devenir vendeur.
- Ne pas exposer email/phone/adresse privée pour simplifier le contact.
- Ne pas intégrer un paiement ou une validation de propriété automatique.

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
