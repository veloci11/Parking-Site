"use client";
import { AccountGate, AccountShell } from "./shared";
import ContextReports from "./context-reports";
import Link from "next/link";
export default function MyReports() {
  return (
    <AccountGate>
      {(user) => (
        <AccountShell user={user} title="Suivi des signalements">
          <Link href="/compte/messages" className="account-link-button">
            Retour
          </Link>
          <ContextReports />
        </AccountShell>
      )}
    </AccountGate>
  );
}
