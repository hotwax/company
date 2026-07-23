// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ShopifyOrderSyncOrdersModal", () => {
  it("follows the Product Sync picker shell and reports an explicit cancel dismissal", () => {
    const source = readFileSync(
      `${process.cwd()}/src/components/ShopifyOrderSyncOrdersModal.vue`,
      "utf8",
    );

    expect(source).toMatch(/<ion-header>[\s\S]*<ion-toolbar>[\s\S]*closeOutline[\s\S]*<ion-title>/);
    expect(source).toMatch(/<ion-toolbar>[\s\S]*<ion-searchbar/);
    expect(source).toMatch(/<ion-content>[\s\S]*<ion-list/);
    expect(source).toMatch(/<ion-footer>[\s\S]*fill="clear"[\s\S]*fill="solid"/);
    expect(source).toContain('modalController.dismiss(null, "cancel")');
  });
});
