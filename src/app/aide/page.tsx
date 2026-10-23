import Link from "next/link";
import Footer from "@/components/Footer";
export const metadata = { title: "Aide" };
export default function Help() {
  return (
    <>
      <main id="main" className="page-shell prose">
        <h1>Aide</h1>
        <h2>Publier une annonce</h2>
        <p>
          Créez votre compte, confirmez votre email puis utilisez{" "}
          <Link href="/deposer" style={{ textDecoration: "underline" }}>
            Déposer une annonce
          </Link>
          . Le brouillon est enregistré progressivement. Une fois complète,
          l’annonce est relue avant publication.
        </p>
        <h2>Contacter un annonceur</h2>
        <p>
          Ouvrez l’annonce puis utilisez « Contacter » ou « Demander une visite
          ». Connectez-vous avec un email confirmé pour envoyer votre demande.
          Retrouvez ensuite l’échange dans votre messagerie.
        </p>
        <h2>Modifier ou retirer mon annonce</h2>
        <p>
          Retrouvez vos biens dans{" "}
          <Link href="/compte/annonces" style={{ textDecoration: "underline" }}>
            Mes annonces
          </Link>
          . Les modifications sont vérifiées avant publication. Vous pouvez
          mettre une annonce en pause, la retirer ou modifier le statut de
          chaque place lorsqu’elle est vendue ou louée.
        </p>
        <h2>Photos et plans 3D</h2>
        <p>
          Ajoutez les photos de vos places dans l’annonce. Vous pouvez aussi
          demander une vue 3D et transmettre les plans ou les mesures
          nécessaires depuis Mes annonces.
        </p>
        <h2>Signaler un problème</h2>
        <p>
          Utilisez « Signaler cette annonce » sur l’annonce concernée, ou «
          Signaler cette conversation » dans vos messages. Le suivi des
          signalements de messages est accessible depuis la messagerie.
        </p>
      </main>
      <Footer />
    </>
  );
}
