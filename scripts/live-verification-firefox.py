#!/usr/bin/env python3
"""Live verification for Hushfolio against the REAL Firebase project
(hushfolio-133fb) — the Firebase gate for BuildHybridAI 2026.

Serves the production build (dist/, built with the real .env) and drives it
in headless Chromium via Playwright:

  L01  SignInView renders with the real config (past SetupView).
  L02  Anonymous sign-in succeeds (Auth Anonymous enabled).
  L03  Status view: project id, anonymous uid, App Check mode, Firestore
       reachable, Remote Config fetched with the 8 published values,
       on-device model status recorded honestly.
  L04  Create paper 1 (Firestore write) and read it back (round-trip).
  L05  Seal Scan with no on-device model: HONEST REFUSAL, never a
       silent cloud fallback.
  L06  Summarize: cloud result, source pill "Cloud".
  L07  Ask this paper: streaming answer, source "Cloud".
  L08  Photo read: upload a generated PNG of handwritten-style notes,
       cloud transcription contains the note's facts.
  L09  Connect the dots across 2 papers (consent modal), cloud result.
  L10  Ledger view records the runs with their sources.
  L11  Cleanup: delete both test papers (owner delete under the rules).

Usage:
  ~/.venvs/bughunter-playwright/bin/python scripts/live-verification.py [output-dir]

Writes live-verification.json into the output dir (default: audit-buildhybridai).
Test papers are deleted at the end; the anonymous test account stays in the
project (no PII, no way to delete it from the client).
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

RESULTS = {"steps": [], "console_errors": [], "page_errors": [], "status_rows": {}, "browser": "firefox", "proxy": "env"}
import os
from urllib.parse import urlparse

def proxy_from_env():
    """Egress proxy from the VM environment (Chromium/Firefox cannot reach
    Google APIs directly from this VM; curl through the same proxy works).
    Credentials come from the environment only, never hardcoded or printed."""
    raw = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or ""
    if not raw:
        return None
    u = urlparse(raw)
    proxy = {"server": f"{u.scheme}://{u.hostname}:{u.port or 3128}",
             "bypass": "localhost,127.0.0.1"}
    if u.username:
        proxy["username"] = u.username
    if u.password:
        proxy["password"] = u.password
    return proxy




def save() -> None:
    (OUT / "live-verification-firefox.json").write_text(json.dumps(RESULTS, indent=2))


def record(step: str, ok: bool, detail: str = "") -> None:
    RESULTS["steps"].append({"step": step, "ok": ok, "detail": detail})
    print(f"{'PASS' if ok else 'FAIL'}  {step}" + (f" — {detail}" if detail else ""), flush=True)
    if not ok:
        RESULTS["failed"] = True


def make_photo(path: Path) -> str:
    """Generate a PNG of printed meeting notes for the Photo read step."""
    from PIL import Image, ImageDraw, ImageFont

    lines = [
        "Meeting notes",
        "Decided: Bali trip in June with Maya.",
        "Budget five million rupiah.",
        "Book the flight before Friday.",
    ]
    font = None
    for candidate in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    ]:
        if Path(candidate).exists():
            font = ImageFont.truetype(candidate, 44)
            break
    if font is None:
        try:
            font = ImageFont.load_default(size=44)
        except TypeError:
            font = ImageFont.load_default()
    img = Image.new("RGB", (1200, 560), "white")
    draw = ImageDraw.Draw(img)
    y = 60
    for line in lines:
        draw.text((60, y), line, fill="black", font=font)
        y += 110
    img.save(path, "PNG")
    return "truetype/dejavu" if font is not None and hasattr(font, "getbbox") else "default"


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


PAPER_1 = {
    "title": "Live verification note",
    "body": (
        "Journal entry. I decided to take the Bali trip in June with Maya. "
        "Budget five million rupiah. I need to book the flight before Friday. "
        "I also want to visit Ubud for two days and try the sunrise hike at Mount Batur."
    ),
    "tags": "journal, travel",
}
PAPER_2 = {
    "title": "Work notes December",
    "body": (
        "Work notes. The library project deadline moved to December. "
        "I need to finish the catalog pages and fix the search box. "
        "The team meets on Monday to review the plan."
    ),
    "tags": "work",
}


def create_paper(page, paper) -> bool:
    page.get_by_role("button", name="New paper").click()
    page.wait_for_selector("#paper-title", timeout=10000)
    page.locator("#paper-title").fill(paper["title"])
    page.locator("#paper-body").fill(paper["body"])
    page.locator("#paper-tags").fill(paper["tags"])
    page.get_by_role("button", name="File this paper").click()
    try:
        page.wait_for_selector(f"text={paper['title']}", timeout=20000)
        return True
    except Exception:
        return False


def open_paper(page, title: str) -> bool:
    # Filing a paper opens its detail view, so the list is not showing.
    # Navigate back to Papers first, then open the paper by its title.
    page.get_by_role("button", name="Papers", exact=True).click()
    try:
        page.wait_for_selector("h1:text-is('Papers')", timeout=15000)
    except Exception:
        return False
    page.get_by_text(title, exact=True).first.click()
    try:
        page.wait_for_selector("text=Scan this paper", timeout=15000)
        return True
    except Exception:
        return False


def delete_current_paper(page, title: str) -> bool:
    page.get_by_role("button", name="Delete paper").click()
    try:
        page.get_by_role("button", name="Delete permanently").click(timeout=5000)
    except Exception:
        return False
    try:
        page.wait_for_selector("text=File your first paper", timeout=20000)
        return True
    except Exception:
        # List may still show the other paper; check the title is gone.
        return title not in page.locator("body").inner_text()


def wait_for_outcome(page, success_check, timeout_s: int = 120) -> str:
    """Poll for an AI action outcome: 'success', 'failed: <panel text>', or 'timeout'.

    The app clears the error panel when a new action starts (PaperView
    runAction calls setActionError(null)), so a stale panel cannot fake a
    failure. This returns as soon as the action fails instead of burning the
    whole timeout the way a blind wait_for_selector does.
    """
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        body = page.locator("body").inner_text()
        for line in body.split("\n"):
            if "AI action failed" in line:
                return "failed: " + line.strip()[:200]
        try:
            if success_check():
                return "success"
        except Exception:
            pass
        page.wait_for_timeout(2000)
    return "timeout"


def main() -> int:
    RESULTS["failed"] = False
    photo_path = OUT / "live-photo-notes.png"
    make_photo(photo_path)
    server = StaticServer(REPO / "dist", 4175)
    try:
        with sync_playwright() as playwright:
            browser = playwright.firefox.launch(proxy=proxy_from_env())
            # The VM egress proxy MITMs TLS with a platform CA that browsers
            # do not trust by default (curl trusts it via SSL_CERT_FILE).
            # Without this, every external fetch fails with SEC_ERROR_UNKNOWN_ISSUER.
            context = browser.new_context(ignore_https_errors=True, viewport={"width": 1280, "height": 800})
            page = context.new_page()
            console_errors: list[str] = []
            page_errors: list[str] = []
            page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: page_errors.append(str(e)))
            page.goto("http://localhost:4175/", wait_until="networkidle")  # localhost: reCAPTCHA mints tokens here; 127.0.0.1 is not in the key allowlist
            page.wait_for_timeout(1000)

            # L01/L02 — sign in anonymously.
            try:
                page.wait_for_selector("h1:has-text('Your papers stay yours')", timeout=180000)  # boot waits on
                # Remote Config + App Check through the slow VM egress proxy; on a normal
                # connection this is seconds, here each Google API round-trip is 10-25 s
                record("L01: SignInView renders (past SetupView, real config)", True)
            except Exception:
                record("L01: SignInView renders (past SetupView, real config)", False, page.locator("h1").first.inner_text()[:120])
                browser.close()
                save()
                return 1
            page.get_by_role("button", name="Continue anonymously").click()
            try:
                page.wait_for_selector("h1:text-is('Papers')", timeout=60000)
                record("L02: anonymous sign-in succeeds", True)
            except Exception:
                body = page.locator("body").inner_text()[:300]
                record("L02: anonymous sign-in succeeds", False, body.replace("\n", " "))
                browser.close()
                save()
                return 1

            # L03 — Status view rows.
            page.get_by_role("button", name="Status").click()
            page.wait_for_selector("h1:has-text('Status')", timeout=10000)
            page.wait_for_timeout(12000)  # Remote Config fetch + Firestore probe
            status_text = page.locator(".status-list").inner_text()
            RESULTS["status_rows"]["raw"] = status_text
            checks = [
                ("project hushfolio-133fb", "hushfolio-133fb" in status_text),
                ("signed in Anonymous", "Anonymous account" in status_text),
                ("App Check Active (reCAPTCHA Enterprise)", "Active (reCAPTCHA Enterprise)" in status_text),
                ("Firestore Reachable", "Reachable" in status_text),
                ("Remote Config fetched from server", "Fetched from the server" in status_text),
                ("default_mode prefer_on_device", "prefer_on_device" in status_text),
                ("cloud model gemini-3.5-flash-lite", "gemini-3.5-flash-lite" in status_text),
                ("max paper 20,000", "20,000" in status_text),
            ]
            for name, ok in checks:
                record(f"L03: status — {name}", ok)
            if "Not supported in this browser" in status_text or "Not available on this device" in status_text:
                record("L03: on-device model honestly reported unavailable here", True, "this headless browser has no Gemini Nano")
            else:
                record("L03: on-device model status recorded", True, status_text.split("On-device model")[-1][:120].replace("\n", " "))
            page.screenshot(path=str(OUT / "live-status-desktop.png"), full_page=True)

            # L04 — create two papers (Firestore write + read round-trip).
            page.get_by_role("button", name="Papers", exact=True).click()
            page.wait_for_selector("h1:has-text('Papers')", timeout=10000)
            ok1 = create_paper(page, PAPER_1)
            record("L04: create paper 1 (Firestore write + read back)", ok1)
            ok2 = create_paper(page, PAPER_2)
            record("L04: create paper 2 (Firestore write + read back)", ok2)
            if not (ok1 and ok2):
                browser.close()
                save()
                return 1

            # L05–L08 — open paper 1, run the four single-paper actions.
            if not open_paper(page, PAPER_1["title"]):
                record("L05: open paper 1", False)
                browser.close()
                save()
                return 1
            page.get_by_role("button", name="Scan this paper").click()
            page.wait_for_timeout(15000)
            body = page.locator("body").inner_text()
            refusal = "not ready" in body.lower() and "on-device model" in body.lower()
            record("L05: Seal Scan honestly refuses (no on-device model, no cloud fallback)", refusal,
                   "refusal shown" if refusal else body[-300:].replace("\n", " "))

            page.get_by_role("button", name="Summarize this paper").click()
            outcome = wait_for_outcome(page, lambda: "Recorded in the ledger." in page.locator("body").inner_text())
            if outcome == "success":
                pills = page.locator(".pill").all_inner_texts()
                record("L06: Summarize returns a cloud result", "Cloud" in pills, f"pills={pills}")
            else:
                record("L06: Summarize returns a cloud result", False, outcome)

            page.locator("#ask-question").fill("What did I decide about the trip?")
            page.get_by_role("button", name="Ask", exact=True).click()
            outcome = wait_for_outcome(page, lambda: page.locator(".stream-answer").count() > 0
                                       and len(page.locator(".stream-answer").inner_text()) > 20)
            if outcome == "success":
                answer = page.locator(".stream-answer").inner_text()
                pills = page.locator(".pill").all_inner_texts()
                record("L07: Ask streams a cloud answer from the paper", "Cloud" in pills and ("Bali" in answer or "June" in answer),
                       f"answer={answer[:160]!r} pills={pills}")
            else:
                record("L07: Ask streams a cloud answer from the paper", False, outcome)

            page.locator("input[aria-label='Choose a photo of a paper']").set_input_files(str(photo_path))
            try:
                page.wait_for_selector("text=Held in", timeout=10000)
            except Exception:
                pass
            page.get_by_role("button", name="Read the photo").click()
            outcome = wait_for_outcome(page, lambda: page.locator("h4:has-text('Transcription')").count() > 0)
            if outcome == "success":
                transcription = page.locator(".redacted-text").last.inner_text()
                pills = page.locator(".pill").all_inner_texts()
                record("L08: Photo read transcribes the note in the cloud", "Cloud" in pills and ("Bali" in transcription or "June" in transcription),
                       f"transcription={transcription[:160]!r} pills={pills}")
            else:
                record("L08: Photo read transcribes the note in the cloud", False, outcome)
            page.screenshot(path=str(OUT / "live-paper-desktop.png"), full_page=True)

            # L09 — Connect the dots across both papers (consent modal).
            page.get_by_role("button", name="Papers", exact=True).click()
            page.wait_for_selector("h1:has-text('Papers')", timeout=10000)
            # Checkboxes only exist in selecting mode (PapersView renders them
            # only when `selecting` is true, toggled by "Connect papers").
            page.get_by_role("button", name="Connect papers").click()
            page.locator(f"input[aria-label='Select {PAPER_1['title']}']").check()
            page.locator(f"input[aria-label='Select {PAPER_2['title']}']").check()
            page.get_by_role("button", name="Analyze 2 papers").click()
            try:
                # The modal is Modal.tsx: role="dialog", NOT class "modal".
                # The panel heading "Connect the dots" is always on the page,
                # so waiting for its text returns instantly and the button
                # query runs before the dialog exists.
                page.wait_for_selector("[role='dialog']", timeout=10000)
                modal_buttons = page.locator("[role='dialog'] button").all_inner_texts()
                record("L09: Connect the dots consent modal", "Yes, analyze in the cloud" in modal_buttons,
                       f"buttons={modal_buttons}")
                if "Yes, analyze in the cloud" not in modal_buttons:
                    raise RuntimeError("no confirm button")
                page.get_by_role("button", name="Yes, analyze in the cloud").click()
                outcome = wait_for_outcome(page, lambda: "Recorded in the ledger." in page.locator("body").inner_text())
                if outcome == "success":
                    pills = page.locator(".pill").all_inner_texts()
                    record("L09: Connect the dots returns a cloud result", "Cloud" in pills, f"pills={pills}")
                else:
                    record("L09: Connect the dots returns a cloud result", False, outcome)
            except Exception as exc:
                record("L09: Connect the dots returns a cloud result", False, str(exc)[:200])
                # A half-open dialog would block the drawer; close it.
                page.keyboard.press("Escape")
                page.wait_for_timeout(500)

            # L10 — Ledger records the runs with sources.
            # NOTE: the ledger shows human labels ("Photo read", "Connect the dots",
            # "Ask this paper", "Summarize & file"), not snake_case action keys,
            # and failed runs carry "Not run" + "Error: fetch-error." — check labels.
            page.get_by_role("button", name="Ledger").click()
            page.wait_for_timeout(3000)
            ledger_text = page.locator("body").inner_text()
            for label in ["Summarize & file", "Ask this paper", "Photo read", "Connect the dots"]:
                record(f"L10: ledger records {label}", label in ledger_text)
            record("L10: ledger shows the failed runs honestly (Error: fetch-error.)",
                   "Error: fetch-error." in ledger_text)
            record("L10: ledger shows Cloud source", "Cloud" in ledger_text)
            page.screenshot(path=str(OUT / "live-ledger-desktop.png"), full_page=True)

            # L11 — cleanup: delete both test papers.
            page.get_by_role("button", name="Papers", exact=True).click()
            page.wait_for_selector("h1:has-text('Papers')", timeout=10000)
            d1 = False
            if open_paper(page, PAPER_1["title"]):
                d1 = delete_current_paper(page, PAPER_1["title"])
            record("L11: delete test paper 1 (owner delete under the rules)", d1)
            d2 = False
            if PAPER_2["title"] in page.locator("body").inner_text() and open_paper(page, PAPER_2["title"]):
                d2 = delete_current_paper(page, PAPER_2["title"])
            record("L11: delete test paper 2 (owner delete under the rules)", d2)

            RESULTS["console_errors"] = console_errors
            RESULTS["page_errors"] = page_errors
            print(f"INFO  console errors: {len(console_errors)}, page errors: {len(page_errors)}")
            for message in (console_errors + page_errors)[:8]:
                print(f"      {message[:180]}")
            page.close()
            browser.close()
    except Exception as exc:  # noqa: BLE001 - record the crash, still write the report below
        record("script crash (see detail)", False, str(exc)[:300])
    finally:
        server.stop()
    save()
    passed = sum(1 for s in RESULTS["steps"] if s["ok"])
    total = len(RESULTS["steps"])
    print(f"\n{passed}/{total} live-verification steps passed. Report: {OUT / 'live-verification-firefox.json'}")
    return 1 if RESULTS["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
