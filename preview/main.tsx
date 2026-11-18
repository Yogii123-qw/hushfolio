import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "firebase/auth";
import type { AppContext, ViewId } from "../src/appContext";
import { Drawer } from "../src/components/Drawer";
import { REMOTE_CONFIG_DEFAULTS } from "../src/platform/remoteconfig";
import type { FirebaseServices } from "../src/platform/firebase";
import { LedgerView } from "../src/views/LedgerView";
import { PaperView } from "../src/views/PaperView";
import { EMPTY_DRAFT, PapersView, type ComposeDraft } from "../src/views/PapersView";
import { SettingsView } from "../src/views/SettingsView";
import { StatusView } from "../src/views/StatusView";
import "../src/design-tokens.css";
import "../src/styles.css";
import { FIXTURE_PAPERS } from "./fixtures/data";

// PREVIEW HARNESS — dev-only visual review shell. Fixture data, fake
// services, no Firebase. Never part of the shipped app bundle.

const fakeServices = {
  projectId: "preview-project",
  db: {},
  ai: {},
  auth: {},
  remoteConfig: {},
  app: {},
} as unknown as FirebaseServices;

const fakeUser = {
  uid: "preview-user-uid",
  isAnonymous: true,
  email: null,
  metadata: { creationTime: "2026-11-19T00:00:00.000Z", lastSignInTime: "2026-11-19T00:00:00.000Z" },
} as unknown as User;

function Harness() {
  const [view, setView] = useState<ViewId>("papers");
  const [openPaperId, setOpenPaperId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<ComposeDraft>(EMPTY_DRAFT);
  const [strictMode, setStrictMode] = useState(false);
  const [online, setOnline] = useState(true);

  const navigate = (next: ViewId) => {
    setView(next);
    setOpenPaperId(null);
    setComposing(false);
  };

  const ctx: AppContext = {
    services: fakeServices,
    user: fakeUser,
    config: REMOTE_CONFIG_DEFAULTS,
    configMeta: { fetched: true, invalidKeys: [], fetchErrorCode: null },
    appCheck: { mode: "recaptcha", detail: "Preview fixture: App Check reported active." },
    deviceProbe: {
      status: "available",
      detail: "Preview fixture: the on-device model is reported ready.",
      raw: "available",
    },
    strictMode,
    online,
    onStrictModeChange: setStrictMode,
    onRefreshDeviceProbe: () => {},
    onNavigate: navigate,
    onOpenPaper: (paperId) => {
      setView("papers");
      setOpenPaperId(paperId);
      setComposing(false);
    },
    onSignOut: () => {},
    recordLedger: async () => {},
  };

  return (
    <div>
      <div
        style={{
          background: "#8a5a00",
          color: "#fdfcf9",
          padding: "8px 16px",
          fontSize: 14,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <strong>PREVIEW HARNESS — fixture data for visual review only. Not the shipped app.</strong>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={strictMode} onChange={(e) => setStrictMode(e.target.checked)} />
          Strict mode
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
          Online
        </label>
        <button
          type="button"
          onClick={() => setOpenPaperId(FIXTURE_PAPERS[0]?.id ?? null)}
          style={{ padding: "4px 10px" }}
        >
          Open first paper
        </button>
      </div>
      <div className="app-shell">
        <Drawer
          currentView={openPaperId !== null ? "papers" : view}
          onNavigate={navigate}
          onNewPaper={() => {
            setView("papers");
            setOpenPaperId(null);
            setComposing(true);
          }}
          userLabel="Preview account"
          online={online}
          strictMode={strictMode}
        />
        <main className="app-main">
          {!online ? (
            <div className="offline-banner" role="status">
              You are offline. AI actions will use the on-device model only, and papers cannot be
              saved until you are back online.
            </div>
          ) : null}
          {openPaperId !== null ? (
            <PaperView ctx={ctx} paperId={openPaperId} onBack={() => setOpenPaperId(null)} onDeleted={() => setOpenPaperId(null)} />
          ) : view === "papers" ? (
            <PapersView
              ctx={ctx}
              composing={composing}
              onComposingChange={setComposing}
              draft={draft}
              onDraftChange={setDraft}
              onOpenPaper={(id) => setOpenPaperId(id)}
            />
          ) : view === "ledger" ? (
            <LedgerView ctx={ctx} />
          ) : view === "status" ? (
            <StatusView ctx={ctx} />
          ) : (
            <SettingsView ctx={ctx} />
          )}
        </main>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Root element #root is missing from preview/index.html.");
}

createRoot(rootElement).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
