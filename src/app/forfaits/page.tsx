import type { Metadata } from "next";
import SubscriptionInfo from "@/components/account/subscription-info";
export const metadata: Metadata = {
  title: "Forfaits",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main id="main" className="page-shell">
      <h1>Forfaits</h1>
      <SubscriptionInfo />
    </main>
  );
}
