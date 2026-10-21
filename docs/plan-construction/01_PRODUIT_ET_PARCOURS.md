# 01 — Produit, pages et parcours

## 1. Promesse

Permettre de trouver une place à acheter, de comprendre son emplacement et ses contraintes réelles, puis de contacter le vendeur. Pour le vendeur : déposer une annonce complète sans devoir savoir modéliser un parking. La plateforme assure la présentation, les comptes, la modération et la mise en relation.

Référence de fonctionnement : une plateforme de petites annonces spécialisée, avec une exploration géographique et intérieure plus précise. Ne pas reproduire le nom, l’identité visuelle, les textes ou les actifs de Leboncoin.

## 2. Périmètre par version

| Fonction | V1 | V2 ou plus tard |
|---|---|---|
| Consultation sans compte, recherche, tri, filtres | Oui | Améliorations à partir des usages |
| Compte email/mot de passe, récupération et vérification email | Oui | Connexions sociales facultatives |
| Acheteur et annonceur dans le même compte | Oui | Comptes professionnels enrichis |
| Annonces des biens de Mathis et d’autres utilisateurs | Oui, publication gratuite après modération | Forfaits mensuels |
| Place à l’unité et lot de plusieurs places | Oui | Imports volumineux si nécessaires |
| Carte ville 3D et repli 2D | Oui | Fournisseurs alternatifs si besoin |
| Parking intérieur 3D | Oui pour les parkings réellement documentés et validés | Outillage de production plus automatisé |
| Photos, favoris et comparaison de 3 annonces | Oui | Alertes de recherche enregistrée |
| Messagerie texte et demande de visite | Oui | Agenda et pièces jointes, après besoin confirmé |
| Administration, modération, signalements | Oui | Délégation plus fine |
| Abonnement mensuel | Non, structure de droits préparée | Oui, Stripe Billing et portail client |
| Paiement à l’annonce | Non | Non prévu |
| Encaissement du prix d’achat immobilier | Non | Hors projet actuel |
| Location horaire ou mensuelle d’une place | Non | Nouveau périmètre à décider séparément |
| IA estimant automatiquement dimensions/état sur une photo | Non | Aucune promesse d’exactitude de ce type |

## 3. Personnes et permissions

| Profil | Possibilités |
|---|---|
| Visiteur | Voir les annonces publiées et leurs médias publics, chercher, filtrer, comparer ; favoris temporaires sur son appareil |
| Membre avec email vérifié | Favoris persistants, envoyer un message, demander une visite, déposer et gérer ses annonces |
| Annonceur | C’est le même membre ; possède uniquement ses annonces et leurs brouillons. Profil particulier ou professionnel déclaré |
| Modérateur | Relire, demander une correction, approuver ou retirer une publication, traiter un signalement et consulter le contexte nécessaire |
| Administrateur | Gérer les rôles, réglages, accès sensibles, scènes partagées et paramètres ; V2 : plans d’abonnement |

L’adresse email confirmée ne signifie pas identité ni propriété immobilière vérifiées. Aucun badge ambigu. Un administrateur peut être aussi annonceur, mais les décisions de publication restent tracées.

## 4. Routes et contenu des écrans

