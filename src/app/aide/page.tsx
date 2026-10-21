import Link from "next/link";
import Footer from "@/components/Footer";
export const metadata = { title: "Aide et contact" };
export default function Help() {
  return (
    <>
      <main id="main" className="page-shell prose">
        <p className="eyebrow">Un peu de clarté</p>
        <h1>Comment pouvons-nous vous aider ?</h1>
        <h2>Publier une annonce</h2>
        <p>
          Créez votre compte, confirmez votre email puis utilisez{" "}
          <Link href="/deposer" style={{ textDecoration: "underline" }}>
            Déposer une annonce
          </Link>
          . Le brouillon est enregistré progressivement. Une fois complète,
          l’annonce est relue avant publication.
        </p>
        <h2>Contacter un vendeur</h2>
        <p>
          Sur une fiche, cliquez sur « Demander une visite ». Votre email doit
          être confirmé. Les échanges sont privés et une visite reste à
          organiser jusqu’à confirmation d’un horaire par le vendeur.
        </p>
        <h2>Modifier ou retirer mon annonce</h2>
        <p>
          Retrouvez vos biens dans{" "}
          <Link href="/compte/annonces" style={{ textDecoration: "underline" }}>
            Mes annonces
          </Link>
          . Les modifications sont soumises à une nouvelle relecture. Vous
          pouvez mettre une publication en pause, la marquer vendue ou la
          retirer.
        </p>
        <h2>Photos et plans 3D</h2>
        <p>
          Utilisez uniquement des photos et des plans que vous avez le droit de
          publier. Documentez les défauts et les contraintes réelles. Un plan
          intérieur n’est pas créé automatiquement à partir d’une photo ; il
          nécessite des mesures et des sources contrôlées.
        </p>
        <h2>Signaler un problème</h2>
        <p>
          Sur chaque fiche, « Signaler cette annonce » permet d’envoyer un motif
          à la modération après connexion.
        </p>
        <div className="notice">
          Plateforme en préparation. Les coordonnées de support de l’exploitant
          seront renseignées avant l’ouverture publique ; aucun faux formulaire
          de contact n’est affiché.
        </div>
      </main>
      <Footer />
    </>
  );
}
