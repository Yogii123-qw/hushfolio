// Shared application context: everything a view needs, passed as one
// object from App. No global singletons beyond the Firebase services
// themselves (which the SDK owns).

import type { User } from "firebase/auth";
import type { LedgerRecordInput } from "./ai/actions";
import type { AppCheckStatus } from "./platform/appcheck";
import type { FirebaseServices } from "./platform/firebase";
import type { DeviceProbeResult, RemoteConfigValues } from "./types";

export type ViewId = "papers" | "ledger" | "status" | "settings";

export interface ConfigMeta {
  fetched: boolean;
  invalidKeys: string[];
  fetchErrorCode: string | null;
}

export interface AppContext {
  services: FirebaseServices;
  user: User;
  config: RemoteConfigValues;
  configMeta: ConfigMeta;
  appCheck: AppCheckStatus;
  deviceProbe: DeviceProbeResult;
  strictMode: boolean;
  online: boolean;
  /** The in-memory encryption key; null while the archive is locked. */
  cryptoKey: CryptoKey | null;
  onStrictModeChange: (value: boolean) => void;
  onRefreshDeviceProbe: () => void;
  onNavigate: (view: ViewId) => void;
  onOpenPaper: (paperId: string) => void;
  onSignOut: () => void;
  /** Forget the key in memory and return to the unlock screen. */
  onLock: () => void;
  recordLedger: (entry: LedgerRecordInput) => Promise<void>;
}