| Route | Écran et contenu essentiel | Action principale |
|---|---|---|
| `/` | Exploration claire : en-tête, recherche, filtres, résultats, carte, aperçu du bien | Voir un bien |
| `/explorer` | Même espace ; accepte les filtres et la sélection en URL | Sélectionner un bien |
| `/annonces/[id]/[slug]` | Fiche indexable : prix total, nombre de places, galerie, caractéristiques, état, localisation, vendeur, 3D si disponible | Contacter le vendeur |
| `/parkings/[id]` | Vue publique assainie d’un parking autorisé ; niveau, places commercialisées et retour carte | Choisir une annonce |
| `/comment-acheter` | Parcours de mise en relation, documents à examiner, limites de la plateforme | Explorer |
| `/connexion`, `/inscription` | Email, mot de passe, conditions, lien retour au parcours interrompu | Se connecter / créer le compte |
| `/verifier-email`, `/mot-de-passe-oublie`, `/reinitialiser` | États explicites et liens temporaires | Terminer l’action |
| `/deposer` | Assistant de dépôt en étapes, brouillon sauvegardé | Soumettre à modération |
| `/compte` | Vue d’ensemble utile : annonces à compléter, messages non lus, préférences | Reprendre son action |
| `/compte/annonces` | Brouillons, en attente, publiées, en pause, vendues, refusées | Gérer une annonce |
| `/compte/annonces/[id]/modifier` | Éditer une nouvelle révision, prévisualiser | Soumettre la révision |
| `/compte/favoris` | Liste persistante et état vendu/retiré des anciens favoris | Ouvrir la fiche |
| `/compte/messages/[id?]` | Conversations privées par annonce | Répondre |
| `/compte/parametres` | Profil, coordonnées privées, mot de passe, notifications, export/suppression | Sauvegarder |
| `/comparer` | 2 à 3 annonces et leurs champs comparables, inconnus visibles | Contacter |
| `/admin` et sous-routes | File de modération, signalements, scènes 3D, comptes et journal | Traiter un dossier |
| `/contact`, `/aide`, `/signaler` | Support, FAQ ciblée, signalement avec référence | Envoyer la demande |
| `/mentions-legales`, `/confidentialite`, `/conditions-utilisation`, `/accessibilite` | Documents adaptés à l’opérateur réel | Lecture |
| `/forfaits`, `/compte/abonnement` | Cachés en V1 ; V2 : offres, droits, statut et portail de gestion | Gérer le forfait |

Les liens ne doivent pas conduire à un écran vide. En V1, les routes d’abonnement renvoient une information de fonctionnalité indisponible, sans paiement possible ni simulation d’achat.

### Navigation visible à ajouter aux maquettes

Les maquettes ont été dessinées avant l’ouverture à plusieurs annonceurs. Conserver leur style et leur grille, mais fournir dans l’en-tête : Explorer, Favoris, Comment acheter, **Déposer une annonce**, puis **Se connecter** (visiteur) ou **Mon compte** (membre). Le bouton de dépôt remplace le bouton générique Nous contacter de la maquette ; Contact reste dans Aide et le pied de page. Sur mobile, Déposer reste accessible dans la barre/menu et Connexion/Compte dans le menu, sans masquer ces fonctions derrière une route inconnue. Le dépôt reprend après authentification.

## 5. Exploration et URL

La liste et la carte partagent la même requête. Paramètres stables : `city`, `bbox`, `radiusKm`, `type`, `priceMin`, `priceMax`, `areaMin`, `covered`, `closed`, `occupancy`, `level`, `sort`, `listing`, `parking`, `floor`. Valeurs validées ; filtres inconnus ignorés avec normalisation de l’URL.

Tri initial : plus récentes, puis prix croissant/décroissant, surface et nombre de places. Les annonces regroupées portent « lot de N places » et un prix total ; leur prix ne doit jamais être interprété comme le prix d’une seule place. Un prix par place calculé est secondaire, explicitement présenté comme une moyenne.

Pour la surface : afficher le minimum–maximum **par place**, avec nombre d’unités renseignées ; afficher la surface totale séparément uniquement si toutes sont connues. Le filtre `areaMin` doit être satisfait par chacune des unités du lot ; s’il manque une surface, le lot est exclu lorsque ce filtre est actif. Le tri surface utilise le minimum par place, valeurs inconnues en dernier. La comparaison distingue plage par place et total ; elle ne compare jamais 12 m² individuels à 60 m² de lot comme s’ils décrivaient une place.

Déplacer la carte ne relance pas chaque frappe ni chaque image : bouton « Rechercher dans cette zone » ; option d’actualisation automatique ultérieure. Pagination par curseur, 24 résultats par page. Les filtres sont appliqués avant la pagination. Une recherche sans résultat propose de retirer un filtre ou élargir la zone.

## 6. Parcours acheteur

