import {
  createTokenPublisher as createFrameworkTokenPublisher,
  subscribeToken as subscribeFrameworkToken,
  type TokenMessage,
} from "@common/db";

/**
 * App-local token-broadcast channel for the worker polling service.
 */
export const POLLING_TOKEN_CHANNEL = "company:polling-auth-token";

export type { TokenMessage };

/** Main thread: a publisher you post the current token to whenever it changes. */
export function createTokenPublisher(): { publish: (token: string) => void; close: () => void } {
  return createFrameworkTokenPublisher(POLLING_TOKEN_CHANNEL);
}

/** Worker: subscribe to token pushes. Returns an unsubscribe function. */
export function subscribeToken(onToken: (token: string) => void): () => void {
  return subscribeFrameworkToken(onToken, POLLING_TOKEN_CHANNEL);
}
