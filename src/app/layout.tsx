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
    default: "GP park. — Parkings à vendre et à louer",
    template: "%s · GP park.",
  },
  description:
    "Parkings et box à vendre ou à louer à Paris et en Île-de-France. Consultez les annonces, les photos et les plans disponibles.",
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
