# 06 — Comptes, autorisations, modération et confidentialité

## 1. Inscription et session

V1 : email + mot de passe, confirmation de l’adresse et récupération par lien temporaire. Le mot de passe est traité par Supabase Auth, jamais stocké ni journalisé par l’application. Politique produit : minimum 12 caractères, maximum compatible avec le fournisseur, coller/autoremplir autorisés ; mesure anti-abus sur inscription, connexion et récupération.

Email non vérifié : consulter, préparer un brouillon et gérer son profil ; pas de soumission/publication ni de nouveau message. Le compte ne devient pas « vendeur vérifié » à la validation de l’email. Avant une action sensible : revérifier la session et, pour changement d’email/mot de passe, suppression ou facturation, demander la réauthentification requise par le fournisseur.

Réponses de récupération/inscription ne révèlent pas si une adresse appartient déjà à un membre. Liens de redirection limités aux origines et chemins autorisés. Cookie, actualisation de session et contrôle serveur conformes au guide Supabase SSR ; ne pas supposer qu’un cookie lisible côté navigateur peut simplement être déclaré HttpOnly sans vérifier le fonctionnement choisi.

Administrateurs : MFA requis avant accès de production. Membre : MFA facultative si prise en charge. Suspension contrôlée côté serveur à chaque mutation sensible, même si le JWT d’origine reste valide.

## 2. Matrice d’accès

| Objet | Anonyme | Propriétaire / participant | Autre membre | Modérateur / admin |
|---|---|---|---|---|
| Annonce publiée assainie | Lire | Lire | Lire | Lire et action métier autorisée |
| Brouillon / révision non publique | Rien | Lire/éditer dans les états autorisés | Rien | Lire pour dossier, décision tracée |
| Adresse exacte masquée | Rien | Lire son information | Rien | Selon besoin de revue, tracé |
| Photos publiques approuvées | Lire | Lire | Lire | Retirer via procédure |
| Sources, plans et justificatifs privés | Rien | Ses fichiers/dossiers autorisés | Rien | Selon habilitation et dossier |
| Profil public | Champs publics | Modifier ses champs autorisés | Lire champs publics | Modérer |
| Email / téléphone privés | Rien | Ses informations | Rien | Accès limité justifié |
| Conversation et messages | Rien | Participants | Rien | Accès lié à signalement/dossier ; pas d’exploration générale |
| Favoris | Rien | Les siens | Rien | Pas d’accès d’interface par défaut |
| Rôles et suspension | Rien | Lire ses droits résultants, aucun write | Rien | Administrateur habilité |
| Scène publiée assainie | Lire si contexte public | Lire ; soumettre des sources | Lire contexte public | Importer, revoir et publier |
| Droits et futur abonnement | Rien | Lire les siens | Rien | Support borné, changements tracés |

