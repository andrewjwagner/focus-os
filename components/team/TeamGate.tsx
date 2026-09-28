"use client";

import { FormEvent, useState, type ReactNode } from "react";
import { MIN_PASSPHRASE_LENGTH } from "@/lib/team/crypto";
import { useTeam } from "@/lib/team/context";
import { fieldClass } from "@/lib/ui";

/** Team data is encrypted at rest. This gate sets or asks for the passphrase. */
export function TeamGate({ children }: { children: ReactNode }) {
  const team = useTeam();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!team.ready) return <p className="text-muted">Loading…</p>;
  if (team.unlocked) return <>{children}</>;

  const creating = !team.hasVault;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (creating) {
      if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        setError(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
        return;
      }
      if (passphrase !== confirm) {
        setError("Passphrases do not match.");
        return;
      }
    }
    setBusy(true);
    try {
      if (creating) {
        await team.setPassphrase(passphrase);
      } else if (!(await team.unlock(passphrase))) {
        setError("That passphrase did not unlock your Team data.");
      }
    } catch {
      setError("Could not open the Team vault in this browser.");
    } finally {
      setBusy(false);
      setPassphrase("");
      setConfirm("");
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-focus">Team</p>
        <h1 className="mt-2 font-display text-4xl text-ink">
          {creating ? "Set a Team passphrase" : "Unlock Team"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          {creating
            ? "Meeting notes, action items, and moments are encrypted in this browser with a key made from this passphrase. It is never stored or sent anywhere. If you forget it, Team data cannot be recovered."
            : "Enter your passphrase to decrypt Team data for this session."}
        </p>
      </section>
      <form onSubmit={onSubmit} className="max-w-sm space-y-3">
        <input
          type="password"
          autoComplete={creating ? "new-password" : "current-password"}
          className={fieldClass}
          placeholder="Passphrase"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          autoFocus
        />
        {creating ? (
          <input
            type="password"
            autoComplete="new-password"
            className={fieldClass}
            placeholder="Confirm passphrase"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !passphrase}
          className="rounded-full bg-focus px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
        >
          {busy ? "Working…" : creating ? "Create and unlock" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
