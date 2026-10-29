# Premier administrateur

Les membres disposent d’un compte unique pour acheter, vendre ou louer. Le rôle `moderator` traite les annonces et les signalements ; `admin` gère aussi les comptes, les rôles, les limites et le registre des parkings. Les opérations privilégiées connectées exigent une session MFA AAL2.

La démonstration locale ajoute un compte **Administrateur** distinct dans les accès fictifs. Ce raccourci reste interdit dans l’adaptateur Supabase et sur une origine distante ; il ne crée aucun compte humain.

Pour le premier opérateur connecté,029 ajoute une réservation privée, valable30 jours par défaut, fondée sur le SHA256 d’un email normalisé. L’opérateur de la base crée cette réservation après autorisation du propriétaire. Aucun email, mot de passe ou secret n’est embarqué dans les migrations ni dans le navigateur. Les membres ne peuvent lire, créer ou réclamer une réservation par RPC.

L’utilisateur s’inscrit par le parcours normal et confirme son email avec Supabase Auth. Un trigger ne promeut que ce compte confirmé, actif et réservé, à condition qu’aucun autre administrateur actif n’existe. La réservation est consommée une seule fois et l’attribution est auditée. Les champs `user_metadata`, modifiables par un membre, ne servent jamais à cette décision.

Une réservation ne constitue pas un compte créé ni un email reçu. L’activation n’est effective qu’après inscription et confirmation. L’administrateur doit ensuite configurer son authentificateur dans `/compte/securite`. Un accès de secours ou un second administrateur relève d’une intervention opérateur explicite, pas d’une réouverture automatique du bootstrap.

Pour une base contenant déjà un compte confirmé autorisé, l’opérateur peut appeler `gp_private.claim_owner_admin(uuid)` après avoir créé la réservation et vérifié l’identité ciblée. Cette fonction n’est pas exposée aux clients. Aucun rôle n’est attribué à un autre compte par connaissance d’un email.

La recette `supabase/tests/owner-admin-bootstrap.sql` emploie exclusivement des identités fictives et annule sa transaction : email non confirmé, métadonnées usurpées, premier propriétaire confirmé, attribution unique, journal et refus d’un second bootstrap. Elle ne prouve pas la livraison d’un email réel.

Le coordinateur a confirmé l’application permanente de029 et la réussite de la recette entière sur le vrai Supabase en transaction annulée. Une revue indépendante du SQL et des permissions n’a confirmé aucun problème : la recette complémentaire `supabase/tests/owner-admin-bootstrap-review.sql` a vérifié de vrais refus sous `anon` et `authenticated`, la normalisation de l’email, le statut actif, l’expiration et l’attribution unique sur un clone PostgreSQL14 isolé. Deux confirmations concurrentes y ont abouti à un seul admin, une seule réservation consommée et un seul événement d’attribution. Le champ Auth `email` a été ajouté au stub du clone ; aucun schéma Auth réel n’a été modifié par cette revue. [Le relevé029](qa/owner-admin-bootstrap.json) sépare ces preuves locales de la recette distante et du parcours humain encore à effectuer.
