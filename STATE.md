# Hushfolio - STATE

## Current phase: Real encryption done (item 2 of 3 $0 improvements), Firestore rules deploy + live verification next
Updated 19 Nov 2026 ~18:40 WIB.

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
- Timestamp crash fixed + verified live (19 Nov 16:0x WIB):
  `timestampToMillis` called `value.toMillis` detached from `this`,
  which crashed every paper read. Now calls it as a method; 2
  regression tests added (real Firestore Timestamp + prototype method
  reading `this`). Tests 161/161, build passes, live paper create /
  open / delete verified with 0 errors.
- App Check 401 root cause found + fixed (19 Nov 17:20 WIB): packet
  capture proved the app never sent an App Check token at all, because
  `getAI()` ran before `initializeAppCheck()` and @firebase/ai caches
  the App Check instance once at construction. Fix: App Check is now
  initialized inside `initServices` BEFORE `getAI()` (firebase.ts +
  App.tsx). Live re-test 24/27, Summarize returned HTTP 200 with a
  Cloud ledger entry. `127.0.0.1` cannot mint tokens (not in the key
  allowlist); `localhost` can. Live scripts test from localhost.
- Gemini free-tier 403 gate (19 Nov 17:23-17:35 WIB): every cloud call
  after the one Summarize success returns HTTP 403 "The Gemini API free
  tier is not available for this project. To use the Gemini API, please
  set up billing." Proven stable across 3 models, both endpoints, and
  a 70 s gap. No $0 path exists; billing is the only way to lift it.
  Owner chose Apa Adanya ($0, no billing) 19 Nov 17:38 WIB.
- Friendly free-tier message + README note (19 Nov 17:39-17:41 WIB):
  `toAppError` maps the 403 to a plain Blaze billing message (branch
  placed before the network branch, which the SDK's "Error fetching"
  text would otherwise trigger). Live Firefox probe confirmed the
  exact panel text on a real 403. README documents the Spark free-tier
  deployment and the Blaze requirement for Cloud Vertex AI. Tests
  162/162, build (tsc + vite) passes, Groq final review: APPROVE.
- GitHub Pages hosting LIVE (19 Nov 18:1x WIB, item 1 of 3 $0
  improvements, owner order 18:10 WIB): vite.config.ts base set to
  "/hushfolio/" (commit f3f8dd8, Groq review APPROVE, tests 162/162,
  build passes); dist (1.1 MB) deployed to branch gh-pages (4e07761)
  with .nojekyll; Pages enabled via API (source gh-pages, path /).
  Site live at https://yogii123-qw.github.io/hushfolio/ (HTTP 200,
  JS + favicon 200). Domains added 19 Nov 18:16 WIB (browser task,
  brunosrna44@gmail.com): reCAPTCHA Enterprise key "Hushfolio web"
  now allows yogii123-qw.github.io (bare host, no protocol/path);
  Firebase Auth authorized domains likewise. Live verification from
  the Pages origin (scripts in audit folder: pages-verification.py):
  10/12 first run, 12/12 after correcting two check-design flaws
  (P5 panel locator read only the heading; P11 counted the app's own
  handled-403 log as an error). Verified: anonymous sign-in, paper
  create/open/delete, reCAPTCHA request on github.io, App Check
  exchange 200, Vertex 403 (not 401), friendly Blaze panel verbatim,
  ledger records the failure, no request to domain root /, all
  requests HTTPS, 0 page errors. No service worker in src/.
- Real encryption (19 Nov ~18:40 WIB, item 2 of 3 $0 improvements):
  WebCrypto AES-GCM, PBKDF2-SHA-256 200,000 iterations, 256-bit
  non-extractable key; one per-user salt + encrypted check value in
  users/{uid}; key in memory only, cleared on sign-out / Lock.
  Papers are encrypted on-device before Firestore (single
  `encryptedBlob`, `v1.<iv>.<cipher>`); legacy plaintext papers are
  sealed lazily on first read with a key (timestamps preserved, no
  reorder). Passphrase setup / unlock gate after sign-in; wrong
  passphrase and tampered blobs show honest locked/corrupt states,
  never silent drops. Tests 188/188 (162 original + 15 crypto + 11
  papers), build passes, Groq final review: APPROVE (after fixing a
  REJECT: rules now encrypted-only, legacy fields forbidden beside the
  blob, mixed-doc migration no longer overwrites the blob). Firestore
  rules updated in the repo (firestore.rules) - MUST be published via
  the console before live verification, or encrypted writes fail.
  Blueprint: audit-buildhybridai/ENCRYPTION-BLUEPRINT.md. Known gap:
  changing the passphrase is not supported yet (Settings says so).

