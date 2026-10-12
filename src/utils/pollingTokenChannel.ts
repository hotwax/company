/**
 * App-local token-broadcast channel for the worker polling service.
 *
 * A Web Worker is a separate realm and cannot read the in-memory bearer token
 * (`commonUtil.getToken()` resolves on the main thread only). Rather than snapshot the token
 * once at start (which goes stale on rotation), the main thread PUBLISHES the current token
 * over a BroadcastChannel and the worker HOLDS the latest — event-driven, never frozen.
 *
 * BroadcastChannel is one of the few things both a window and a worker realm share (cookies /
 * localStorage are not reachable from a worker). This util is the app-local stand-in for what
 * will become an auth-layer rotation event when promoted to `@common`.
 */
export const POLLING_TOKEN_CHANNEL = "company:polling-auth-token";

export interface TokenMessage {
  token: string;
}

/** Main thread: a publisher you post the current token to whenever it changes. */
export function createTokenPublisher(): { publish: (token: string) => void; close: () => void } {
  const bc = new BroadcastChannel(POLLING_TOKEN_CHANNEL);
  return {
    publish: (token: string) => bc.postMessage({ token } as TokenMessage),
    close: () => bc.close(),
  };
}

/** Worker: subscribe to token pushes. Returns an unsubscribe. */
export function subscribeToken(onToken: (token: string) => void): () => void {
  const bc = new BroadcastChannel(POLLING_TOKEN_CHANNEL);
  bc.onmessage = (event: MessageEvent<TokenMessage>) => {
    if (event.data?.token) onToken(event.data.token);
  };
  return () => bc.close();
}
