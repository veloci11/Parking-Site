# Mission 9/15 — messages, visites et notifications

Revue bornée du 22 octobre 2026. Correctif local prêt pour intégration ; aucun serveur, navigateur, build, envoi email, commit ou push lancé par cet agent. Les seules bases ouvertes sont des SQLite de tests créées dans des répertoires temporaires uniques, fermées puis supprimées. Aucune base existante ou connectée utilisée, aucun secret consulté.

## Défaut établi et corrigé

`requestVisit` dans `src/components/account/messages.tsx` générait une nouvelle clé `clientRequestId` à chaque soumission. Si le serveur créait la visite puis que sa réponse était perdue, réessayer le formulaire créait une autre visite et une autre notification.

Preuve initiale : deux appels directs à `handleApi`, reproduisant cette génération de clés pour la même conversation et le même créneau, ont produit **2 visites et 2 notifications de visite** dans une SQLite jetable. La déduplication serveur fonctionne avec une clé conservée ; le défaut était dans le réemploi de cette clé côté formulaire.

Correctif : `visit-request-draft.ts` conserve la clé pour une tentative identique (conversation et créneau normalisé). Le formulaire ne l'efface qu'après acquittement de la création, et la renouvelle pour une autre conversation ou un créneau différent. Une réponse réussie tardive ne ferme plus le formulaire d'une autre conversation. Aucun changement de présentation, d'abonnement ou de données Paris.

La régression teste le helper réellement utilisé et ses appels à l'API locale : la réponse initiale est laissée sans acquittement puis la même demande est rejouée. Résultat : **1 visite, 1 notification, même identifiant de visite**. Ce test n'est pas une simulation navigateur de panne réseau. La clé reste en mémoire du composant ; cette correction ne promet pas la reprise après rechargement complet de la page.

## Contrôles et niveau de preuve

| Surface | Résultat | Preuve |
| --- | --- | --- |
| Messages et visites d'un tiers | Un modérateur extérieur ne lit/crée ni message ni visite, ne décide pas la visite et ne marque aucun message comme lu. | Tests exécutés sur API locale directe, SQLite jetable. |
| Notifications privées | Les identifiants d'un autre destinataire ne permettent pas de marquer ses notifications ; la boîte du tiers reste vide. Le contenu de l'email de notification n'inclut pas le corps du message. | Tests exécutés, construction de l'email en mémoire, aucun transport lancé. |
| Idempotence messages/visites | Même auteur et même clé rendent le même message ; une clé réutilisée dans une autre conversation est refusée. Deux auteurs ont des espaces de clés distincts. Une visite rejouée n'ajoute aucune notification. | Nouveaux tests exécutés et tests backend existants. |
| États des visites | L'acheteur ne peut pas accepter. Le vendeur accepte puis confirme ; une version obsolète échoue sans nouvelle notification. L'annulation reste possible sous blocage et une visite clôturée ne change plus. | Tests exécutés, versions 1 à 4. |
| Blocage | Nouveaux messages/visites refusés ; historique accessible et annulation possible. | Tests exécutés ; périmètre interconversations également relu dans `conversation-blocks.ts` et migration 010. |
| Historique des messages | Le polling conserve les pages anciennes et déduplique les frontières, avec ordre stable à date égale. | 2 tests existants exécutés. |
| Chemin connecté | Les handlers appellent les RPC contrôlant participation, email vérifié et version. Les tables notifications/messages/visites sont filtrées par destinataire/participant ; les helpers privés sont révoqués. | Lecture seule de `supabase.ts` et migrations 001, 002, 004, 009, 010, 012, 022. Aucune nouvelle recette SQL/connectée réalisée ici. |
| Livraison email | Message-ID déterministe, bail exclusif, `uncertain` après bail expiré ou acceptation SMTP non acquittée ; ces cas ne sont pas repris automatiquement. Préférences, compte actif et adresse vérifiée filtrent les destinataires. | Source de `process-notifications.ts`, `mail.ts` et migration 004 ; tests existants sur l'URL, Message-ID et classification des erreurs. Aucun SMTP réel, aucune garantie de livraison exactement une fois revendiquée. |

## Vérifications exécutées

```text
./node_modules/.bin/tsx --test tests/messaging-reliability.test.ts tests/message-history.test.ts tests/backend-notifications.test.ts tests/backend.test.ts
19 tests réussis, 0 échec, dont 5 nouveaux.
```

Les fichiers produit attribués sont `src/components/account/messages.tsx` et le nouveau `src/components/account/visit-request-draft.ts`. Les autres livrables sont `tests/messaging-reliability.test.ts` et ce rapport. Prettier appliqué uniquement aux trois fichiers TypeScript attribués. Le build et la recette navigateur/connectée restent sous contrôle du coordinateur ; ils ne sont pas déduits des tests locaux ci-dessus.
