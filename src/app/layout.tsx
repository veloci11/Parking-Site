import type { Metadata } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import Header from "@/components/Header";
import "./globals.css";
import "@/styles/select.css";
const inter = localFont({
  src: "../../public/fonts/InterVariable.woff2",
  display: "swap",
  variable: "--font-inter",
  weight: "100 900",
});
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000",
  ),
  title: {
    default: "GP park. — Votre prochaine place est ici.",
    template: "%s · GP park.",
  },
  description:
    "Explorez des parkings et box à vendre ou à louer. Carte de la ville, plans 3D, photos et état détaillé pour choisir votre prochaine place.",
  robots:
    process.env.GP_PUBLIC_LAUNCH === "true"
      ? { index: true, follow: true }
      : { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A distinct CSP nonce belongs to each rendered document, including account pages.
  await connection();
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
