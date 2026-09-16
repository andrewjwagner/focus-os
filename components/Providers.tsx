"use client";

import { AuthProvider } from "@/lib/auth";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </AuthGate>
    </AuthProvider>
  );
}