1. Ouvrir le site sans compte, chercher une ville ou autoriser volontairement sa localisation.
2. Consulter les mêmes biens en liste et sur la carte. Survol/clic synchronisent la sélection.
3. Ouvrir le panneau aperçu ; lien vers une vraie fiche partageable et accessible au clavier.
4. Si une scène validée existe : choisir le niveau et la place. Sinon afficher les photos et le plan disponible avec un statut honnête.
5. Consulter l’état et les contraintes : poteau, humidité observée, largeur mesurée, hauteur, accès et occupation.
6. Demander une visite ou écrire au vendeur. Un visiteur est invité à se connecter puis retrouve son annonce et son texte.
7. Message et demande de visite sont enregistrés une seule fois ; confirmation dans la conversation. Une demande n’est pas un rendez-vous confirmé.

Le bouton contact est indisponible si l’annonce est vendue, retirée ou si le vendeur est suspendu. Les favoris restent visibles avec cet état.

## 7. Parcours vendeur

1. Créer un compte et vérifier son email ; choisir particulier/professionnel sans créer un second compte.
2. Créer un brouillon ; fournir lieu, type, quantité, prix, photos, dimensions connues et état.
3. Déclarer s’il vend une place ou un ensemble indivisible de plusieurs places. Saisir les unités individuellement lorsqu’elles sont connues.
4. Fournir plans/documents en zone privée pour préparer une scène. Un simple dépôt de plan ne publie aucun fichier source.
5. Prévisualiser exactement les informations publiques, y compris précision de localisation et qualité du modèle 3D.
6. Attester disposer des droits nécessaires, puis soumettre.
7. Recevoir demande de correction ou notification d’approbation ; retrouver l’annonce publiée.
8. Répondre aux messages, modifier via révision, mettre en pause ou déclarer vendu.

Le vendeur n’a pas à produire son GLB. La création/validation du modèle intérieur est un flux dédié, pris en charge initialement par l’administration avec l’aide du vendeur. L’annonce peut être publiée en photos sans prétendre disposer d’une 3D fidèle.

## 8. Modération et révisions

Cycle de soumission : `draft → pending_review → approved / changes_requested / rejected`. Après approbation, la révision devient la publication courante. Cycle de visibilité : `published → paused / sold / withdrawn / expired / suspended`. Une révision refusée ne retire pas automatiquement la précédente publication valide ; le modérateur peut suspendre explicitement cette publication s’il découvre un problème de fond.

Pause/vendu/retrait s’appliquent immédiatement, même si une révision est en attente. La remise en ligne passe à nouveau par les contrôles de disponibilité et de droits. Aucun statut ne résulte d’une simple valeur envoyée par le navigateur.

## 9. Responsive et états communs

Ordinateur : résultats gauche, carte ou parking au centre, inspecteur droit superposé comme dans les références. Sur une largeur insuffisante, un seul panneau secondaire est ouvert. Mobile : vue Liste par défaut, bouton Carte, fiche en panneau inférieur ; la scène intérieure se charge sur demande. Le bouton retour restaure filtres, liste et sélection.

Chaque écran prévoit : chargement, succès, vide, erreur récupérable, absence de connexion, permission refusée, session expirée, publication retirée pendant la consultation, WebGL indisponible. Une erreur de carte ne masque jamais le catalogue. Une erreur de paiement V2 ne bloque jamais la lecture des messages déjà reçus.

## 10. Critères de réussite V1

- Un utilisateur sans expertise publie un brouillon complet sans perdre ses données en revenant plus tard.
- Un acheteur comprend le prix, le nombre d’unités et les contraintes sans utiliser la 3D.
- La scène pilote représente le bon niveau, les bons numéros, dimensions et défauts documentés.
- Un compte ne peut ni lire les échanges ni modifier les annonces d’un autre compte.
- L’état publié/vendu est cohérent dans la fiche, la liste, les favoris et la scène.
- L’aspect reste fidèle aux deux références claires sur ordinateur et utilisable à 390 px de large.
