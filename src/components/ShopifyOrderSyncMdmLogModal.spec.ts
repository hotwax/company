// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import ShopifyOrderSyncMdmLogModal from "./ShopifyOrderSyncMdmLogModal.vue";

vi.mock("@common", () => ({ translate: (key: string) => key }));
vi.mock("@/utils", () => ({ formatDateTime: (value: unknown) => String(value || "") }));

const container = (tag = "div") => ({ template: `<${tag} v-bind="$attrs"><slot /></${tag}>` });
const ionicStubs = {
  IonBadge: container("span"),
  IonButton: container("button"),
  IonButtons: container(),
  IonContent: container(),
  IonHeader: container(),
  IonIcon: container("i"),
  IonItem: container(),
  IonLabel: container("span"),
  IonList: container(),
  IonModal: container("section"),
  IonNote: container("small"),
  IonTitle: container("h1"),
  IonToolbar: container(),
};

describe("ShopifyOrderSyncMdmLogModal", () => {
  it("renders only the projected read-only import facts", () => {
    const wrapper = mount(ShopifyOrderSyncMdmLogModal, {
      props: {
        isOpen: true,
        logId: "M101327",
        details: {
          statusId: "DmlsFinished",
          configId: "SYNC_SHOPIFY_ORDER",
          systemMessageId: "M228571",
          startedAt: "2026-07-22T12:00:00Z",
          completedAt: "2026-07-22T12:01:00Z",
          totalRecordCount: 2,
          successRecordCount: 2,
          failedRecordCount: 0,
        },
      },
      global: { stubs: ionicStubs },
    });

    expect(wrapper.text()).toContain("M101327");
    expect(wrapper.text()).toContain("Completed");
    expect(wrapper.text()).toContain("SYNC_SHOPIFY_ORDER");
    expect(wrapper.text()).toContain("M228571");
    expect(wrapper.text()).toMatch(/Total Records\s*2/);
    expect(wrapper.text()).toMatch(/Success Records\s*2/);
    expect(wrapper.text()).toMatch(/Failed Records\s*0/);
    expect(wrapper.find("a").exists()).toBe(false);

    const source = readFileSync(`${process.cwd()}/src/components/ShopifyOrderSyncMdmLogModal.vue`, "utf8");
    expect(source).not.toMatch(/useDataManagerLog|fetchLogDetails|messageText|errorMessage/);
    expect(source).toMatch(/aria-label="translate\('Close'\)"[\s\S]*closeOutline/);
  });
});
