import type { JSX } from "react";
import type { ViewId } from "../appContext";
import { LedgerIcon, PaperIcon, PlusIcon, SealIcon, SettingsIcon, StatusIcon } from "./icons";

interface DrawerProps {
  currentView: ViewId;
  onNavigate: (view: ViewId) => void;
  onNewPaper: () => void;
  userLabel: string;
  online: boolean;
  strictMode: boolean;
}

const NAV_ITEMS: Array<{ id: ViewId; label: string; icon: (props: { size?: number }) => JSX.Element }> = [
  { id: "papers", label: "Papers", icon: PaperIcon },
  { id: "ledger", label: "Ledger", icon: LedgerIcon },
  { id: "status", label: "Status", icon: StatusIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

/** The filing-drawer rail: brand, navigation, and account state. */
export function Drawer({ currentView, onNavigate, onNewPaper, userLabel, online, strictMode }: DrawerProps): JSX.Element {
  return (
    <header className="rail">
      <div className="rail-brand">
        <span className="rail-seal" aria-hidden="true">
          <SealIcon size={26} />
        </span>
        <div>
          <p className="rail-name">Hushfolio</p>
          <p className="rail-tag">Private papers</p>
        </div>
        <span className="drawer-pull" aria-hidden="true" />
      </div>

      <button type="button" className="rail-new" onClick={onNewPaper}>
        <PlusIcon size={18} /> New paper
      </button>

      <nav className="rail-nav" aria-label="Sections">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === currentView;
          return (
            <button
              key={item.id}
              type="button"
              className={active ? "rail-link rail-link-active" : "rail-link"}
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="rail-foot">
        <p className="rail-user">{userLabel}</p>
        <p className="rail-state">
          <span className={online ? "dot dot-ok" : "dot dot-bad"} aria-hidden="true" />
          {online ? "Online" : "Offline"}
          {strictMode ? ", Strict mode" : ""}
        </p>
      </div>
    </header>
  );
}
