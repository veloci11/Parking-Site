import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import ListingDetail from "@/components/ListingDetail";
import Footer from "@/components/Footer";
import { loadPublicListing } from "@/server/catalog";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string; slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return { title: "Annonce indisponible" };
  const l = await loadPublicListing(id);
  return {
    title: l ? `${l.title} · ${l.city}` : "Annonce indisponible",
    description: l?.description.slice(0, 160),
    alternates: l ? { canonical: `/annonces/${l.id}/${l.slug}` } : undefined,
    robots: l?.isDemo ? { index: false, follow: false } : undefined,
  };
}
export default async function ListingPage({ params }: Props) {
  const { id, slug } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) notFound();
  const listing = await loadPublicListing(id);
  if (!listing) notFound();
  if (slug !== listing.slug)
    permanentRedirect(`/annonces/${listing.id}/${listing.slug}`);
  return (
    <>
      <ListingDetail key={listing.id} listing={listing} />
      <Footer />
    </>
  );
}
