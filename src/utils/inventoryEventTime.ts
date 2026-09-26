import { translate } from "@common";

/**
 * Durations and ages as the inventory event screens print them, in the largest unit that stays
 * readable. Shared by the monitor, the history and their modals so a lag reads the same everywhere.
 */

/** A duration: "45s", "8.4 min", "3.2h", "2d". Empty for a negative or non-finite span. */
export function formatLag(ms: number): string {
  if(!Number.isFinite(ms) || ms < 0) {return "";}
  const seconds = Math.round(ms / 1000);
  if(seconds < 90) {return translate("{seconds}s", { seconds });}
  const minutes = ms / 60_000;
  if(minutes < 90) {return translate("{minutes} min", { minutes: minutes.toFixed(1) });}
  const hours = minutes / 60;
  if(hours < 48) {return translate("{hours}h", { hours: hours.toFixed(1) });}

  return translate("{days}d", { days: Math.round(hours / 24) });
}

/** How long ago a timestamp was: "Just now", "12m ago", "3h ago", "2d ago". */
export function formatAge(timestamp: number | undefined, now = Date.now()): string {
  if(!timestamp) {return translate("Unknown age");}
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if(minutes < 1) {return translate("Just now");}
  if(minutes < 60) {return translate("{minutes}m ago", { minutes });}
  const hours = Math.floor(minutes / 60);
  if(hours < 24) {return translate("{hours}h ago", { hours });}

  return translate("{days}d ago", { days: Math.floor(hours / 24) });
}
