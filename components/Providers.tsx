"use client";

import { AuthProvider } from "@/lib/auth";
import { StoreProvider } from "@/lib/store";
import { TeamProvider } from "@/lib/team/context";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>
        <StoreProvider>
          <TeamProvider>
            <AppShell>{children}</AppShell>
          </TeamProvider>
        </StoreProvider>
      </AuthGate>
    </AuthProvider>
  );
}
