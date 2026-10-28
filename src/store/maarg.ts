import { defineStore } from "pinia"
import { api, logger } from "@common"

/**
 * Maarg server configuration: a small, flat, read-only object of server config properties, kept in
 * localStorage rather than IndexedDB, so it needs none of the app database's projection / prune /
 * liveQuery machinery. The user store loads it on login and clears it on logout; components read it
 * through useMaargConfig.
 */
const MAARG_STORAGE_KEY = "company:maargConfig"

export interface MaargInstanceInfo {
  instancePurpose?: string;
  instanceName?: string;
  omsInstanceUrl?: string | null;
  componentRelease?: string;
}

export interface MaargComponent {
  name: string;
  version: string;
}

export interface MaargConfig {
  instanceInfo: MaargInstanceInfo;
  components: MaargComponent[];
  /** When this copy was read from the server. */
  fetchedAt: number;
}

function readStored(): MaargConfig | null {
  try {
    const raw = localStorage.getItem(MAARG_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    return parsed as MaargConfig
  } catch {
    return null // corrupt entry — treat as absent and re-read from the server
  }
}

// One request at a time, shared by every caller.
let inFlight: Promise<void> | null = null

export const useMaargStore = defineStore("maarg", {
  state: () => ({
    config: readStored() as MaargConfig | null,
  }),
  actions: {
    /**
     * Read the config, from localStorage when present. `force` re-reads from the server (used by an
     * explicit refresh); otherwise a stored copy is reused for the whole session.
     */
    async load(force = false): Promise<void> {
      if (this.config && !force) return
      if (inFlight) return inFlight

      inFlight = (async () => {
        try {
          const resp: any = await api({ url: "admin/maarg", method: "get" })
          const data = resp?.data
          if (!data || typeof data !== "object") throw new Error("Maarg config response is unavailable.")
          const next: MaargConfig = {
            instanceInfo: data.instanceInfo ?? {},
            components: Array.isArray(data.components) ? data.components : [],
            fetchedAt: Date.now(),
          }
          this.config = next
          localStorage.setItem(MAARG_STORAGE_KEY, JSON.stringify(next))
        } catch (error) {
          logger.error("Failed to load Maarg configuration", error)
        } finally {
          inFlight = null
        }
      })()

      return inFlight
    },
    /** Drop the stored copy (called on logout alongside the cache wipe). */
    clear(): void {
      this.config = null
      try { localStorage.removeItem(MAARG_STORAGE_KEY) } catch { /* ignore */ }
    },
  },
})
