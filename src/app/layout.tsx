import type { Metadata } from "next";
import localFont from "next/font/local";
import Header from "@/components/Header";
import "./globals.css";
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
    "Explorez des parkings et box à vendre. Carte de la ville, plans 3D, photos et état détaillé pour choisir votre prochaine place.",
  robots:
    process.env.GP_PUBLIC_LAUNCH === "true"
      ? { index: true, follow: true }
      : { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
