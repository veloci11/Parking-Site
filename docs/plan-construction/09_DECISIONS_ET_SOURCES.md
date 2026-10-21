# 09 — Décisions, limites et sources

## 1. Registre des décisions

| ID | Décision | Statut |
|---|---|---|
| D01 | Vente de parkings/box ; annonceurs Mathis et autres utilisateurs | Demandé par Mathis |
| D02 | Identité claire blanche/violette ; derniers ajustements : place dorée douce, filtre actif champagne pâle | Demandé explicitement, remplace essais noir/or |
| D03 | Carte ville 3D + parking intérieur ; état réel visible | Demandé explicitement |
| D04 | Comptes, interface de dépôt et gestion des annonces | Demandé explicitement |
| D05 | Gratuit en V1 ; forfaits mensuels en V2 ; pas de paiement par annonce | Correction explicite de Mathis |
| D06 | 5 €/mois exemple de forfait, sans tarif/quota final | Exemple, non prix validé |
| D07 | Une police Inter, sept tailles, tokens et composants communs | Choix de réalisation en réponse à la demande de charte |
| D08 | Monogramme G devant P, même dessin ; préférence la plus récente pour le premier G doré avec P violet | Validé visuellement sur le fichier joint ; disponibilité non vérifiée |
| D09 | Or limité au G et à la sélection ; filtre actif très pâle, CTA et structure blancs/violets conservés | Périmètre de la modification du G |
| D10 | Next/TypeScript + Supabase ; MapLibre/OpenFreeMap ; Three/R3F | Architecture proposée prête à implémenter |
| D11 | Publication gratuite modérée, révisions, inconnus explicites et modèle partagé par niveau | Règles V1 proposées pour une réalisation cohérente |
| D12 | Contact/messagerie ; aucun encaissement du prix immobilier | Périmètre du site de petites annonces |
| D13 | Pas de génération IA d’un parking réel à partir d’une seule photo | Limite de fidélité et choix de production |

## 2. Points à confirmer sans empêcher la préparation technique

| Sujet | Hypothèse de travail | À décider avant |
|---|---|---|
| Nom commercial et domaine | « GP » interne ; « park. » issu des maquettes, non adopté comme marque disponible | Publication de la marque et réservation définitive |
| Logo | Fichier exact joint conservé : G doré initial / P violet, géométrie figée ; piste raster avant SVG final | Intégration de production |
| Opérateur de la plateforme | Entité et contact légal à renseigner | Ouverture au public |
| Territoire | France, interface FR, EUR | Déploiement des règles locales et textes |
| Inventaire réel | Aucune adresse/prix/photo des maquettes n’est une donnée réelle | Import des annonces et premier pilote |
| Plans et dimensions | Un parking pilote à collecter ; scènes fictives étiquetées pour développer | Déclaration d’une scène fidèle |
| Hébergement et région | Services compatibles Node/Supabase, région UE à sélectionner | Création de comptes/facturation fournisseur |
| Publication externe | Autres vendeurs en V1 gratuite modérée, pas uniquement stock de Mathis | Paramétrage de l’ouverture des inscriptions |
| Quotas gratuits et reconfirmation | 10 actives et 90 jours proposés comme règles produit | Recette métier de lancement |
| Forfaits V2 | Mensuels ; montant/quota/avantages non arrêtés | Activation commerciale V2 |
| Priorité des scènes | Production manuelle assistée sur parkings documentés | Offre promise aux annonceurs |
| Textes et durées | Finalités et calendriers adaptés à l’activité réelle | Lancement et activation V2 |

Il n’est pas nécessaire de bloquer la rédaction ou les premières fondations sur ces réponses. En revanche, ne pas publier un nom « disponible », une scène « vérifiée » ou un tarif « définitif » sans la validation correspondante.

## 3. Logo : recherche de ressemblance et statut honnête

La proposition n’est pas accompagnée d’une certification de disponibilité. Une recherche web générale autour de GP/parking a été consultée pour cadrer le sujet, mais ne constitue ni recherche figurative exhaustive ni contrôle de droits antérieurs. Aucun rapport INPI/TMview sur ce signe précis n’a été obtenu et aucun dépôt n’a été réalisé.

Avant adoption : conserver le fichier final, choisir le nom et les territoires/services visés, effectuer recherches à l’identique puis de similitude sur nom et signe, examiner résultats figuratifs et droits antérieurs pertinents, contrôler domaine/présence commerciale, et consigner les conclusions. Les classes et l’analyse doivent suivre l’activité réelle, pas un nombre arbitraire du dossier.

