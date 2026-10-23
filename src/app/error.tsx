"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="page-shell">
      <h1>Une interruption passagère.</h1>
      <p>
        Nous n’avons pas pu afficher cette page. Vos données enregistrées sont
        conservées.
      </p>
      <button className="button button-primary" onClick={reset}>
        Réessayer
      </button>
    </main>
  );
}
