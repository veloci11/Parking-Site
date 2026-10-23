import type { Metadata } from "next";
import Link from "next/link";
import { loadPublicListing } from "@/server/catalog";
export const metadata: Metadata = {
  title: "Signaler une annonce",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ annonce?: string; listing?: string }>;
}) {
  const params = await searchParams,
    id = params.annonce || params.listing;
  const listing =
    id && /^[a-f0-9-]{36}$/.test(id) ? await loadPublicListing(id) : null;
  return (
    <main id="main" className="page-shell prose">
      <p className="eyebrow">MODÉRATION</p>
      <h1>Signaler un problème sur une annonce.</h1>
      <p>
        Ouvrez la fiche concernée puis utilisez « Signaler cette annonce », sous
        les informations du bien. Connectez-vous pour transmettre un motif lié à
        cette annonce à la modération.
      </p>
      {listing ? (
        <Link
          className="button button-primary"
          href={`/annonces/${listing.id}/${listing.slug}`}
        >
          Ouvrir la fiche concernée
        </Link>
      ) : (
        <Link className="button button-primary" href="/explorer">
          Retrouver l’annonce
        </Link>
      )}
      <p className="notice">
        Cette page n’enregistre aucun signalement et n’envoie aucun message de
        support. Un accusé apparaît uniquement après l’enregistrement réel dans
        le formulaire de la fiche.
      </p>
      <p>
        Pour comprendre le fonctionnement et les limites de ce parcours,
        consultez <Link href="/aide">l’aide</Link>. Les coordonnées du support
        de l’opérateur seront précisées avant l’ouverture publique.
      </p>
    </main>
  );
}
