# Hushfolio: Private papers, sealed on your device

A private papers archive (journal entries, notes, letter drafts) whose
privacy is guaranteed by its hybrid inference architecture, not by a
promise. Built for the **#BuildHybridAI 2026** hackathon (Google/Firebase,
Devpost).

Sensitive scans run **only on the device**. Everything else prefers the
device and uses the cloud only when the on-device model is not ready,
and every run is recorded in a ledger that shows exactly where it ran.

## The five AI actions

| Action | Inference mode | What it does |
|---|---|---|
| Seal Scan | `only_on_device` | Finds sensitive details (names, addresses, IDs, financial, health, credentials) and shows a redacted preview with values replaced, never copied. Refuses honestly when the on-device model is not ready. It never silently falls back to the cloud. |
| Summarize & file | `prefer_on_device` | Structured JSON: title, summary, tags, mood. Saved only when you approve. |
| Ask this paper | `prefer_on_device`, streaming | Single-turn Q&A over one paper. Answers only from that paper; refuses to invent. |
| Photo read | `prefer_on_device`, multimodal | Reads a JPEG/PNG photo of a paper document. Warns before running if cloud fallback could send the photo. Photo bytes stay in the browser tab; only extracted text and photo details are saved. |
| Connect the dots | `prefer_in_cloud`, explicit consent | Themes, connections, and a timeline across 2–8 papers. A consent modal explains that content leaves the device. Disabled in Strict mode. Offline, it falls back to the on-device model per documented SDK semantics, and the result is labeled with its actual source. |

**Strict mode** (Settings) forces `only_on_device` for every action and
disables Connect the dots. **The ledger** records metadata only, action,
requested mode, actual `inferenceSource`, duration, outcome, never prompts
or outputs.

## Firebase services used (all real, all at runtime)

- **Firebase AI Logic** (Gemini Developer API backend): hybrid inference
  via `getGenerativeModel` with `HybridParams`, Gemini Nano on-device
  plus `gemini-3.5-flash-lite` in the cloud. Structured output on both
  paths (cloud `responseSchema`, on-device `responseConstraint`),
  streaming, and multimodal input.
- **App Check** (reCAPTCHA v3, with a documented debug-token flow for
  local development).
- **Authentication** (anonymous by default, optional Google sign-in).
- **Firestore** (papers + append-only ledger, owner-only security rules
  in `firestore.rules`).
- **Remote Config** (routing policy, limits, cloud model, prompt version,
  every value validated, invalid values fall back to defaults and are
  reported in the Status view).

**Free-tier note.** This deployment runs on the Firebase Spark plan (free,
no card): the core features, the ledger, App Check, and the on-device
Gemini Nano path all run in full. The Cloud Vertex AI fallback is the only
part that needs an upgrade. When the project has no billing attached,
cloud actions fail with a clear message saying a Blaze plan is required,
and nothing is retried silently or misreported as a bug. To turn cloud AI
on, upgrade the project to the Blaze plan in the Firebase console.

## Setup

You need your own Firebase project. The app has no demo mode: without
configuration it shows honest setup instructions and nothing else.

1. Create a Firebase project in the
   [Firebase console](https://console.firebase.google.com/) and register a
   Web app to get its configuration object.
2. In the console, open **AI Services > AI Logic**, click Get started, and
   choose the **Gemini Developer API** provider. The guided workflow
   enforces App Check for AI Logic.
3. Enable **Authentication** with the Anonymous and Google sign-in methods.
4. Create a **Firestore** database and publish the rules in
   `firestore.rules`.
5. In **App Check**, register the app with a reCAPTCHA v3 site key. For
   local development, set `VITE_APPCHECK_DEBUG=true` and register the
   debug token printed in the browser console.
6. Copy `.env.example` to `.env`, fill in the values from your project.
   Never commit `.env`.
7. Install and run:

```sh
npm install
npm run dev
```

For on-device inference, use Chrome on desktop (version 139+) and enable
`chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, then
restart Chrome. The on-device model downloads on first use from the
Status view (started only by your click, with progress).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server (port 5173). |
| `npm run build` | Typecheck + production build. |
| `npm test` | Unit + integration tests (Vitest, 159 tests). |
| `npm run contrast` | WCAG contrast check for all 24 used text/background pairs. |
| `npm run preview` | Serve the production build locally. |

Verification tooling (see `scripts/`):

- `scripts/headless-walkthrough.py`, Playwright: unconfigured build
  renders SetupView on desktop + mobile with zero console errors, and a
  dummy-config build reaches SignInView and fails sign-in honestly.
  Requires the Playwright venv + a `dist-dummy/` build (see the script
  header).
- `scripts/preview-walkthrough.py`, Playwright against the dev-only
  preview harness (`preview/`, fixture data, separate Vite config) for
  visual review of the authenticated views.
- `scripts/contrast-check.mjs`: the contrast check above.

## Project structure

```
src/
  App.tsx            Boot state machine, view routing, error boundary
  appContext.ts      The one context object views receive
  main.tsx           Entry point
  types.ts, errors.ts, utils.ts
  design-tokens.css, styles.css
  ai/                routing.ts (pure decision table), schemas.ts
                     (Firebase Schema + zod mirrors), prompts.ts,
                     hybrid.ts (model factory), actions.ts (orchestrator)
  data/              papers.ts, ledger.ts, validation.ts, search.ts,
                     export.ts (Firestore access + pure helpers)
  platform/          firebase.ts, appcheck.ts, auth.ts,
                     remoteconfig.ts, deviceModel.ts, logging.ts
  components/        Drawer, Modal, feedback, icons
  views/             Setup, SignIn, Papers, Paper, Ledger, Status, Settings
tests/               11 files, 159 tests (routing table, schemas,
                     validation, Remote Config, search, export, prompts,
                     errors, paper reader, hybrid factory + orchestrator)
preview/             DEV-ONLY visual-review harness with fixture data.
                     Never imported by src/, never in the production bundle.
docs/SUBMISSION.md   Draft Devpost description + evidence checklist.
firestore.rules      Owner-only access; ledger is append-only.
```

## Testing honesty

Test doubles exist **only** in `tests/` (a recording fake model injected
at the SDK boundary through the `modelCreator` parameter) and in the
dev-only `preview/` harness. Production code always calls the real
Firebase AI Logic SDK through `defaultModelCreator`. There is no
simulation, demo, or canned-response mode anywhere in `src/`.

## What is verified, and what is not

Verified mechanically (see the numbers in `docs/SUBMISSION.md`):

- Typecheck, production build, 159/159 tests, 24/24 contrast pairs.
- Headless renders: SetupView (desktop + mobile, zero console errors),
  SignInView + honest sign-in failure with a dummy project.
- Preview-harness renders of all authenticated views (layout only).

**Not verified live** (requires a real Firebase project + Chrome with the
on-device model, which only the project owner can provide):

- Live on-device inference (Gemini Nano download + generation).
- Live cloud inference and cloud fallback behavior.
- Live Firestore/Auth/App Check/Remote Config round-trips.
- The demo video, hosting, and Devpost submission (owner decisions).

## License

Apache-2.0. See `LICENSE`.