## Advisor consultations (SOP protocol)
- 19 Nov ~15:45 WIB, Groq gpt-oss-120b: "Will ReCaptchaV3Provider work
  with a site key registered under the Enterprise provider, or will
  App Check token verification fail for AI Logic calls?" Conclusion:
  use ReCaptchaEnterpriseProvider; classic v3 tokens are not accepted
  for an Enterprise-registered app. Own conclusion agreed (option a);
  no conflict. Decision taken with that evidence.
- 19 Nov ~17:52 WIB, Groq gpt-oss-120b: "403 free tier not available - known causes and any $0 fix?" Conclusion: most likely cause is no billing account attached (Spark project has no billing relationship; free tier is billing-enabled free quota); project-level, so a fresh Spark project under the same account will hit the same 403; only fix is attaching a billing account (even trial credit), staying in free quota costs $0 but needs a card. Own conclusion: backend already GoogleAIBackend (verified in src/platform/firebase.ts), so the backend-misconfiguration hypothesis is dead; Groq's billing-account explanation is consistent with the observed 403. No conflict. Decision: present $0 menu to Monch (GitHub Pages hosting, fresh-project test as long shot, WebCrypto encryption as new feature).
- Direct-API check 19 Nov 17:58 WIB (curl, key read from .env into a shell variable, never printed): generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent → HTTP 403 PERMISSION_DENIED / ACCESS_DENIED. The block is NOT Firebase-AI-Logic-specific; it is project/key-level. Fresh-project odds now lower. Ranking confirmed by both Groq and this test: hosting (A) > encryption (C) > fresh project (B).
- 19 Nov 17:2x WIB, Groq gpt-oss-120b: confirmed the App Check
  init-order mechanism exactly (getAI captures the App Check instance
  once; fix is to initialize App Check before getAI()).
- 19 Nov 17:35 WIB, Groq gpt-oss-120b: agreed there is no $0 path past
  the 403 free-tier gate; billing is the only documented way to lift
  it; the single earlier 200 was a one-off window.
- 19 Nov 17:41 WIB, Groq gpt-oss-120b: final pre-push review of the
  complete diff (timestamp fix, init-order fix, friendly 403 message,
  README note, tests). Verdict: APPROVE. Two review questions settled
  by evidence first: `appCheck` in App.tsx is used (boot state), and
  `initServices` has a single caller.
