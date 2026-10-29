import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicParking from "@/components/registry/PublicParking";
import Footer from "@/components/Footer";
type Props = { params: Promise<{ alias: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { alias } = await params;
  return {
    title: "Parking et niveaux",
    alternates: { canonical: `/parkings/${encodeURIComponent(alias)}` },
  };
}
export default async function Page({ params }: Props) {
  const { alias } = await params;
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(alias)) notFound();
  return (
    <>
      <PublicParking alias={alias} />
      <Footer />
    </>
  );
}
