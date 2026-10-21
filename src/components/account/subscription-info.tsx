import Link from "next/link";
export default function SubscriptionInfo() {
  return (
    <section
      className="card account-settings-card"
      style={{ padding: 24, marginTop: 24 }}
    >
      <span className="badge">V2 · INDISPONIBLE ACTUELLEMENT</span>
      <h2>Des forfaits mensuels, dans un second temps.</h2>
      <p>
        La publication reste gratuite pendant la V1, dans les limites et après
        la modération prévues par la plateforme. Aucun forfait payant ne peut
        être souscrit actuellement.
      </p>
      <p>
        Les offres, leurs tarifs et leurs droits seront précisés avant leur
        activation. Aucun abonnement ni prélèvement ne sera créé sans votre
        choix explicite.
      </p>
      <p className="notice">
        Aucun paiement par annonce et aucun encaissement du prix du parking ne
        sont proposés ici.
      </p>
      <Link className="button button-primary" href="/deposer">
        Préparer une annonce gratuite
      </Link>
    </section>
  );
}
