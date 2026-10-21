import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="page-shell">
      <span className="eyebrow">404</span>
      <h1>Cette place n’est pas ici.</h1>
      <p className="muted">
        La page demandée n’existe pas ou n’est plus disponible.
      </p>
      <Link className="button button-primary" href="/">
        Explorer les parkings
      </Link>
    </main>
  );
}
