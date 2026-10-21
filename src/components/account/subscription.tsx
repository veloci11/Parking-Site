"use client";
import { AccountGate, AccountShell } from "./shared";
import EntitlementUsage from "./entitlement-usage";
import SubscriptionInfo from "./subscription-info";
export default function Subscription() {
  return (
    <AccountGate>
      {(user) => (
        <AccountShell user={user} title="Mon abonnement">
          <EntitlementUsage />
          <SubscriptionInfo />
        </AccountShell>
      )}
    </AccountGate>
  );
}
