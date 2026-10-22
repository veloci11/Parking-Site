import Link from "next/link";
import { MapPinned, MessageCircle, KeyRound } from "lucide-react";
import Footer from "@/components/Footer";
export const metadata = { title: "Comment acheter un parking" };
export default function HowToBuy() {
  return (
    <>
      <main id="main" className="page-shell">
        <p className="eyebrow">De la découverte à la visite</p>
        <h1>Votre place. En toute clarté.</h1>
        <p className="content-lead">
          Explorez un quartier, regardez chaque détail du parking et échangez
          directement avec le vendeur.
        </p>
        <div className="steps-grid">
          {[
            {
              icon: MapPinned,
              title: "Trouvez le bon emplacement",
              text: "Comparez les prix totaux, les dimensions et le type de parking. La carte situe les biens ; les plans intérieurs disponibles précisent la place et ses contraintes.",
            },
            {
              icon: MessageCircle,
              title: "Posez toutes vos questions",
              text: "Consultez les photos et l’état déclaré. Demandez les informations manquantes : charges, accès, hauteur libre, occupation et documents du bien.",
            },
            {
              icon: KeyRound,
              title: "Visitez avant de décider",
              text: "Demandez une visite dans la messagerie. Vérifiez sur place la manœuvre, les accès, les dimensions et l’état réel. Formalisez ensuite la vente avec les professionnels compétents.",
            },
          ].map((step, i) => (
            <article className="card" key={step.title}>
              <span className="step-number">{i + 1}</span>
              <step.icon size={28} color="#6D28FF" />
              <h2 style={{ marginTop: 24 }}>{step.title}</h2>
              <p className="muted">{step.text}</p>
            </article>
          ))}
        </div>
        <section className="card prose">
          <h2>La 3D aide à comprendre le lieu.</h2>
          <p>
            Un schéma représentatif pour mieux comprendre le parking et ses
            places.
          </p>
          <p>
            GP park. facilite la mise en relation. Le prix du bien est affiché,
            mais son paiement et la signature de la vente sont réalisés hors de
            la plateforme.
          </p>
          <Link className="button button-primary" href="/">
            Trouver ma prochaine place
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
