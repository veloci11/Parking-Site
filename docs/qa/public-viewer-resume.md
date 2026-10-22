# Mission 11/15 — revue bornée du viewer public

Date : 22 octobre 2026. Revue des sources présentes dans le checkout sale, sans modification de code, de rendu, de serveur ou de base. Seul ce compte rendu est ajouté. Aucun navigateur piloté pour cette revue.

## Conclusion

Aucun défaut bloquant identifié dans ce périmètre. Les interactions sélectionnent les références publiques du parking commun, avec un état de niveau et de place conservé dans l’URL et la session. La restauration d’une autre annonce du même parking sur une URL d’annonce sans paramètres est explicitement prévue par le code ; une exigence produit contraire n’a pas été établie. Ce comportement peut surprendre et reste une décision de parcours, pas une régression démontrée.

## Constats source

- `src/components/maps/ParkingViewer.tsx:474–500` : sélection locale puis `history.replaceState`, conservation des autres paramètres et du fragment, sauvegarde sous `gp:interior-selection:v1:${contextId}`. `contextId` est le parking canonique lorsqu’un groupe existe (`:442`). Aucun chargement de document demandé par cette opération.
- `ParkingViewer.tsx:503–537` : sélection d’une place limitée au niveau visible ; changement d’étage et de lot propagé par callbacks. Le lot préfère une place disponible via `preferredParkingLotUnit`, en respectant les références du même parking.
- `ParkingViewer.tsx:569–638` : lorsqu’aucun contexte parking reconnu n’est présent dans l’URL, lecture de la dernière sélection de ce parking en session. Les alias d’unités sont normalisés ; la sélection restaurée est réémise vers `ListingDetail` par `onListingSelect`. Donc visiter une autre annonce de ce parking sans `unit` peut restaurer une place d’une annonce voisine. Une URL comportant un contexte parking reconnu prend priorité sur la session ; la sélection explicite passée par le parent prend aussi priorité.
- `src/components/ListingDetail.tsx:96–123`, `:438–460`, `:769–778` : `relatedSelected` est explicite ; le titre de l’autre annonce apparaît dans le statut et un lien permet de consulter cette annonce et ses offres. Ce choix n’est pas assimilé silencieusement à une place de l’annonce courante.
- `ParkingViewer.tsx:716–755` : ordre des boutons Plan 3D, Plan 2D/Places, Photos, Carte. Le bouton 3D est désactivé sans modèle. `:334–391` fournit un repli sémantique sans plan avec boutons de places et dimensions ; `ListingDetail.tsx:515–533` garde un état de chargement, un bouton de nouvel essai en cas d’erreur et l’indication d’absence de plan. Ces branches ont été relues, sans validation visuelle dans cette revue.
- `src/components/maps/RenderedParkingLevel.tsx` : image de caméra exportée fixe, hotspots SVG associés par numéro au niveau courant, masques d’occlusion, sélection par clic et touches Entrée/Espace. Aucun déplacement de caméra introduit. Les assets approuvés restent inchangés.
- `ListingDetail.tsx:64–68`, `:696`, `:793`, `:968` : « Voir toutes les offres » cible le titre via focus puis `scrollIntoView`. Présence vérifiée dans les sources ; comportement navigateur vérifié séparément par l’agent principal.

## Vérification exécutée

```text
node_modules/.bin/tsx --test tests/interior-view.test.ts tests/parking-lot-selection.test.ts
7 tests réussis, 0 échec

node_modules/.bin/tsx --test tests/parking-render.test.ts
2 tests réussis, 0 échec
```

Les tests purs couvrent les paramètres public parking/niveau/unité, le cloisonnement et la validation des états caméra, les priorités de place disponible et les alias des lots. Les tests de rendu vérifient les numéros 12/13 au niveau −1 et 24 au niveau −2, les dimensions et empreintes exactes des images/masques et le rejet de contrats incohérents. Ils ne constituent pas une preuve visuelle d’alignement des hotspots ni un test React de restauration de session.

La vérification navigateur de l’agent principal — sélection 13 puis niveau −2/place 24 sans nouveau `PerformanceNavigationStart` — est une preuve distincte, rapportée par cet agent et non exécutée ici. Aucun audit, test ou modification supplémentaire planifié dans ce périmètre après ce constat, conformément au gel demandé.
