"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="page-shell">
      <h1>Impossible d’afficher cette page</h1>
      <p>
        Le service est momentanément indisponible. Réessayez dans un instant.
      </p>
      <button className="button button-primary" onClick={reset}>
        Réessayer
      </button>
    </main>
  );
}
