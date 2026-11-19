# Preview harness (DEV ONLY, not part of the shipped app)

This directory exists for ONE purpose: visual review of the authenticated
views (papers list, paper sheet + AI panel, ledger, status, settings)
without a Firebase project, so layout and CSS defects can be found and
fixed before handoff.

## Boundary (read before touching)

- NOTHING in `preview/` is imported by `src/`. The production build
  (`vite.config.ts`) never sees this directory. The harness is built only
  with the separate `vite.preview.config.ts`, which swaps five modules
  (data access, AI orchestration, model factory, auth) for clearly-labeled
  fixtures at bundle time.
- The fixture data here is SAMPLE TEXT for layout review. It is never
  presented as real user data, never ships in the app bundle, and never
  touches Firebase.
- The harness page carries a visible banner stating it is a preview with
  fixture data. Screenshots from it review LAYOUT ONLY. They prove nothing
  about live Firebase behavior, which remains unverified until Monch
  provides a real project (see the blueprint §8 honest limits).

## Run

```sh
npx vite build --config vite.preview.config.ts
npx vite preview --config vite.preview.config.ts --port 4175
```

Or drive it headless: `scripts/preview-walkthrough.py` (Playwright).
