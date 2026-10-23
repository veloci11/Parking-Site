# Droits gratuits V1 et limites d’usage

La migration `20261021190702_entitlements_anti_abuse.sql` ajoute un seul plan, `free`. Aucun paiement, abonnement payant, rôle supplémentaire ou droit de modération n’est accordé par ce module.

| Limite par compte | Valeur initiale |
|---|---:|
| Annonces actives | 10 |
| Créations de brouillon | 10 / 24 h |
| Soumissions | 20 / 24 h |
| Nouveaux contacts | 10 / 24 h |
| Messages | 30 / 60 s et 5 / 5 s |
| Dépôts de fichiers privés | 60 / 1 h |
| Octets de fichiers privés | 250 MiB / 24 h |

Les fenêtres commencent à la première opération comptabilisée. `resetsAt` donne leur échéance effective ; aucune remise à zéro à minuit n’est promise. Les annonces actives suivent le compteur de publication existant : révision en attente ou instantané publié, hors vendu/retrait. Une pause conserve le quota d’annonce, même si ses places physiques ne sont plus publiées.

`GET /api/entitlements` renvoie uniquement les droits du compte connecté, les consommations, les restants et les échéances effectives. Les refus de limite renvoient `RATE_LIMITED` avec `Retry-After` dans l’API applicative. Une relance du même message avec son `clientRequestId` ne consomme pas un second message et ne mange pas la rafale.

L’administration utilise `GET/POST /api/admin/entitlements`. Les commandes sont `set_free_limits`, `set_user_override` et `clear_user_override`, validées par les types de `src/lib/entitlements.ts`. La modification du plan exige sa version courante. Une dérogation de compte commence avec la version `0`, puis chaque changement exige sa version courante. Elle possède des limites bornées, des dates, un motif de 15 à 2 000 caractères et une échéance située au plus 90 jours après la commande. Une dérogation expirée ne s’applique plus ; la supprimer ne change aucun rôle. Les opérations sont journalisées. Les RPC d’administration exigent un compte administrateur vérifié et AAL2, indépendamment du réglage général de MFA. La démonstration locale reste limitée au loopback et ne simule pas une preuve TOTP.

Les RPC de création, soumission, contact et message utilisent les limites effectives. Les anciens corps privés de création et modération lisent également le plafond du vendeur, y compris lorsqu’une dérogation permet plus de dix annonces. Les fonctions internes de consommation ne sont pas exécutables par `anon` ou `authenticated`.

Les fichiers de `private-uploads` et les originaux de `scene-sources` partagent les plafonds de dépôts et d’octets. Le compte débité est celui du préfixe du chemin déjà validé par la politique de stockage ou le jeton d’envoi signé ; pour une pièce déposée par un modérateur, c’est le déposant. Le trigger ne confère aucune autorisation à partir de ce préfixe : les politiques de stockage existantes restent actives.

Supabase effectue des sondes de permission annulées et peut finaliser un fichier sous un rôle privilégié. Le reçu privé d’objet compte une seule admission, puis les octets réels de `metadata.size`, à l’insertion ou à la finalisation. La répétition de la même finalisation ne consomme rien de plus. Cela couvre aussi une finalisation signée sans `auth.uid()`. Les aperçus `preview-1..3.png` dérivés d’une véritable source sont exclus des quotas du vendeur ; leur insertion reste interdite aux clients par la politique de dépôt des originaux. Les plafonds de fichier de 10 MiB pour une photo et 25 MiB pour une source restent distincts du quota quotidien.

Recette reproductible : `supabase/tests/entitlements-anti-abuse.sql` exécute des fixtures dans une transaction annulée, sans appel Auth, email ni facturation. Elle vérifie notamment AAL2, versions, bornes, expiration, onze annonces avec dérogation, rafale/idempotence, finalisation de stockage, jeton signé sans utilisateur, absence de double compte et maintien des politiques privées. Les tests TypeScript sont dans `tests/entitlements.test.ts`. Après application sur le projet réel, compléter cette recette SQL par un dépôt d’image et de source via l’API Storage utilisée par le site.

Références de comportement Storage vérifiées pendant l’implémentation : [envoi signé](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl), [moteur de finalisation](https://github.com/supabase/storage/blob/master/src/storage/uploader.ts).
