import type { JSX } from "react";

/**
 * Setup state: shown when Firebase configuration is missing. This is an
 * honest stopped state with real setup steps — the app never pretends to
 * work without a project, and never shows fake papers or fake AI output.
 */
export function SetupView({ missingKeys }: { missingKeys: string[] }): JSX.Element {
  return (
    <main className="app-main">
      <div className="setup-sheet">
        <h1>Hushfolio is not configured yet</h1>
        <p>
          This app needs your own Firebase project before it can do anything. Nothing here is a
          demo: no papers and no AI results exist until a real project is connected.
        </p>

        <div className="missing-keys">
          <strong>Missing environment values:</strong>
          <ul>
            {missingKeys.map((key) => (
              <li key={key}>
                <code>{key}</code>
              </li>
            ))}
          </ul>
        </div>

        <ol>
          <li>
            Create a Firebase project in the{" "}
            <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">
              Firebase console
            </a>{" "}
            and register a Web app to get its configuration object.
          </li>
          <li>
            In the console, open <strong>AI Services &gt; AI Logic</strong>, click Get started, and
            choose the <strong>Gemini Developer API</strong> provider. The guided workflow enforces
            App Check for AI Logic.
          </li>
          <li>
            Enable <strong>Authentication</strong> with the Anonymous and Google sign-in methods.
          </li>
          <li>
            Create a <strong>Firestore</strong> database and publish the rules in{" "}
            <code>firestore.rules</code> from this repository.
          </li>
          <li>
            In <strong>App Check</strong>, register the app with a reCAPTCHA Enterprise site key. For local
            development, set <code>VITE_APPCHECK_DEBUG=true</code> and register the debug token
            printed in the browser console.
          </li>
          <li>
            Copy <code>.env.example</code> to <code>.env</code>, fill in the values from your
            project, and restart the dev server.
          </li>
          <li>
            For on-device inference, use Chrome on desktop (version 139 or higher) and enable{" "}
            <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code>, then restart
            Chrome. The on-device model downloads on first use from the Status view.
          </li>
        </ol>

        <button type="button" className="button button-primary" onClick={() => window.location.reload()}>
          Check configuration again
        </button>
      </div>
    </main>
  );
}
