# Submission draft — Hushfolio for #BuildHybridAI 2026

DRAFT ONLY. Nothing here has been submitted. The Devpost submission,
public repo push, hosting, and demo video are owner decisions (see
"Owner gates" below).

## Draft Devpost description

**Hushfolio — Private papers, sealed on your device.**

Hushfolio is a private papers archive whose privacy is guaranteed by its
hybrid inference architecture, not by a promise. It is built with
Firebase AI Logic hybrid inference on the web: Gemini Nano runs on the
device in Chrome, and `gemini-3.5-flash-lite` runs in the cloud — and the
app routes each action to the right place, then proves where it ran.

Seal Scan, the sensitivity scanner, runs `ONLY_ON_DEVICE`. If the
on-device model is not ready, Hushfolio refuses honestly instead of
silently sending your most sensitive content to the cloud. That refusal
is the feature: privacy as architecture.

Summaries, single-turn questions, and photo reading prefer the device and
fall back to the cloud only when needed, with the actual inference source
shown on every result. Connect the dots — cross-paper themes, connections,
and a timeline — runs in the cloud only with explicit per-use consent,
and is disabled entirely in Strict mode.

Every AI run is recorded in a ledger with metadata only: what ran, what
was requested, where it actually ran, and whether it worked. No prompts,
no outputs, no paper text in the ledger — the hybrid claim is auditable,
not just claimed.

Firebase products used: AI Logic (hybrid inference, structured output,
streaming, multimodal), App Check, Authentication, Firestore, and Remote
Config (routing policy, limits, and prompt version, all validated with
honest fallbacks).

Hushfolio is free, in English, and runs in Chrome on desktop. There is no
demo mode anywhere in the app: without a Firebase project it shows setup
instructions; with one, every AI call is a real Firebase AI Logic call.

## Evidence checklist (mapped to the submission requirements)

| Requirement | Evidence in this repo |
|---|---|
| Gen AI app using Firebase AI Logic + supporting Firebase products | `src/ai/hybrid.ts` calls `getGenerativeModel` with `HybridParams` at runtime; `src/ai/actions.ts` calls `generateContent` / `generateContentStream`; App Check (`src/platform/appcheck.ts`), Auth, Firestore, Remote Config all integrated. |
| At least 1 platform (Web Chrome) | Web app, Chrome Desktop 139+ for on-device inference. |
| Public open-source-licensed repo | Apache-2.0 `LICENSE` present. Repo is local-only until the owner pushes it public. |
| Firebase AI Logic actually called at runtime, not just named | `generateContent` / `generateContentStream` / `initializeDeviceModel` call sites in `src/ai/`; no canned responses in `src/`. |
| Text description | This draft + `README.md`. |
| Demo video ≤ 3 minutes, public YouTube, English/subtitled | NOT YET MADE — owner gate. |
| Hosted project URL (strongly encouraged, not required) | NOT YET HOSTED — owner decision. |
| Project is free | Yes. No payments, no paywalls. |
| All materials in English | UI, README, and this draft are in English. |
| No production API keys / live secrets / PII in the repo | Config only via env vars; `.env.example` has placeholders; secret grep audit clean (see verification). |
| AI coding tools / coding agents allowed | Allowed per the rules; pre-existing code: none — 100% new code written for this submission. |

## Verification numbers (19 Nov 2026, local machine)

- Typecheck (`tsc --noEmit`): clean.
- Production build (`vite build`): succeeds; JS 1.03 MB / 310 KB gzip
  (Firebase SDK dominated), CSS 17.2 KB.
- Tests (`npm test`): 159/159 pass, 11 files.
- Contrast (`npm run contrast`): 24/24 text/background pairs meet WCAG AA
  (≥ 4.5:1).
- Headless walkthrough (Playwright, real production build): 26/26 steps —
  SetupView desktop + mobile with zero console/page errors; dummy-config
  build reaches SignInView and fails sign-in honestly with the real
  Firebase error code.
- Preview-harness walkthrough (dev-only fixture bundle, layout review
  only): 21/21 steps, zero console/page errors.
- UI audits on real renders: `ux_self_critique` pass + `ai_slop_audit`
  scored audit 20/20 after fixes (focus trap, tokenized colors, persistent
  compose draft, styled file picker, sentence-form metadata).
- Secret grep audit: no keys, tokens, or PII in tracked files.
- `git remote -v`: EMPTY (local repo only, no push).

## Honest limits (what was NOT verified live)

Live on-device inference, live cloud inference and fallback, and live
Firestore/Auth/App Check/Remote Config round-trips were NOT verified:
they need a real Firebase project and Chrome with the on-device model,
which only the owner can provide. The routing, parsing, streaming, and
ledger logic is covered by 159 tests including SDK-boundary doubles, but
a test double is not a live model. The first live run must be done by the
owner (or with the owner's project) before the demo video is recorded.

## Owner gates (decisions + accounts only the owner can provide)

1. **Firebase project** — create the project, enable AI Logic (Gemini
   Developer API), Auth (Anonymous + Google), Firestore (publish
   `firestore.rules`), App Check (reCAPTCHA v3 or debug token), and
   Remote Config values; fill in `.env` from `.env.example`.
2. **Live verification run** — sign in, download the on-device model from
   Status, run all five actions, confirm the ledger labels sources
   correctly.
3. **Public repo** — push this repo to a public GitHub repository under an
   open-source licence (Apache-2.0 already in place).
4. **Demo video** — record a ≤ 3-minute demo, public on YouTube, in
   English or English-subtitled.
5. **Hosting (optional but strongly encouraged)** — deploy the production
   build to a public URL.
6. **Devpost account + submission** — submit before Tue 1 Dec 2026 05:00
   WIB (Mon 30 Nov 2026 22:00 UTC). NOTE (per parent coordination notes,
   19 Nov 2026): the owner's Devpost account was suspended (flagged as
   automated, under review); an appeal email was sent 00:39 WIB 19 Nov and
   a reply watch is active. Do NOT create a new account (ban + 
   disqualification risk). Submission is blocked until the account is
   restored.
7. **If the entry wins** — return the Required Forms within 10 business
   days; non-US winners must provide IRS Form W-8BEN; prizes are paid
   within 60 days of completed forms, net of withholding.
8. **Quota (only if paid models are ever used)** — Hushfolio uses NO paid
   models (text inference only: on-device Gemini Nano + cloud
   `gemini-3.5-flash-lite` free tier), so no quota request is needed.
   For the record only — evaluasi 18 Nov — BELUM terverifikasi ulang
   19 Nov: Google Account Quota Sprint 2 closed Thu 19 Nov 2026 01:00 WIB;
   Sprint 3 (last) closes Thu 26 Nov 2026 01:00 WIB; quota covers paid
   models only, is not guaranteed, and is valid 4 days.

## Judging criteria (for the owner's reference)

Equal weight, 1–5 each: Technological Implementation, Design, Potential
Impact, Quality of the Idea. Judging 10–16 Dec 2026; winners announced on
or around 21 Dec 2026 12:00 PT (22 Dec 2026 03:00 WIB). Prizes: Grand
$10,000; 1st Runner Up $7,000; 2nd Runner Up $4,000; Best iOS / Android /
Web-Chrome $3,000 each. One submission can win one grand prize plus at
most one "Best of" prize.
