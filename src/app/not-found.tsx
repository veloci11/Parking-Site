import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="page-shell">
      <span className="eyebrow">404</span>
      <h1>Page introuvable</h1>
      <p className="muted">
        La page demandée n’existe pas ou n’est plus disponible.
      </p>
      <Link className="button button-primary" href="/">
        Voir les annonces
      </Link>
    </main>
  );
}
