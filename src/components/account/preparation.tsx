import Link from "next/link";

export default function DepositSignIn() {
  return (
    <main
      id="main"
      className="page-shell account-wizard-start account-deposit-entry"
    >
      <h1>Déposer une annonce</h1>
      <p>Connectez-vous pour créer et gérer votre annonce.</p>
      <div className="account-review-actions">
        <Link
          className="button button-primary"
          href="/connexion?next=%2Fdeposer"
        >
          Se connecter
        </Link>
        <Link
          className="button button-secondary"
          href="/inscription?next=%2Fdeposer"
        >
          Créer un compte
        </Link>
      </div>
    </main>
  );
}
