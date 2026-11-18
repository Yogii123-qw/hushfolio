import type { JSX } from "react";
import { AppError } from "../errors";
import { ErrorPanel } from "../components/feedback";
import { SealIcon } from "../components/icons";

interface SignInViewProps {
  busy: boolean;
  error: AppError | null;
  onAnonymous: () => void;
  onGoogle: () => void;
}

export function SignInView({ busy, error, onAnonymous, onGoogle }: SignInViewProps): JSX.Element {
  return (
    <main className="app-main">
      <div className="signin-sheet">
        <div className="signin-seal">
          <SealIcon size={44} />
        </div>
        <h1>Your papers stay yours</h1>
        <p>
          Hushfolio is a private archive. Sensitive scans run only on this device, and every AI run
          is recorded in a ledger that shows exactly where it ran. Sign in to open your archive.
        </p>

        <div className="signin-actions">
          <button type="button" className="button button-primary" onClick={onAnonymous} disabled={busy}>
            Continue anonymously
          </button>
          <button type="button" className="button button-secondary" onClick={onGoogle} disabled={busy}>
            Sign in with Google
          </button>
        </div>

        {error !== null ? <ErrorPanel error={error} /> : null}

        <p className="signin-note">
          Anonymous sign-in needs no email and no password. Your archive is tied to the anonymous
          identity of this browser: if you clear site data or switch browsers, the archive stays
          behind. Export regularly from Settings. Signing in with Google creates a separate,
          empty archive under that account.
        </p>
      </div>
    </main>
  );
}
