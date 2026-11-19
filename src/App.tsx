import { Component, useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import type { User } from "firebase/auth";
import type { LedgerRecordInput } from "./ai/actions";
import type { AppContext, ConfigMeta, ViewId } from "./appContext";
import { Drawer } from "./components/Drawer";
import { ErrorPanel } from "./components/feedback";
import { SealIcon } from "./components/icons";
import { recordLedgerRun } from "./data/ledger";
import { AppError, toAppError } from "./errors";
import { readAppCheckOptions, type AppCheckStatus } from "./platform/appcheck";
import { signInAnonymouslyFlow, signInWithGoogleFlow, watchAuth } from "./platform/auth";
import { probeDeviceModel } from "./platform/deviceModel";
import { initServices, readBrowserEnvConfig, type FirebaseServices } from "./platform/firebase";
import { logError } from "./platform/logging";
import { loadRemoteConfigValues } from "./platform/remoteconfig";
import type { DeviceProbeResult, RemoteConfigValues } from "./types";
import { LedgerView } from "./views/LedgerView";
import { PaperView } from "./views/PaperView";
import { EMPTY_DRAFT, PapersView, type ComposeDraft } from "./views/PapersView";
import { SettingsView } from "./views/SettingsView";
import { SetupView } from "./views/SetupView";
import { SignInView } from "./views/SignInView";
import { StatusView } from "./views/StatusView";

type BootState =
  | { phase: "booting" }
  | { phase: "needs-config"; missing: string[] }
  | { phase: "failed"; error: AppError }
  | {
      phase: "ready";
      services: FirebaseServices;
      appCheck: AppCheckStatus;
      config: RemoteConfigValues;
      configMeta: ConfigMeta;
    };

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error): void {
    logError("render_crash", { message: error.message });
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <main className="app-main">
          <div className="setup-sheet">
            <h1>Something went wrong while showing this page</h1>
            <p>
              The app hit an unexpected rendering problem. Your papers are untouched in Firestore.
              Reloading usually fixes a one-off failure.
            </p>
            <p style={{ marginTop: 12 }}>
              <code>{this.state.error.message}</code>
            </p>
            <button type="button" className="button button-primary" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
              Reload the app
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

function BootScreen({ label }: { label: string }): JSX.Element {
  return (
    <div className="boot-screen">
      <span className="boot-mark">
        <SealIcon size={48} />
      </span>
      <h1>Hushfolio</h1>
      <p>{label}</p>
    </div>
  );
}

export function App(): JSX.Element {
  const [boot, setBoot] = useState<BootState>({ phase: "booting" });
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [deviceProbe, setDeviceProbe] = useState<DeviceProbeResult>({
    status: "unknown",
    detail: "Not checked yet.",
    raw: null,
  });
  const [strictOverride, setStrictOverride] = useState<boolean | null>(null);
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const [view, setView] = useState<ViewId>("papers");
  const [openPaperId, setOpenPaperId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<ComposeDraft>(EMPTY_DRAFT);
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<AppError | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const envResult = readBrowserEnvConfig();
      if (!envResult.ok) {
        if (mountedRef.current) setBoot({ phase: "needs-config", missing: envResult.missing });
        return;
      }
      try {
        // App Check is initialized inside initServices, BEFORE getAI() —
        // see the ORDER MATTERS note in src/platform/firebase.ts.
        const services = initServices(
          envResult.config,
          readAppCheckOptions(import.meta.env as unknown as Record<string, string | undefined>),
        );
        const appCheck = services.appCheck;
        const loaded = await loadRemoteConfigValues(services.remoteConfig);
        const probe = await probeDeviceModel();
        if (!mountedRef.current) return;
        setDeviceProbe(probe);
        setBoot({
          phase: "ready",
          services,
          appCheck,
          config: loaded.values,
          configMeta: {
            fetched: loaded.fetched,
            invalidKeys: loaded.invalidKeys,
            fetchErrorCode: loaded.fetchErrorCode,
          },
        });
      } catch (bootError) {
        if (mountedRef.current) setBoot({ phase: "failed", error: toAppError(bootError, "Starting Hushfolio failed") });
      }
    })();
  }, []);

  useEffect(() => {
    if (boot.phase !== "ready") return;
    const unsubscribe = watchAuth(boot.services.auth, (nextUser) => {
      setUser(nextUser);
      setAuthResolved(true);
    });
    return unsubscribe;
  }, [boot]);

  useEffect(() => {
    const goOnline = (): void => setOnline(true);
    const goOffline = (): void => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const refreshDeviceProbe = useCallback(() => {
    void (async () => {
      const probe = await probeDeviceModel();
      if (mountedRef.current) setDeviceProbe(probe);
    })();
  }, []);

  const navigate = useCallback((nextView: ViewId) => {
    setView(nextView);
    setOpenPaperId(null);
    setComposing(false);
  }, []);

  const openPaper = useCallback((paperId: string) => {
    setView("papers");
    setOpenPaperId(paperId);
    setComposing(false);
  }, []);

  const newPaper = useCallback(() => {
    setView("papers");
    setOpenPaperId(null);
    setComposing(true);
  }, []);

  if (boot.phase === "booting") {
    return <BootScreen label="Opening your private archive…" />;
  }

  if (boot.phase === "needs-config") {
    return <SetupView missingKeys={boot.missing} />;
  }

  if (boot.phase === "failed") {
    return (
      <main className="app-main">
        <div className="setup-sheet">
          <h1>Hushfolio could not start</h1>
          <ErrorPanel error={boot.error} onRetry={() => window.location.reload()} retryLabel="Try starting again" />
        </div>
      </main>
    );
  }

  if (!authResolved) {
    return <BootScreen label="Checking your sign-in…" />;
  }

  if (user === null) {
    const handleSignIn = async (method: "anonymous" | "google"): Promise<void> => {
      setSignInBusy(true);
      setSignInError(null);
      try {
        if (method === "anonymous") {
          await signInAnonymouslyFlow(boot.services.auth);
        } else {
          await signInWithGoogleFlow(boot.services.auth);
        }
      } catch (error) {
        setSignInError(toAppError(error, "Sign-in failed"));
      } finally {
        setSignInBusy(false);
      }
    };
    return (
      <SignInView
        busy={signInBusy}
        error={signInError}
        onAnonymous={() => void handleSignIn("anonymous")}
        onGoogle={() => void handleSignIn("google")}
      />
    );
  }

  const strictMode = strictOverride ?? boot.config.strictModeDefault;
  const recordLedger = async (entry: LedgerRecordInput): Promise<void> => {
    await recordLedgerRun(boot.services.db, user.uid, entry);
  };

  const ctx: AppContext = {
    services: boot.services,
    user,
    config: boot.config,
    configMeta: boot.configMeta,
    appCheck: boot.appCheck,
    deviceProbe,
    strictMode,
    online,
    onStrictModeChange: (value) => setStrictOverride(value),
    onRefreshDeviceProbe: refreshDeviceProbe,
    onNavigate: navigate,
    onOpenPaper: openPaper,
    onSignOut: () => {
      setView("papers");
      setOpenPaperId(null);
      setComposing(false);
    },
    recordLedger,
  };

  const userLabel = user.isAnonymous ? "Anonymous account" : (user.email ?? "Signed in");

  return (
    <AppErrorBoundary>
      <div className="app-shell">
        <Drawer
          currentView={openPaperId !== null ? "papers" : view}
          onNavigate={navigate}
          onNewPaper={newPaper}
          userLabel={userLabel}
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
            <PaperView
              ctx={ctx}
              paperId={openPaperId}
              onBack={() => setOpenPaperId(null)}
              onDeleted={() => setOpenPaperId(null)}
            />
          ) : view === "papers" ? (
            <PapersView
              ctx={ctx}
              composing={composing}
              onComposingChange={setComposing}
              draft={draft}
              onDraftChange={setDraft}
              onOpenPaper={openPaper}
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
    </AppErrorBoundary>
  );
}
