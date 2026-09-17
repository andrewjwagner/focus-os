"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [email, setEmail] = useState("");

  if (!auth.ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading Focus OS…
      </div>
    );
  }

  if (auth.session) return <>{children}</>;

  function onLocalSubmit(event: FormEvent) {
    event.preventDefault();
    auth.signInLocal(email);
  }

  const unauthorizedMessage = auth.allowed
    ? `This app is gated. Signed-in email must be ${auth.allowed}.`
    : "Enter a non-empty email to continue locally.";

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-card p-8 shadow-xl">
        <p className="text-xs uppercase tracking-[0.2em] text-focus">Focus OS</p>
        <h1 className="mt-3 font-display text-3xl text-ink">Personal command center</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Local-first projects, ideas, and todos. Not a life dashboard, Notion clone,
          or team tool.
        </p>

        {auth.unauthorized ? (
          <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {unauthorizedMessage}
          </p>
        ) : null}
        {auth.error ? (
          <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {auth.error}
          </p>
        ) : null}

        {auth.firebaseEnabled ? (
          <button
            type="button"
            onClick={() => void auth.signInGoogle()}
            className="mt-6 w-full rounded-full bg-focus px-4 py-2.5 text-sm font-medium text-bg hover:bg-focus/90"
          >
            Sign in with Google
          </button>
        ) : (
          <>
            <p className="mt-6 rounded-lg border border-line bg-bg-elev px-3 py-2 text-xs leading-5 text-muted">
              Firebase is not configured. Local mode. Data stays in this browser.
            </p>
            <form onSubmit={onLocalSubmit} className="mt-4 space-y-3">
              <label className="block text-sm text-muted">
                {auth.allowed ? "Allowed email" : "Email"}
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-focus"
                  placeholder={auth.allowed || "you@example.com"}
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-full bg-focus px-4 py-2.5 text-sm font-medium text-bg hover:bg-focus/90"
              >
                Continue locally
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
