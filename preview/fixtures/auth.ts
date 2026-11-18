// PREVIEW FIXTURE — stands in for src/platform/auth.ts in the preview
// bundle only. Never imported by production code.

export function watchAuth() {
  return () => {};
}

export async function signInAnonymouslyFlow() {
  return {};
}

export async function signInWithGoogleFlow() {
  return {};
}

export async function signOutFlow() {}