- 19 Nov 18:12 WIB, Groq gpt-oss-120b: final pre-push review of the
  hosting diff (vite base "/hushfolio/" + STATE.md notes on the 403).
  Verdict: APPROVE. Evidence first: build passes, dist paths are
  /hushfolio/*, no react-router, no absolute paths in src/, dist
  gitignored, tests 162/162, no secrets in the diff.
- 19 Nov ~18:25 WIB, Groq gpt-oss-120b (3 calls, blueprint): encryption
  design - src/crypto.ts (PBKDF2 200k, AES-GCM, v1 blob), data-layer
  hooks (blob holds title/body/tags/summary/sensitivity/mood; plaintext
  createdAt/updatedAt/photo metadata), salt + check in users/{uid},
  mandatory passphrase setup/unlock, lazy migration, honest failure
  modes, test list. Two implementer corrections recorded in
  ENCRYPTION-BLUEPRINT.md: salt NOT inside the blob (per-user salt
  wins); updatePaper must re-encrypt the WHOLE field set, not the patch
  (encrypting only the patch would drop the other fields).
- 19 Nov ~18:33 WIB, Groq gpt-oss-120b (2 calls, final review):
  Review 1 (crypto core): APPROVE, 5 minor findings (base64 concat
  O(n²) - fixed with array+join; empty-string decode edge - already
  caught by length checks; key zeroisation - impossible for opaque
  WebCrypto handles; known-plaintext check value - the GCM tag is the
  oracle either way, PBKDF2 + passphrase strength is the mitigation).
  Review 2 (data layer + rules): REJECT - rules still allowed plaintext
  writes (validPaper OR branch) and did not forbid legacy fields beside
  the blob; migration silently skipped malformed docs; isLegacyDoc
  masked mixed docs. All fixed (rules encrypted-only + legacy fields
  forbidden, migration logs malformed skips, isLegacyDoc true for any
  leftover plaintext field). Re-review: APPROVE. Micro-review of the
  last fix (mixed-doc migration must not overwrite the blob):
  APPROVE.

## In progress
- Reporting route (Monch order 18:31 WIB 19 Nov): Hushfolio results go
  to Bos in the Uji Hushfolio chat ONLY; never via the PT.11 chat (PT.11
  focuses on Concordium). Hosting already accepted by Bos.
- Item 2 DONE 19:03 WIB 19 Nov: rules published 18:32, gh-pages
  redeployed (6a157a4, build dffccc2), live verification 23/23 from the
  Pages origin, network audit 4/4 (passphrase in 0 of 58 requests),
  database sterilized (69 real docs deleted, collections confirmed
  empty). Audit doc §10 written. Reported to Bos in this chat.
- Item 3 CLOSED at stage 1 (Monch order 19:28 WIB 19 Nov): new project
  `hushfolio-free-tier-test` got HTTP 403 on both models even after a
  4-minute propagation wait; stage 2 never run. Test project DELETED
  19:29 WIB (console: "Project has been deleted"; project list shows
  only hushfolio-133fb; restorable via Cloud console undelete).
- FINAL BUILD DECLARED (Monch order 19:28 WIB): the live build at
  https://yogii123-qw.github.io/hushfolio/ (dffccc2 / gh-pages 6a157a4)
  is the final build.
- Submission description draft DONE (SUBMISSION-DESCRIPTION.md in the
  audit folder) and pasted to Bos in this chat 19:31 WIB.
- VIDEO DONE 19:34 WIB (Monch order 19:28 WIB: record as-is): v3,
  129.7 s, H.264 1280x800 30 fps, recorded from the LIVE hosting URL,
  passphrase setup included, Blaze panel fully readable (fixes the v1
  defects: late captions + never-visible panels). Verified frame by
  frame (8 midpoints + 2 confirmation frames); SHOT-LOG.md written.
  Demo user doc deleted 19:36 WIB (recursive delete, /users confirmed
  empty again); file delivered to Bos in this chat.
- SUBMITTED 20:22 WIB 19 Nov: Devpost BuildHybridAI 2026, ID 1312273,
  https://devpost.com/software/hushfolio, status SUBMITTED, page live
  (Published 19 Nov 08:18 EST, verified independently: title, tagline,
  full description, demo link, repo link, YouTube embed all correct).
  Editable until 30 Nov 17:00 EST (= 1 Dec 05:00 WIB). Gallery not yet
  published by the event managers (their setting, not a submission
  problem). No payment, no other project touched.
- Deskripsi Devpost diperbaiki 20:31 WIB (versi bersih tanpa strip
  panjang, terverifikasi di halaman publik, bidang lain utuh).
- Perbaikan judul + deskripsi + tag video YouTube (pzff5kdGw2o) SELESAI
  20:34 WIB (akun Google Bruno Srna, terverifikasi di halaman publik,
  nol strip panjang, video tetap Publik).
- Item 3: fresh Firebase project test (staged; stop at stage 1 if 403).
- Demo video on HOLD until all three items are done (video must be
  recorded from the final build, and the script gains a passphrase step).
  Full audit: ~/workspace/hackathons/pt11/audit-buildhybridai/
  LIVE-VERIFICATION-2026-11-19.md.

## Remaining owner gates
- Demo video ≤ 3 min, public YouTube (after all three $0 items).
- Devpost submit before Tue 1 Dec 2026 05:00 WIB.
- Cloud AI stays off on the Spark plan: cloud actions fail with the
  friendly Blaze message until the owner enables billing.
- Changing the encryption passphrase is not supported yet (known gap,
  stated in Settings).
