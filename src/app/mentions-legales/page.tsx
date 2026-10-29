import Footer from "@/components/Footer";
export const metadata = { title: "Mentions légales — préparation" };
export default function Legal() {
  return (
    <>
      <main id="main" className="page-shell prose">
        <p className="eyebrow">Avant l’ouverture publique</p>
        <h1>Mentions légales</h1>
        <p className="legal-placeholder">
          L’exploitant légal, ses coordonnées, son immatriculation, le directeur
          de publication et l’hébergeur de production doivent être renseignés et
          validés avant lancement. Cette version est un environnement de
          développement.
        </p>
        <h2>Nature du service</h2>
        <p>
          GP park. est le nom de travail d’une plateforme d’annonces de
          parkings. Elle présente les biens déclarés par les annonceurs et
          permet une mise en relation. Elle n’encaisse pas le prix immobilier et
          ne formalise pas la vente.
        </p>
        <h2>Illustrations de démonstration</h2>
        <p>
          Les biens portant la mention « démonstration », leurs prix, leurs
          illustrations et leurs plans schématiques sont fictifs. Ils ne
          constituent pas des offres réelles.
        </p>
        <h2>Cartographie et identité</h2>
        <p>
          Les crédits OpenStreetMap, OpenMapTiles et OpenFreeMap sont affichés
          sur la carte. La disponibilité du nom et du logo doit être vérifiée
          avant usage commercial. La police Inter est distribuée avec sa licence
          dans le projet.
        </p>
      </main>
      <Footer />
    </>
  );
}
