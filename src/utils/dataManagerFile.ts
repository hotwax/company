import { api, logger } from "@common";

/**
 * The text of one Data Manager file (source or error), by content id.
 *
 * `DataManagerLogDetails` exposes file REFERENCES only — `logContentId` / `errorLogContentId` and
 * their names, locations and sizes — so the bytes have to be fetched. `download#DataManagerFile`
 * reads `DataManagerContent.contentLocation` and answers `{ csvData }` regardless of the file's
 * actual format; the name is historical, JSON comes back through the same field.
 */
export async function fetchDataManagerFileContent(
  configId: string,
  logContentId: string,
): Promise<{ text: string; parsed?: any } | null> {
  try {
    const resp: any = await api({
      url: "admin/dataManager/downloadDataManagerFile",
      method: "GET",
      params: { configId, logContentId },
    });

    const content = resp?.data?.csvData ?? resp?.data;
    // A bare {} means no downloadable content is stored for this content id.
    if(content && typeof content === "object" && !Object.keys(content).length) { return null; }

    if(typeof content !== "string") {
      // The HTTP client already parsed this. The text form is still needed for copy and download,
      // but the parsed value is handed over so the view does not re-parse what we just serialised.
      return content ? { text: JSON.stringify(content, null, 2), parsed: content } : null;
    }

    // Tested with a regex rather than trimming: replace() would allocate a second copy of what can
    // be a multi-megabyte payload just to compare it to "{}".
    return content && !/^\s*\{\s*\}\s*$/.test(content) ? { text: content } : null;
  } catch (err) {
    logger.error(`Failed to fetch Data Manager file content for ${logContentId}`, err);

    return null;
  }
}

/**
 * The parameters this log was created with.
 *
 * `DataManagerLogDetails` (what the transfer detail bundle returns) carries no parameters, so the
 * log master is read for them. The master nests them under the entity name; callers want the list.
 */
export async function fetchDataManagerLogParameters(logId: string): Promise<any[]> {
  try {
    const resp: any = await api({ url: `admin/dataManager/logs/${encodeURIComponent(logId)}`, method: "GET" });

    return resp?.data?.["co.hotwax.datamanager.DataManagerParameter"] ?? [];
  } catch (err) {
    logger.error(`Failed to fetch Data Manager parameters for log ${logId}`, err);

    return [];
  }
}

/** The in-parameter contract of the import service, so a log's values can be read against it. */
export async function fetchServiceInParameters(serviceName: string): Promise<any[]> {
  try {
    const resp: any = await api({
      url: `admin/services/${encodeURIComponent(serviceName)}/parameters`,
      method: "GET",
      params: { pageSize: 1000 },
    });

    // Underscore-prefixed entries are framework internals, not operator input.
    return (resp?.data?.serviceInParameters ?? []).filter((param: any) => !String(param?.name ?? "").startsWith("_"));
  } catch (err) {
    logger.error(`Failed to fetch service parameters for ${serviceName}`, err);

    return [];
  }
}
