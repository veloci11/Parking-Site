"use client";
import { AccountGate, AccountShell } from "./shared";
import ContextReports from "./context-reports";
export default function MyReports() {
  return (
    <AccountGate>
      {(user) => (
        <AccountShell user={user} title="Suivre mes signalements">
          <ContextReports />
        </AccountShell>
      )}
    </AccountGate>
  );
}
