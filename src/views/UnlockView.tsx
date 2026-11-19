// Passphrase setup / unlock screen. Shown after sign-in, before the
// archive opens, whenever encryption is not yet unlocked for this
// session. The passphrase itself is never stored anywhere: it derives
// the key in memory, and forgetting it means the sealed papers cannot
// be recovered (the screen says so plainly).

import { useState, type JSX } from "react";
import type { Firestore } from "firebase/firestore";
import type { User } from "firebase/auth";
import { ErrorPanel } from "../components/feedback";
import { setupEncryption, unlockEncryption } from "../data/encryption";
import { AppError, toAppError } from "../errors";

interface UnlockViewProps {
  mode: "setup" | "unlock";
  services: { db: Firestore };
  user: User;
  onUnlocked: (key: CryptoKey) => void;
}

export function UnlockView({ mode, services, user, onUnlocked }: UnlockViewProps): JSX.Element {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const submit = async (): Promise<void> => {
    if (mode === "setup" && passphrase !== confirm) {
      setError(
        new AppError("validation", "The two passphrases do not match.", "Type the same passphrase in both fields."),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const key =
        mode === "setup"
          ? await setupEncryption(services.db, user.uid, passphrase)
          : await unlockEncryption(services.db, user.uid, passphrase);
      onUnlocked(key);
    } catch (submitError) {
      setError(toAppError(submitError, mode === "setup" ? "Setting up encryption failed" : "Unlocking failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-main">
      <div className="setup-sheet">
        <h1>{mode === "setup" ? "Seal your archive" : "Unlock your archive"}</h1>
        {mode === "setup" ? (
          <p>
            Before the first paper, set an encryption passphrase. Papers are encrypted on this device
            with AES-GCM before they reach Firestore, and only this passphrase can open them again.
            The passphrase is never stored anywhere. If you forget it, your papers cannot be
            recovered - there is no reset. Write it down somewhere safe.
          </p>
        ) : (
          <p>
            Your papers are sealed with your encryption passphrase. Enter it to open the archive on
            this device. The passphrase itself is never sent or stored.
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label htmlFor="encryption-passphrase">
              {mode === "setup" ? "Encryption passphrase (at least 8 characters)" : "Encryption passphrase"}
            </label>
            <input
              id="encryption-passphrase"
              className="text-input"
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              autoComplete={mode === "setup" ? "new-password" : "current-password"}
              autoFocus
            />
          </div>
          {mode === "setup" ? (
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="encryption-passphrase-confirm">Repeat the passphrase</label>
              <input
                id="encryption-passphrase-confirm"
                className="text-input"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
              />
            </div>
          ) : null}
          {error !== null ? <ErrorPanel error={error} /> : null}
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="button button-primary" disabled={busy || passphrase === ""}>
              {busy ? (mode === "setup" ? "Sealing…" : "Unlocking…") : mode === "setup" ? "Seal the archive" : "Unlock"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