L’INPI distingue la recherche à l’identique et la recherche par similarité ; EUIPO présente TMview et DesignView comme bases de recherche. Une marque générée n’échappe pas à ce contrôle. [INPI disponibilité](https://www.inpi.fr/disponibilite-dune-marque-dun-logo-dun-nom-de-societe-dun-nom-de-domaine), [EUIPO recherches](https://www.euipo.europa.eu/search-ip).

Les PNG joints sont des essais. Le rendu satiné/lumineux ne doit pas être pris pour le SVG simplifié final. Tester sa lisibilité sur blanc à 24/32 px et produire une version sans halo pour les petits formats. La demande d’un G doré ne transforme pas les boutons ou textes du site en doré.

## 4. Corrections issues des relectures spécialisées

V1 un parking par annonce ; confidentialité area sans scène partagée/identifiants canoniques publics ; quotas par listing_id distinct ; chemins d’assets sans traversée et extensions par rôle ; navigation visible vers dépôt/compte ; surface par unité distincte du total ; décisions de visite structurées ; galeries propres aux unités et couverture partielle explicitée. Ces corrections portent sur les contrats, pas sur une application déployée.

## 5. Sources officielles consultées

Consultation pour ce dossier : 20 octobre 2026. Les règles produit, limites de poids, objectifs de performance et quotas sont nos spécifications proposées ; les pages ci-dessous justifient capacités et principes techniques, pas ces paramètres propres au projet. Revérifier tarifs/conditions et versions au moment de provisionner.

| Source | Usage et portée |
|---|---|
| [OpenFreeMap](https://openfreemap.org/) | Instance publique gratuite annoncée, usage commercial, attribution, absence de SLA |
| [Guide OpenFreeMap](https://openfreemap.org/quick_start/) | Intégration MapLibre et personnalisation des styles |
| [MapLibre : bâtiments 3D](https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/) | Volumes extrudés à partir des données de bâtiments ; pas intérieurs privés |
| [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction) | Rendu React pour Three.js ; viewer intérieur |
| [Three.js](https://threejs.org/docs/) | Objets, rendu et chargement des scènes ; formats à valider dans la version retenue |
| [Next.js Auth](https://nextjs.org/docs/app/guides/authentication) | Autorisation au plus près des données, séparation de session et droits |
| [Next.js fontes](https://nextjs.org/docs/app/getting-started/fonts) | Gestion et optimisation des polices ; fonte locale privilégiée |
| [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs) | Clients et session vérifiée serveur ; ne pas autoriser via session non validée |
| [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) | Contrôle au niveau des lignes de base |
| [Supabase Storage](https://supabase.com/docs/guides/storage/security/access-control) | Politiques d’accès aux fichiers |
| [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis) | Requêtes et index géographiques |
| [Stripe abonnements/webhooks](https://docs.stripe.com/billing/subscriptions/webhooks) | Événements, renouvellement et états pour la future V2 |
| [Stripe Customer Portal](https://docs.stripe.com/customer-management) | Gestion de l’abonnement et du moyen de paiement |
| [Stripe webhooks](https://docs.stripe.com/webhooks) | Signature, réception et robustesse des événements |
| [Inter](https://rsms.me/inter/) | Famille retenue et téléchargement officiel ; licence fournie dans assets |
| [Web Vitals](https://web.dev/articles/vitals) | Cibles LCP, INP et CLS de la future recette |
| [W3C WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/) | Contraste, clavier et accessibilité ; objectifs à tester |
| [CNIL principes RGPD](https://cnil.fr/fr/comprendre-le-rgpd/les-six-grands-principes-du-rgpd) | Minimisation, finalités, information, sécurité |
| [CNIL cookies](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies) | Analyse des traceurs et consentement selon usage réel |
| [CNIL conservation](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees) | Calendrier de conservation motivé, pas de durée universelle inventée |
| [Ministère de l’Économie](https://www.economie.gouv.fr/entreprises/developper-son-entreprise/innover-et-numeriser-son-entreprise/mentions-sur-votre-site-internet-les-obligations-respecter) | Mentions et information de l’éditeur professionnel |
| [INPI disponibilité](https://www.inpi.fr/disponibilite-dune-marque-dun-logo-dun-nom-de-societe-dun-nom-de-domaine) | Limites d’une recherche à l’identique et recherche de similarité |
| [EUIPO recherches](https://www.euipo.europa.eu/search-ip) | Accès aux bases de marques et dessins |

## 6. Équipe et relectures

Trois missions réellement déléguées : organisation de 18 rôles, revue architecture/contrats, revue produit/recette. Huit précisions intégrées puis contrôle ciblé des quatre corrections d’architecture. Les 18 briefs sont préparés pour le futur développement ; aucun site n’a été codé par ces agents.

## 7. Provenance des actifs joints

`reference-ville.png` et `reference-parking.png` : maquettes générées dans cette conversation, choisies par Mathis pour le style et le parcours. Elles ne sont pas des informations d’inventaire.

`logo-gp-or-initial-proposition.png` : premier G doré, préféré ensuite par Mathis, avec P violet. `logo-gp-champagne-proposition.png` conserve l’essai plus pâle/rosé et `logo-gp-violet-proposition.png` une première piste. `logo-gp-proposition.png` reprend le logo de référence renvoyé par Mathis : couleur du premier G doré, P violet. Les essais suivants de métal brossé et d’or plus désaturé ont été écartés pour décalage de matière ou perte du caractère doré. La dernière vue parking intègre le GP et applique le doré doux sur la place et très pâle sur le filtre. Ces actifs viennent de l’outil ImageGen intégré et restent des propositions raster, pas un SVG de production ni une marque validée. Les prompts exacts sont dans `assets/LOGO_PROMPTS.md`.

`InterVariable.woff2` et `Inter-LICENSE.txt` : dépôt officiel Inter, fichiers téléchargés sans installation globale. Leur présence facilite une charte locale fidèle ; les contrôles de fichiers sont consignés dans `VERIFICATION.md`.
