import type { Metadata } from "next";
import SubscriptionInfo from "@/components/account/subscription-info";
export const metadata: Metadata = {
  title: "Forfaits · prévus en V2",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main id="main" className="page-shell">
      <h1>Les forfaits arriveront plus tard.</h1>
      <SubscriptionInfo />
    </main>
  );
}
