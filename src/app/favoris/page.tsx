import type { Metadata } from "next";
import Explorer from "@/components/Explorer";
export const metadata: Metadata = {
  title: "Mes favoris",
  robots: { index: false, follow: false },
};
export default function FavoritesPage() {
  return <Explorer favoritesOnly />;
}
