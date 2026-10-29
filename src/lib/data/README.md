# Référence géographique Île-de-France

`ile-de-france-2025.json` contient les huit départements de la région11, extraits sans simplification supplémentaire des [contours administratifs2025 de data.gouv.fr](https://www.data.gouv.fr/datasets/contours-administratifs), généralisation50m, constitués à partir d’Admin Express de l’IGN. La liste des communes, codes postaux et centres communaux provient de l’[API Découpage administratif](https://geo.api.gouv.fr/decoupage-administratif/communes), limitée à `codeRegion=11`.

Attribution : data.gouv.fr / Admin Express IGN / API Découpage administratif. Les données géographiques sont distribuées sous [ODbL1.0](https://opendatacommons.org/licenses/odbl/1-0/), indépendamment de la licence du code applicatif. Le fichier conserve les URLs sources, le millésime, la date de récupération et l’empreinte SHA256 du téléchargement original des contours compressés.

Le contrôle local utilise ces polygones et la base SQL028 charge les mêmes géométries avec PostGIS `ST_Covers`, frontières incluses. La généralisation50m est une précision cartographique du référentiel, pas une expertise cadastrale ni une vérification de l’adresse ou de la propriété. Le centre retourné par `/api/geocode` est celui de la commune et ne constitue pas le point précis d’un parking.

Les appels métier ne dépendent pas d’une requête géographique distante à chaque publication. Toute mise à jour du référentiel doit conserver les huit départements autorisés, la provenance/licence et la parité des contrôles TypeScript/SQL, avec nouvelle migration pour le référentiel connecté.