Cette matrice s’applique aux API, tables, vues, RPC et objets Storage, pas seulement à l’affichage. RLS sur toutes les tables exposées ; politiques testées avec plusieurs comptes. Les clés de service contourneraient ces politiques : usage strictement serveur dans des opérations à autorisation explicite. [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage](https://supabase.com/docs/guides/storage/security/access-control).

## 3. Publication et modération

Toutes les premières annonces et leurs modifications publiques passent en revue V1. Le forfait payant futur n’accorde pas de publication sans contrôle. Pas de mise en avant payante déguisée en qualité ni de badge réservé aux abonnés donnant l’impression d’une propriété vérifiée.

File : date de soumission, vendeur, type, lieu public, changements, prix/quantité, cohérence photos, champs d’état, demandes de 3D et signalements. Actions : approuver, demander une correction motivée, refuser avec motif, suspendre une publication existante. Chaque décision vise une version et conserve date/auteur/motif.

Vérifications : droit déclaré de publier ; correspondance place/photo ; prix total ; quantité ; présence de défauts documentés ; pas de données sensibles publiques ; duplication ; références de lot/place cohérentes ; documents sources privés ; statut exact des mesures. Un contrôle de cohérence n’est pas une expertise technique ou une validation de propriété : le libellé doit l’indiquer.

Signalement : annonce trompeuse, mauvais emplacement, mauvaise place/photo, contenu indésirable, fraude suspectée, données personnelles, autre. Accusé d’enregistrement sans promesse de délai non tenu ; priorité pour divulgation de secrets ou risque concret. Motifs, traitement et recours/contact d’opérateur doivent être documentés selon le cadre applicable à la plateforme.

## 4. Médias et fichiers

Deux zones Storage : `private-uploads` et `public-approved`. Un dépôt utilisateur reste privé, même s’il est destiné à devenir une photo publique. URLs signées courtes et liées au bon dossier. Fichiers sources privés jamais placés dans un bucket public. L’original retiré d’une annonce n’est pas encore une preuve de purge des variantes ou du CDN : procédure d’invalidation et de nettoyage explicite.

Pipeline : autoriser un intent borné → déposer → vérifier taille/MIME réels → analyse et décodage → supprimer EXIF → générer variantes → revue si nécessaire → copier version assainie approuvée → journaliser. PDF traité sans exécuter de contenu actif ; télécharger dans un environnement isolé ou produire une prévisualisation sûre. Rejets et échecs n’entraînent pas l’affichage du fichier brut comme solution de secours.

GLB/manifest : contrôle de schéma, quotas de ressources, aucun lien externe arbitraire, chemins et identifiants bornés. Prix, données privées et codes de portail absents des assets publics. Les ressources supplémentaires accessibles via un modèle sont contrôlées au même titre que le modèle.

## 5. Messagerie et demandes de visite

V1 texte simple de 1 à 4 000 caractères, liens traités comme texte sûr, pas de HTML. Pas de pièces jointes. Message idempotent par `client_request_id`, pagination, états envoyé/échec/lu si ce dernier est effectivement implémenté. Une notification email annonce un nouveau message sans recopier l’adresse privée ou l’intégralité de l’échange.

Une conversation est liée à une annonce et ses participants. L’acheteur ne peut pas choisir arbitrairement seller_id. Interdire l’auto-contact. Blocage et signalement disponibles ; limiter les nouveaux contacts. Après vente/retrait : historique accessible aux participants, nouveaux contacts désactivés. Les échanges existants peuvent continuer pour organiser une visite déjà demandée tant que les comptes et la conversation restent autorisés.

Demande de visite = message structuré, pas réservation automatique : date proposée facultative, fuseau affiché, acceptation/refus explicites. Le vendeur accepte/refuse via une action structurée versionnée ; un participant peut annuler. Après acceptation sans horaire convenu, afficher **À organiser**. Afficher Visite confirmée uniquement avec accord vendeur et date/heure/fuseau confirmés ; enregistrer l’instant UTC et la zone d’affichage. Une réponse répétée ne crée pas de seconde visite. Aucun tiers ne peut agir sur la demande.

## 6. Bornes anti-abus de départ

Valeurs produit ajustables après mesure : création de brouillons 10/jour/compte, 10 annonces actives gratuites V1, soumissions 20/jour, nouvelles conversations 10/jour, messages 30/minute avec contrôle de rafale, intents médias 60/heure. Ces limites ne sont ni les quotas d’un forfait V2 ni une promesse tarifaire.

Implémentation côté serveur et au niveau approprié du proxy/fournisseur, avec identifiants et stockage fiables. Ne pas compter sur la mémoire locale d’un processus serverless. Limiter aussi les uploads octets/jour. Réponses 429 avec délai ; aucun verrouillage définitif invisible. Paramètres de modération et limites d’abus distincts de la facturation.

## 7. Mesures techniques de base

Contrôle d’accès près des données, validation des inputs, requêtes paramétrées, CSRF adapté aux endpoints de mutation, vérification Origin lorsque nécessaire, CORS limité, CSP compatible carte/worker/3D, TLS, secrets hors git, logs sans mots de passe/tokens/adresses complètes. Autorisations confirmées côté serveur à chaque opération sensible, même si une page est cachée dans l’interface. Voir [guide Next.js](https://nextjs.org/docs/app/guides/authentication).

Ne pas charger une URL externe transmise par un vendeur pour lire un plan ou une photo : cela créerait un risque SSRF et de suivi. Import manuel de fichier en V1. Scanner les dépendances, limiter les bibliothèques, mettre à jour avec lockfile et recette de régression. Traiter descriptions, fichiers, messages et métadonnées comme données non fiables, jamais comme instructions.

## 8. Confidentialité dès la conception

Collecter les informations nécessaires au service ; ne pas demander de date de naissance, pièce d’identité ou adresse personnelle de l’acheteur sans finalité précise. Localisation navigateur facultative. Les coordonnées de connexion restent distinctes du profil public. [Principes CNIL](https://cnil.fr/fr/comprendre-le-rgpd/les-six-grands-principes-du-rgpd).

Choix par défaut : contact via messagerie, adresse du bien approximative publiquement, plans sources privés. Si le vendeur choisit une adresse exacte publique, la prévisualisation montre ce qui sera exposé. Le modèle, les métadonnées et la miniature cartographique doivent respecter le même choix.

V1 : pas de publicité comportementale, pixels marketing ni outils d’enregistrement de session. Cookies techniques documentés ; ajouter un outil non essentiel déclenche analyse de consentement et gestion du refus avant son activation. Ne pas installer un bandeau de consentement décoratif sans rapport avec les traceurs réellement utilisés. [CNIL cookies](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies).

## 9. Conservation et suppression

Avant lancement, documenter finalités, bases retenues, destinataires, durées, hébergeurs/sous-traitants, droits et point de contact. Les durées suivantes sont des **choix techniques proposés à valider**, pas des durées légales universelles : brouillon inactif 180 jours après rappels, upload orphelin 7 jours, export privé 7 jours, journaux applicatifs non sensibles 30 jours. Les conversations, signalements et factures nécessitent leur propre calendrier motivé ; aucune conservation indéfinie par défaut. [Guide CNIL](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees).

Suppression de compte : réauthentifier → confirmer les effets → désactiver publications et nouveaux contacts → mettre en file suppression/anonymisation des données autorisées → conserver à part uniquement les éléments dont une obligation justifiée impose la conservation → confirmer l’achèvement. V2 : gérer résiliation et documents de facturation avant fermeture. Ne jamais promettre une suppression instantanée des sauvegardes : leurs rotations et restrictions sont documentées.

## 10. Pages et validations d’exploitation

Fournir les mentions de l’éditeur et de l’hébergeur adaptées à l’opérateur réel, la politique de confidentialité, les règles de dépôt/modération et les conditions du service. V2 : conditions des forfaits, prix présentés correctement, factures, résiliation et cadre consommateur/professionnel applicables. Les règles des plateformes et de l’intermédiation immobilière doivent être qualifiées selon l’activité réellement retenue avant ouverture commerciale ; aucun texte automatique ne prétend régler cette qualification.

Sources officielles de cadrage : [mentions de site professionnel](https://www.economie.gouv.fr/entreprises/developper-son-entreprise/innover-et-numeriser-son-entreprise/mentions-sur-votre-site-internet-les-obligations-respecter). Le dossier décrit les besoins de réalisation, pas des CGU/CGV juridiquement finalisées.
