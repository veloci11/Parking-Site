# Contrats de donnees

Les JSON Schema 2020-12 sont des specifications de validation, pas des migrations deployees. Le schema de soumission concerne la demande finale, pas le brouillon incomplet. seller_id et roles sont inferes de la session serveur et absents des commandes utilisateur.

`parking-level.example.json` est une fixture fictive isDemo=true ; les chemins d’assets sont des exemples sans fichier GLB fourni. Un modele reel reste a produire.

Controles metier en plus des schemas : IDs de places/meshes uniques, polygones simples non auto-croises et aires positives, aucune reference hors parking/niveau, aucune ressource externe, quantite egale au nombre d’unites, dimensions compatibles avec provenance, valeurs privees exclues du manifest public, droits des medias, statut du compte, droits de publication, claims et quotas transactionnels.

Le prix est toujours total en centimes. Le numero peint et la reference de lot sont distincts. Aucune generation IA ne remplace les plans mesures et la revue.

V1 une annonce = un parking/site, plusieurs niveaux possibles. Galerie générale max20, par place max6, total max120 photos distinctes pour l’annonce ; couverture partielle explicitée et aucun statut état documenté pour unité sans preuve propre. Ces plafonds et droits se vérifient côté serveur. Les manifests publics sont réservés aux contextes exact_opt_in ; annonces area sans IDs canoniques ou scène partagée publics. Quotas de publication par listing_id distinct, révision ne consommant pas deux places.
