import Footer from "@/components/Footer";
export const metadata = { title: "Conditions d’utilisation — préparation" };
export default function Terms() {
  return (
    <>
      <main id="main" className="page-shell prose">
        <h1>Conditions d’utilisation</h1>
        <p className="legal-placeholder">
          Document de préparation à faire valider pour l’exploitant réel avant
          ouverture publique. Aucun abonnement payant n’est activé.
        </p>
        <h2>Publier avec exactitude</h2>
        <p>
          Les annonceurs doivent disposer du droit de proposer le bien et de
          publier leurs photos et documents. Chaque prix précise s’il concerne
          une place ou un lot, et s’il s’agit d’une vente ou d’un loyer mensuel.
          Une annonce peut regrouper plusieurs places avec des offres
          distinctes. Les contraintes, défauts et informations inconnues doivent
          être décrits honnêtement.
        </p>
        <h2>Compte et modération</h2>
        <p>
          Un compte avec email confirmé permet de soumettre une annonce et de
          contacter un vendeur. Les annonces sont relues avant publication. Un
          signalement ou un contenu inexact peut conduire à une demande de
          correction, un retrait ou une restriction de compte.
        </p>
        <h2>Échanges et visites</h2>
        <p>
          Les participants conviennent directement des modalités d’une visite.
          Une demande sans horaire confirmé ne vaut pas rendez-vous. Les plans
          3D complètent les informations disponibles et ne remplacent pas la
          visite ni les vérifications du bien.
        </p>
        <h2>Gratuité et évolutions</h2>
        <p>
          Le dépôt est gratuit dans la V1, dans la limite de protection du
          service. Des forfaits mensuels pourront être proposés dans un second
          temps, après définition de l’offre et de ses conditions. Aucun
          paiement à l’annonce ni encaissement du prix immobilier n’est prévu
          dans cette version.
        </p>
      </main>
      <Footer />
    </>
  );
}
