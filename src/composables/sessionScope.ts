/**
 * Session-scoped composable state — the logout story for module-level `reactive` state.
 *
 * The retired Pinia stores were `persist: true`, so logout had to `$reset()` each one explicitly to
 * stop data leaking into the next login (see `store/user.ts`). Composables replaced those stores with
 * MODULE-LEVEL state (landmark dates, access scopes, …), which survives an SPA logout→login exactly
 * the same way — nothing unmounts a module. Without a reset hook, user B would see user A's cached
 * landmark dates and access scopes until a hard reload.
 *
 * So: any composable that keeps module-level session data registers a reset here, and logout calls
 * `clearSessionScopedState()` once instead of importing every store it wants to wipe. This also breaks
 * the logout code's dependency on the stores being deleted, which is what let them be deleted at all.
 * (IndexedDB cache tables are NOT this file's job — `clearAllCaches()` already owns those.)
 */

type SessionReset = () => void;

const resets = new Set<SessionReset>();

/** Register a reset for module-level session state. Returns an unregister, though nothing uses it yet. */
export function onSessionCleared(reset: SessionReset): () => void {
  resets.add(reset);
  return () => resets.delete(reset);
}

/** Wipe every registered composable's session state. Called from logout, exactly once. */
export function clearSessionScopedState(): void {
  for (const reset of resets) {
    try {
      reset();
    } catch {
      // One composable's failure must not leave the rest of the session dirty.
    }
  }
}
