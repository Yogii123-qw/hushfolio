# Hushfolio — STATE

## Current phase: Firebase gate done, live verification in progress
Updated 19 Nov 2026 ~16:00 WIB.

## Done
- Build complete (19 Nov 00:56 WIB): 159/159 tests, production build
  passes, contrast 24/24 WCAG AA, headless walkthrough 26/26, preview
  walkthrough 21/21.
- Repo public: github.com/Yogii123-qw/hushfolio, pushed 19 Nov 07:09 WIB
  (HEAD bb48881 at push).
- Firebase gate complete (19 Nov 15:44 WIB, browser task, account
  brunosrna44@gmail.com, free Spark plan, no card): project
  hushfolio-133fb (no Analytics), Gemini Developer API enabled (Vertex
  AI NOT enabled), AI Logic enabled with the Gemini Developer API
  backend, Auth Anonymous + Google enabled, Firestore production mode
  in asia-southeast1 with rules published 15:32 WIB, web app "Hushfolio
  web" registered, App Check reCAPTCHA Enterprise key registered
  (Fraud Defense provider), Remote Config Version 1 published with all
  8 parameters. `.env` filled locally from the reported config,
  verified ignored by git, never committed.
- App Check provider fix (19 Nov ~15:45 WIB): code switched from
  `ReCaptchaV3Provider` to `ReCaptchaEnterpriseProvider` in
  `src/platform/appcheck.ts` (plus honest label updates in StatusView,
  SetupView, `.env.example`). Typecheck clean, tests still 159/159,
  build passes.

## Advisor consultations (SOP protocol)
- 19 Nov ~15:45 WIB, Groq gpt-oss-120b: "Will ReCaptchaV3Provider work
  with a site key registered under the Enterprise provider, or will
  App Check token verification fail for AI Logic calls?" Conclusion:
  use ReCaptchaEnterpriseProvider; classic v3 tokens are not accepted
  for an Enterprise-registered app. Own conclusion agreed (option a);
  no conflict. Decision taken with that evidence.
- 19 Nov ~15:15 WIB, Groq gpt-oss-120b: Firebase setup checklist
  confirmed with tweaks (Firestore location immutable, enable Gemini
  Developer API first, Auth needs OAuth consent + authorized domains,
  publish rules before reads/writes, App Check enforcement only after
  local key verification). One Groq suggestion REJECTED with evidence:
  enable Vertex AI (Hushfolio uses the Gemini Developer API backend;
  Vertex AI is unnecessary).

## In progress
- Live verification (5 AI actions + Firestore/Auth/App Check/Remote
  Config round-trips) — moved to the "Uji Hushfolio" test chat
  (chat_id 97698506-ccf3-4f04-8434-1027127469f9) at the owner's order
  (19 Nov 15:55 WIB: test the first project in another chat, so no
  judge hits a bug). Blocker found 19 Nov ~15:50 WIB: headless
  Chromium on this VM cannot reach Google APIs (egress-proxy tunnel
  failure, ERR_TUNNEL_CONNECTION_FAILED; curl through the same proxy
  works; direct connection fails; Firefox NOT installed). The test
  chat tries a Firefox install first, then REST-API verification.
  Live-verification script: scripts/live-verification.py (stops at
  sign-in until a working browser path exists).

## Remaining owner gates
- Demo video ≤ 3 min, public YouTube (only after live verification).
- Hosting decision (owner).
- Devpost submit before Tue 1 Dec 2026 05:00 WIB.
- Local commits after the 07:09 WIB push are not yet pushed; a push
  needs the owner's word.
