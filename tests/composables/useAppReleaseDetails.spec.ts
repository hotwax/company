import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useAppReleaseDetails } from "@/composables/useAppReleaseDetails";
import { releaseNotesBrief } from "@/utils/appReleaseNotes";

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); });
function setup(version: string) {
  const scope = effectScope(); scopes.push(scope);

  return scope.run(() => useAppReleaseDetails("JOB_MANAGER", [version]))!;
}

describe("published release details", () => {
  it("reads the exact hosted tag without credentials and uses publication time, not build time", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tag_name: "v3.4.2", published_at: "2026-10-24T12:00:50Z", created_at: "2026-10-23T12:00:00Z", body: "## What's Changed\n* Fixed login by @person in https://github.com/hotwax/job-manager/pull/1\n\n**Full Changelog**: https://github.com/hotwax/job-manager/compare/old...new" }) });
    vi.stubGlobal("fetch", fetcher);
    const state = setup("v3.4.2"); await state.loadRelease("v3.4.2");
    expect(fetcher).toHaveBeenCalledWith("https://api.github.com/repos/hotwax/job-manager/releases/tags/v3.4.2", expect.objectContaining({ credentials: "omit", headers: { Accept: "application/vnd.github+json" } }));
    expect(state.releases.value["v3.4.2"]).toEqual({ status: "ready", publishedAt: Date.parse("2026-10-24T12:00:50Z"), brief: ["Fixed login"], url: "https://github.com/hotwax/job-manager/releases/tag/v3.4.2" });
  });
  it("distinguishes missing notes from request failures and retries failed requests", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 403 }).mockResolvedValueOnce({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetcher);
    const state = setup("v0.0.1"); await state.loadRelease("v0.0.1");
    expect(state.releases.value["v0.0.1"].status).toBe("error");
    await state.loadRelease("v0.0.1");
    expect(state.releases.value["v0.0.1"]).toEqual({ status: "missing" });
  });
  it("rejects mismatched release metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tag_name: "v0.0.9", published_at: "2026-10-24T12:00:50Z" }) }));
    const state = setup("v0.0.2"); await state.loadRelease("v0.0.2");
    expect(state.releases.value["v0.0.2"].status).toBe("error");
  });
  it("loads a different app's releases, omits drafts and prereleases, and does not need a hosted pin to browse", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [
      { tag_name: "v5.2.1", published_at: "2026-10-05T11:06:33Z", body: "Fixed counting" },
      { tag_name: "v5.3.0", draft: true }, { tag_name: "v5.4.0", prerelease: true }, { tag_name: "v5.5.0-rc.1" }
    ] });
    vi.stubGlobal("fetch", fetcher);
    const scope = effectScope(); scopes.push(scope);
    const state = scope.run(() => useAppReleaseDetails("CYCLE_COUNT", []))!;
    await state.loadReleases();
    expect(fetcher).toHaveBeenCalledWith("https://api.github.com/repos/hotwax/inventory-count/releases?per_page=20&page=1", expect.objectContaining({ credentials: "omit" }));
    expect(state.releaseVersions.value).toEqual(["v5.2.1"]);
    expect(state.releases.value["v5.2.1"].brief).toEqual(["Fixed counting"]);
    expect(state.hasMore.value).toBe(false);
  });
  it("retries the same failed catalog page and keeps already loaded releases", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ tag_name: `v1.0.${i}`, body: "Notes" }));
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => rows }).mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true, json: async () => [rows[0], { tag_name: "v0.9.0" }] });
    vi.stubGlobal("fetch", fetcher);
    const scope = effectScope(); scopes.push(scope);
    const state = scope.run(() => useAppReleaseDetails("BOPIS", []))!;
    await state.loadReleases(); expect(state.hasMore.value).toBe(true);
    await state.loadMore(); expect(state.catalogError.value).toBe(true); expect(state.releaseVersions.value).toHaveLength(20);
    await state.loadMore(); expect(state.catalogError.value).toBe(false); expect(state.releaseVersions.value).toHaveLength(21);
    expect(fetcher.mock.calls[1][0]).toContain("page=2"); expect(fetcher.mock.calls[2][0]).toContain("page=2");
  });
  it("keeps the excerpt brief and strips Markdown markup and changelog boilerplate", () => {
    expect(releaseNotesBrief("## What's Changed\n* **Fixed** [login](https://example.com)\n* Added `versions`\n* Improved reload\n* Fourth item\n## New Contributors\n* @someone")).toEqual(["Fixed login", "Added versions", "Improved reload"]);
    expect(releaseNotesBrief("")).toEqual([]);
  });
});
