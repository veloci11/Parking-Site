# Exécution de la V1 GP park

Le plan de 18 rôles a été exécuté par vagues : un coordinateur et jusqu’à trois spécialistes simultanés, avec relectures croisées. Les rôles sont des responsabilités ; il n’y a pas eu 18 agents de développement simultanés.

| Rôles du plan | Réalisation |
|---|---|
| A00, A01, A05 | Coordinateur : intégration, charte Inter/palette/logo, exploration, fiches, favoris, comparaison, rendu responsive |
| A02, A03, A04, A07 | Backend : contrats, PostgreSQL/RLS, Auth, révisions, publication, quota gratuit, médias privés et variantes |
| A06, A11, A13 | Compte : assistant, observation par unité, accès compte, interfaces de modération, suspension et signalements |
| A08, A09, A10 | Cartes/3D : ville interactive, contrat métrique, sources privées, calibration, revue distincte, viewer 3D et plan SVG |
| A12 | Backend + compte : messages, blocage de l’interlocuteur, visites, notifications et worker email en prévisualisation |
| A14, A15 | Coordinateur + revues : sémantique, navigation, canonique, indexation fermée, tests métier/HTTP/SQL et captures ciblées |
| A16 | Coordinateur + cartes : CI, dépendances corrigées, procédures et outil de sauvegarde/intégrité hors dépôt |
| A17 | Backend : quota V1 transactionnel. Abonnements mensuels V2 conservés au backlog, aucune facturation activée |

Les migrations 001 à 010 ont été appliquées au projet Supabase dédié. Les jeux d’essai persistants ont été retirés ; les trois dernières recettes SQL utilisent une transaction annulée. Aucun email extérieur, paiement ou déploiement public n’a été réalisé.

Preuves et limites : [statut d’implémentation](IMPLEMENTATION_STATUS.md), [revue V1](V1_GAP_REVIEW.md), [QA visuelle](../design-qa.md), [rapports](qa/), [exploitation](OPERATIONS.md). Le rendu d’un premier parking réel, la livraison email, l’identité de l’opérateur et une restauration complète sur un second projet restent à valider avec les pièces et l’environnement correspondants.
