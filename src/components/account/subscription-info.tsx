import Link from "next/link";
export default function SubscriptionInfo() {
  return (
    <section
      className="card account-settings-card"
      style={{ padding: 24, marginTop: 24 }}
    >
      <h2>Forfaits</h2>
      <p>
        Les abonnements ne sont pas encore disponibles. Aucun paiement n’est
        demandé pour publier une annonce actuellement.
      </p>
      <Link className="button button-primary" href="/deposer">
        Déposer une annonce
      </Link>
    </section>
  );
}
