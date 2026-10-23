import Link from "next/link";
import { MapPinned, MessageCircle, KeyRound } from "lucide-react";
import Footer from "@/components/Footer";
export const metadata = { title: "Acheter ou louer un parking" };
export default function HowToBuy() {
  return (
    <>
      <main id="main" className="page-shell">
        <h1>Acheter ou louer un parking</h1>
        <div className="steps-grid">
          {[
            {
              icon: MapPinned,
              title: "Rechercher",
              text: "Choisissez une ville, un budget et le type de parking. Consultez les résultats sur la carte ou dans la liste.",
            },
            {
              icon: MessageCircle,
              title: "Consulter l’annonce",
              text: "Vérifiez le prix, les dimensions, les accès et les charges. Les photos et les plans disponibles complètent la description. Contactez l’annonceur pour les précisions manquantes.",
            },
            {
              icon: KeyRound,
              title: "Organiser une visite",
              text: "Proposez un rendez-vous depuis l’annonce. Retrouvez les échanges et la confirmation de la visite dans vos messages.",
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
        <Link className="button button-primary" href="/">
          Rechercher un parking
        </Link>
      </main>
      <Footer />
    </>
  );
}
