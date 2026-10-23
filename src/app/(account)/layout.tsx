import type { Metadata } from "next";
import "@/styles/account.css";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
