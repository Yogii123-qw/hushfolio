#!/usr/bin/env python3
"""Headless walkthrough for Hushfolio (Playwright + Chromium).

Phase A - production build with NO Firebase config:
  SetupView must render on desktop + mobile with zero console errors and
  zero page errors. This proves the honest unconfigured state.

Phase B - build with dummy (placeholder) Firebase config:
  the app must proceed past SetupView to SignInView, and an anonymous
  sign-in attempt must fail HONESTLY (error panel), because the dummy
  project does not exist. Console/network errors from Google's APIs are
  expected here and are recorded, not treated as failures; uncaught page
  exceptions are still failures.

Usage:
  ~/.venvs/bughunter-playwright/bin/python scripts/headless-walkthrough.py [output-dir]

The dummy build is produced by the caller (see README) into dist-dummy/
before this script runs; this script only serves and drives browsers.
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

RESULTS = {"steps": [], "console_errors": {}, "page_errors": {}}


def record(step: str, ok: bool, detail: str = "") -> None:
    RESULTS["steps"].append({"step": step, "ok": ok, "detail": detail})
    print(f"{'PASS' if ok else 'FAIL'}  {step}" + (f" - {detail}" if detail else ""))
    if not ok:
        RESULTS["failed"] = True


class StaticServer:
    def __init__(self, directory: Path, port: int):
        self.port = port
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
            cwd=directory,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.wait_ready()

    def wait_ready(self, timeout_s: float = 15.0) -> None:
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/", timeout=2) as resp:
                    if resp.status == 200:
                        return
            except Exception:
                time.sleep(0.25)
        raise RuntimeError(f"static server on port {self.port} did not become ready")

    def stop(self) -> None:
        self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def phase_a(playwright) -> None:
    """Unconfigured build: SetupView on desktop + mobile, zero console/page errors."""
    server = StaticServer(REPO / "dist", 4173)
    try:
        browser = playwright.chromium.launch()
        for label, width, height in [("desktop", 1280, 800), ("mobile", 390, 844)]:
            page = browser.new_page(viewport={"width": width, "height": height})
            console_errors: list[str] = []
            page_errors: list[str] = []
            page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: page_errors.append(str(e)))
            page.goto(f"http://127.0.0.1:4173/", wait_until="networkidle")
            page.wait_for_timeout(500)

            heading = page.locator("h1").first.inner_text()
            record(f"A-{label}: SetupView heading", heading == "Hushfolio is not configured yet", heading)
            body_text = page.locator("body").inner_text()
            for key in ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_APP_ID"]:
                record(f"A-{label}: missing key {key} listed", key in body_text)
            record(f"A-{label}: setup steps mention Firebase console", "Firebase console" in body_text)
            record(f"A-{label}: setup steps mention App Check", "App Check" in body_text)
            record(f"A-{label}: setup steps mention Chrome flags", "chrome://flags" in body_text)
            record(
                f"A-{label}: reload button present",
                page.get_by_role("button", name="Check configuration again").count() == 1,
            )
            record(f"A-{label}: no console errors", len(console_errors) == 0, "; ".join(console_errors[:3]))
            record(f"A-{label}: no page errors", len(page_errors) == 0, "; ".join(page_errors[:3]))
            RESULTS["console_errors"][f"A-{label}"] = console_errors
            RESULTS["page_errors"][f"A-{label}"] = page_errors
            page.screenshot(path=str(OUT / f"setup-{label}.png"), full_page=True)
            page.close()
        browser.close()
    finally:
        server.stop()


def phase_b(playwright) -> None:
    """Dummy-config build: SignInView renders; anonymous sign-in fails honestly."""
    dummy_dir = REPO / "dist-dummy"
    if not dummy_dir.exists():
        record("B: dummy build present", False, "dist-dummy/ missing - build it first (see README)")
        return
    server = StaticServer(dummy_dir, 4174)
    try:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        console_errors: list[str] = []
        page_errors: list[str] = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.goto("http://127.0.0.1:4174/", wait_until="networkidle")
        # Boot awaits Remote Config (10s fetch timeout) and the auth state
        # listener; with a dummy project both fail slowly. Wait for the
        # sign-in heading instead of sleeping a fixed time.
        try:
            page.wait_for_selector("h1:has-text('Your papers stay yours')", timeout=30000)
        except Exception:
            pass
        page.wait_for_timeout(500)

        heading = page.locator("h1").first.inner_text()
        record("B: SignInView heading (past SetupView)", heading == "Your papers stay yours", heading)
        record(
            "B: anonymous button present",
            page.get_by_role("button", name="Continue anonymously").count() == 1,
        )
        record(
            "B: Google button present",
            page.get_by_role("button", name="Sign in with Google").count() == 1,
        )
        record("B: honesty note about anonymous archive", "clear site data" in page.locator("body").inner_text())
        page.screenshot(path=str(OUT / "signin-desktop.png"), full_page=True)

        page.get_by_role("button", name="Continue anonymously").click()
        page.wait_for_timeout(4000)
        body_text = page.locator("body").inner_text()
        record("B: honest error panel after failed anonymous sign-in", "Something needs attention" in body_text)
        record("B: no page errors (uncaught exceptions)", len(page_errors) == 0, "; ".join(page_errors[:3]))
        RESULTS["console_errors"]["B"] = console_errors
        RESULTS["page_errors"]["B"] = page_errors
        print(f"INFO  B: {len(console_errors)} console error(s) recorded (expected: dummy project rejected by Google APIs)")
        for message in console_errors[:5]:
            print(f"      console: {message[:160]}")
        page.screenshot(path=str(OUT / "signin-error-desktop.png"), full_page=True)
        page.close()
        browser.close()
    finally:
        server.stop()


def main() -> int:
    RESULTS["failed"] = False
    with sync_playwright() as playwright:
        phase_a(playwright)
        phase_b(playwright)
    (OUT / "walkthrough.json").write_text(json.dumps(RESULTS, indent=2))
    passed = sum(1 for s in RESULTS["steps"] if s["ok"])
    total = len(RESULTS["steps"])
    print(f"\n{passed}/{total} walkthrough steps passed. Report: {OUT / 'walkthrough.json'}")
    return 1 if RESULTS["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
