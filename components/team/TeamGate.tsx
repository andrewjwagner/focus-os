"use client";

import { FormEvent, useState, type ReactNode } from "react";
import { MIN_PASSPHRASE_LENGTH } from "@/lib/team/crypto";
import { useTeam } from "@/lib/team/context";
import { fieldClass } from "@/lib/ui";

export const RESET_CONFIRM_WORD = "RESET";

/** Forgot-passphrase flow: explain exactly what is deleted, require typing RESET. */
function ResetTeamData({ onCancel }: { onCancel: () => void }) {
  const team = useTeam();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = typed.trim() === RESET_CONFIRM_WORD;

  async function onReset(event: FormEvent) {
    event.preventDefault();
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await team.resetTeam();
    } catch {
      setError("Reset failed. Nothing was deleted.");
      setBusy(false);
    }
  }

  return (
    <section
      role="alertdialog"
      aria-labelledby="reset-team-title"
      className="max-w-xl space-y-4 rounded-2xl border border-danger/50 bg-bg-elev p-5"
    >
      <h2 id="reset-team-title" className="font-display text-2xl text-ink">
        Reset Team data on this device?
      </h2>
      <p className="text-sm leading-6 text-muted">
        Without the passphrase your Team data cannot be decrypted. Resetting{" "}
        <strong className="text-ink">permanently deletes</strong> all encrypted Team data stored in this
        browser:
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
        <li>Pulse ratings</li>
        <li>Moments</li>
        <li>Coaching plan</li>
        <li>AI results, talking points, and recap drafts</li>
        <li>Action items and your owner edits</li>
        <li>Synced notes cache</li>
      </ul>
      <p className="text-sm leading-6 text-muted">
        Kept: your people list and their Granola folder names, your name, and everything in Capture and
        Projects. After you set a new passphrase, your Granola notes re-sync automatically. Moments, pulse
        ratings, coaching items, and edits you made by hand cannot be brought back.
      </p>
      <form onSubmit={onReset} className="space-y-3">
        <label className="block text-sm text-muted">
          Type <span className="font-mono text-ink">{RESET_CONFIRM_WORD}</span> to confirm
          <input
            className={`${fieldClass} mt-1 font-mono`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label={`Type ${RESET_CONFIRM_WORD} to confirm`}
            autoFocus
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!confirmed || busy}
            className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-bg disabled:opacity-40"
          >
            {busy ? "Deleting..." : "Permanently delete Team data"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-line px-4 py-2 text-sm text-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

/** Team data is encrypted at rest. This gate sets or asks for the passphrase. */
export function TeamGate({ children }: { children: ReactNode }) {
  const team = useTeam();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  if (!team.ready) return <p className="text-muted">Loading...</p>;
  if (team.unlocked) return <>{children}</>;

  const creating = !team.hasVault;
  if (resetting && !creating) return <ResetTeamData onCancel={() => setResetting(false)} />;

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
        setResetting(false);
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
            ? team.resetPending
              ? "Team data was reset. Choose a new passphrase and your Granola notes will re-sync."
              : "Meeting notes, action items, and moments are encrypted in this browser with a key made from this passphrase. It is never stored or sent anywhere. If you forget it, Team data cannot be recovered."
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
        {creating ? (
          <p className="text-xs leading-5 text-muted">
            Tip: save this passphrase in a password manager (1Password, Bitwarden, iCloud Keychain). There is
            no way to recover it.
          </p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !passphrase}
          className="rounded-full bg-focus px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
        >
          {busy ? "Working..." : creating ? "Create and unlock" : "Unlock"}
        </button>
        {!creating ? (
          <p>
            <button
              type="button"
              onClick={() => setResetting(true)}
              className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Forgot passphrase? Reset Team data
            </button>
          </p>
        ) : null}
      </form>
    </div>
  );
}
