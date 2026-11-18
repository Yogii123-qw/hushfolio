#!/usr/bin/env python3
"""Drive the preview harness (fixture data) headless and capture renders
of the authenticated views for visual review.

The harness bundle must already be built:
  npx vite build --config vite.preview.config.ts

Screenshots land in the audit directory. Console/page errors fail the run.
These renders review LAYOUT ONLY — they prove nothing about live Firebase
behavior (see preview/README.md).
"""

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / "audit-buildhybridai"
OUT.mkdir(parents=True, exist_ok=True)

RESULTS = {"steps": [], "console_errors": {}, "page_errors": {}, "failed": False}


def record(step: str, ok: bool, detail: str = "") -> None:
    RESULTS["steps"].append({"step": step, "ok": ok, "detail": detail})
    print(f"{'PASS' if ok else 'FAIL'}  {step}" + (f" — {detail}" if detail else ""))
    if not ok:
        RESULTS["failed"] = True


class StaticServer:
    def __init__(self, directory: Path, port: int):
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
            cwd=directory,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.time() + 15
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2) as resp:
                    if resp.status == 200:
                        return
            except Exception:
                time.sleep(0.25)
        raise RuntimeError("preview server did not become ready")

    def stop(self) -> None:
        self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def shot(page, name: str) -> None:
    page.screenshot(path=str(OUT / name), full_page=True)


def main() -> int:
    if not (REPO / "dist-preview").exists():
        print("dist-preview/ missing — build the preview bundle first.")
        return 1
    server = StaticServer(REPO / "dist-preview", 4175)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()

            # ---- Desktop walkthrough ----
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            console_errors: list[str] = []
            page_errors: list[str] = []
            page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: page_errors.append(str(e)))
            page.goto("http://127.0.0.1:4175/", wait_until="networkidle")
            page.wait_for_timeout(600)
            record("preview-desktop: harness banner", "PREVIEW HARNESS" in page.locator("body").inner_text())
            record("preview-desktop: rail brand", page.locator(".rail-name").inner_text() == "Hushfolio")
            record("preview-desktop: papers listed", page.locator(".paper-row").count() == 3)
            shot(page, "preview-papers-desktop.png")

            # Open the first paper.
            page.locator(".paper-row").first.click()
            page.wait_for_timeout(400)
            record("preview-desktop: sheet title", "Harbor morning" in page.locator(".sheet h1").inner_text())
            shot(page, "preview-paper-desktop.png")

            # Run Seal Scan (fixture).
            page.get_by_role("button", name="Scan this paper").click()
            page.wait_for_timeout(600)
            record("preview-desktop: seal result rendered", "Redacted preview" in page.locator("body").inner_text())
            record("preview-desktop: on-device pill", page.locator(".pill-device").count() >= 1)
            shot(page, "preview-paper-seal-desktop.png")

            # Run Summarize (fixture).
            page.get_by_role("button", name="Summarize this paper").click()
            page.wait_for_timeout(600)
            record("preview-desktop: summary result rendered", "Apply to the paper" in page.locator("body").inner_text())
            shot(page, "preview-paper-summary-desktop.png")

            # Ask a question (fixture stream).
            page.locator("#ask-question").fill("What was quiet?")
            page.get_by_role("button", name="Ask", exact=True).click()
            page.wait_for_timeout(900)
            record("preview-desktop: streamed answer", "The harbor was quiet at dawn." in page.locator("body").inner_text())

            # Back to list, connect panel + consent modal.
            page.get_by_role("button", name="Back to papers").click()
            page.wait_for_timeout(400)
            page.get_by_role("button", name="Connect papers").click()
            page.wait_for_timeout(300)
            checkboxes = page.locator(".select-row input[type='checkbox']")
            record("preview-desktop: selection checkboxes", checkboxes.count() == 3)
            checkboxes.nth(0).check()
            checkboxes.nth(1).check()
            page.get_by_role("button", name="Analyze 2 papers").click()
            page.wait_for_timeout(300)
            record("preview-desktop: consent modal", "Send papers to the cloud model?" in page.locator("body").inner_text())
            shot(page, "preview-consent-desktop.png")
            page.get_by_role("button", name="Yes, analyze in the cloud").click()
            page.wait_for_timeout(600)
            record("preview-desktop: connect results", "Themes" in page.locator("body").inner_text())
            record("preview-desktop: cloud pill on connect result", page.locator(".pill-cloud").count() >= 1)
            shot(page, "preview-connect-desktop.png")

            # Ledger, Status, Settings.
            page.get_by_role("button", name="Ledger").click()
            page.wait_for_timeout(400)
            record("preview-desktop: ledger rows", page.locator(".ledger-row").count() == 5)
            shot(page, "preview-ledger-desktop.png")
            page.get_by_role("button", name="Status").click()
            page.wait_for_timeout(400)
            record("preview-desktop: status rows", page.locator(".status-row").count() == 9)
            shot(page, "preview-status-desktop.png")
            page.get_by_role("button", name="Settings").click()
            page.wait_for_timeout(400)
            record("preview-desktop: settings blocks", page.locator(".settings-block").count() == 4)
            shot(page, "preview-settings-desktop.png")

            # Compose form.
            page.get_by_role("button", name="New paper").click()
            page.wait_for_timeout(300)
            record("preview-desktop: compose form", page.locator("#paper-body").count() == 1)
            shot(page, "preview-compose-desktop.png")

            record("preview-desktop: no console errors", len(console_errors) == 0, "; ".join(console_errors[:3]))
            record("preview-desktop: no page errors", len(page_errors) == 0, "; ".join(page_errors[:3]))
            RESULTS["console_errors"]["desktop"] = console_errors
            RESULTS["page_errors"]["desktop"] = page_errors
            page.close()

            # ---- Mobile walkthrough ----
            page = browser.new_page(viewport={"width": 390, "height": 844})
            m_console: list[str] = []
            m_errors: list[str] = []
            page.on("console", lambda m: m_console.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: m_errors.append(str(e)))
            page.goto("http://127.0.0.1:4175/", wait_until="networkidle")
            page.wait_for_timeout(600)
            record("preview-mobile: papers listed", page.locator(".paper-row").count() == 3)
            shot(page, "preview-papers-mobile.png")
            page.locator(".paper-row").first.click()
            page.wait_for_timeout(400)
            shot(page, "preview-paper-mobile.png")
            record("preview-mobile: no console errors", len(m_console) == 0, "; ".join(m_console[:3]))
            record("preview-mobile: no page errors", len(m_errors) == 0, "; ".join(m_errors[:3]))
            RESULTS["console_errors"]["mobile"] = m_console
            RESULTS["page_errors"]["mobile"] = m_errors
            page.close()
            browser.close()
    finally:
        server.stop()

    (OUT / "preview-walkthrough.json").write_text(json.dumps(RESULTS, indent=2))
    passed = sum(1 for s in RESULTS["steps"] if s["ok"])
    print(f"\n{passed}/{len(RESULTS['steps'])} preview steps passed. Report: {OUT / 'preview-walkthrough.json'}")
    return 1 if RESULTS["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
