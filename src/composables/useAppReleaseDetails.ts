import { onScopeDispose, ref } from "vue";
import { appVersionCache } from "@/db/appVersionCache";
import { APP_REPOSITORIES } from "@/utils/appRepositories";
import { releaseNotesBrief } from "@/utils/appReleaseNotes";

interface ReleaseDetails {
  status: "loading" | "ready" | "missing" | "error";
  publishedAt?: number;
  brief?: string[];
  url?: string;
}

const cache = new Map<string, { expires: number; release: ReleaseDetails }>();

/** Public release metadata only. OMS credentials must never be sent to GitHub. */
export function useAppReleaseDetails(appId: string, versions: string[]) {
  const releases = ref<Record<string, ReleaseDetails>>({});
  const releaseVersions = ref<string[]>([]);
  const catalogLoading = ref(false);
  const catalogError = ref(false);
  const hasMore = ref(false);
  let page = 1;
  const controllers = new Set<AbortController>();
  let disposed = false;
  onScopeDispose(() => {
    disposed = true;
    controllers.forEach(controller => controller.abort());
  });

  async function loadRelease(version: string) {
    if(disposed || releases.value[version]?.status === "loading") {return;}
    const repository = APP_REPOSITORIES[appId];
    if(!repository) {
      releases.value[version] = { status: "missing" };

      return;
    }
    const key = `${repository}/${version}`;
    const cached = cache.get(key);
    if(cached && cached.expires > Date.now()) {
      releases.value[version] = cached.release;

      return;
    }
    releases.value[version] = { status: "loading" };
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(version)}`, {
        credentials: "omit",
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal
      });
      if(disposed) {return;}
      if(response.status === 404) {
        releases.value[version] = { status: "missing" };

        return;
      }
      if(!response.ok) {throw new Error("Could not load release details");}
      const data = await response.json();
      if(disposed) {return;}
      if(data.draft || data.tag_name !== version) {throw new Error("Unexpected release metadata");}
      recordRelease(data, repository);
    } catch {
      if(!disposed) {releases.value[version] = { status: "error" };}
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
    }
  }

  function recordRelease(data: any, repository: string) {
    const publishedAt = Date.parse(data.published_at);
    const release: ReleaseDetails = {
      status: "ready",
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : undefined,
      brief: releaseNotesBrief(typeof data.body === "string" ? data.body : ""),
      url: `https://github.com/${repository}/releases/tag/${encodeURIComponent(data.tag_name)}`
    };
    releases.value[data.tag_name] = release;
    cache.set(`${repository}/${data.tag_name}`, { expires: Date.now() + 5 * 60 * 1000, release });
  }

  async function loadMore(fresh = false) {
    const repository = APP_REPOSITORIES[appId];
    if(disposed || catalogLoading.value || !repository) {return;}
    catalogLoading.value = true;
    catalogError.value = false;
    const key = `${repository}/${page}`;
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      let rows = fresh ? undefined : await appVersionCache.get(`github:${key}`);
      if(!rows) {
        const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=20&page=${page}`, {
          credentials: "omit", headers: { Accept: "application/vnd.github+json" }, signal: controller.signal
        });
        if(!response.ok) {throw new Error("Could not load releases");}
        rows = await response.json();
        if(!Array.isArray(rows)) {throw new Error("Invalid release catalog");}
        await appVersionCache.put(`github:${key}`, rows, 15 * 60 * 1000);
      }
      if(disposed) {return;}
      for(const data of rows) {
        if(data.draft || data.prerelease || typeof data.tag_name !== "string" || !/^v\d+\.\d+\.\d+$/.test(data.tag_name)) {continue;}
        recordRelease(data, repository);
        if(!releaseVersions.value.includes(data.tag_name)) {releaseVersions.value.push(data.tag_name);}
      }
      hasMore.value = rows.length === 20;
      page += 1;
    } catch {
      if(!disposed) {catalogError.value = true;}
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
      if(!disposed) {catalogLoading.value = false;}
    }
  }

  async function loadReleases(fresh = false) {
    if(fresh) {page = 1;}
    await loadMore(fresh);
    await Promise.all([...new Set(versions)].filter(version => !releases.value[version]).map(loadRelease));
  }

  return { releases, releaseVersions, catalogLoading, catalogError, hasMore, loadMore, loadRelease, loadReleases };
}
