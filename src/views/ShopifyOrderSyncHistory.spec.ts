// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ShopifyOrderSyncHistory", () => {
  it("keeps DataManager history details inside Company at the safe projected modal boundary", () => {
    const source = readFileSync(`${process.cwd()}/src/views/ShopifyOrderSyncHistory.vue`, "utf8");

    expect(source).toContain("ShopifyOrderSyncMdmLogModal");
    expect(source).toContain("@click=\"openMdmLogDetails(log)\"");
    expect(source).not.toContain("buildAppUrl");
    expect(source).not.toContain("job-manager");
    expect(source).not.toContain("file-history");
    expect(source).not.toMatch(/target=["']_blank["']/);
    expect(source).not.toMatch(/useDataManagerLog|fetchLogDetails|downloadDataManagerFile/);
  });
});
