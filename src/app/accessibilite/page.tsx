import Footer from "@/components/Footer";
export const metadata = { title: "Accessibilité" };
export default function Accessibility() {
  return (
    <>
      <main id="main" className="page-shell prose">
        <h1>Explorer à votre manière.</h1>
        <p>
          La liste, les fiches, les photos et les caractéristiques restent
          accessibles indépendamment de la carte et du rendu 3D. Les espaces
          peuvent être choisis dans une liste lorsque WebGL est indisponible.
        </p>
        <h2>Navigation et affichage</h2>
        <p>
          Utilisez Tab pour parcourir les liens et contrôles. Le lien « Aller au
          contenu » apparaît au début de la page au clavier. Les animations
          respectent la préférence de réduction des mouvements de votre système.
        </p>
        <div className="notice">
          Aucun audit de conformité réglementaire complet n’est revendiqué. Les
          contrôles de contraste et les tests locaux sont décrits dans la
          documentation du projet.
        </div>
      </main>
      <Footer />
    </>
  );
}
