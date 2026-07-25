// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import SystemMessageDetailsModal from "@/components/common/SystemMessageDetailsModal.vue";

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
  IonSpinner: container(),
  IonTitle: container("h1"),
  IonToolbar: container(),
};

describe("SystemMessageDetailsModal", () => {
  it("renders only the already-projected safe status and count facts", () => {
    const wrapper = mount(SystemMessageDetailsModal, {
      props: {
        isOpen: true,
        messageId: "M228520",
        details: {
          statusId: "SmsgSent",
          systemMessageTypeId: "ShopifyOrderSync",
          systemMessageRemoteId: "REMOTE_10010",
          requestedAt: "2026-07-22T12:00:00Z",
          completedAt: "2026-07-22T12:01:00Z",
          totalRecordCount: 1,
          failureCount: 0,
        },
      },
      global: { stubs: ionicStubs },
    });

    expect(wrapper.text()).toContain("M228520");
    expect(wrapper.text()).toContain("Completed");
    expect(wrapper.text()).toContain("ShopifyOrderSync");
    expect(wrapper.text()).toContain("Records");
    expect(wrapper.text()).toContain("Failures");
    expect(wrapper.text()).not.toContain("Message content");
    expect(wrapper.text()).not.toContain("SystemMessage errors");
    const source = readFileSync(`${process.cwd()}/src/components/common/SystemMessageDetailsModal.vue`, "utf8");
    expect(source).not.toMatch(/<ion-content>\s*<template>/);
    expect(source).toMatch(/aria-label="translate\('Close'\)"[\s\S]*closeOutline/);
  });

  it("shows one holistic safe progress story for a request that failed before import", () => {
    const wrapper = mount(SystemMessageDetailsModal, {
      props: {
        isOpen: true,
        messageId: "M221664",
        details: {
          statusId: "SmsgError",
          systemMessageTypeId: "ShopifyOrderSync",
          requestedAt: "2026-07-22T12:00:00Z",
          completedAt: "2026-07-22T12:01:00Z",
          failureCount: 1,
          requestFailedBeforeImport: true,
          requestFailureText: "Shopify order request failed before import.",
        },
      },
      global: { stubs: ionicStubs },
    });

    expect(wrapper.text()).toContain("Order sync request details");
    expect(wrapper.text()).toContain("Shopify order request failed before import.");
    expect(wrapper.text()).toContain("HotWax order import");
    expect(wrapper.text()).toContain("The request failed before import, so no DataManager import was created.");
    expect(wrapper.text()).toContain("Not started");
    expect(wrapper.text()).toContain("M221664");
  });

  it("supports Product Sync next-step actions without accepting raw message content", async () => {
    const wrapper = mount(SystemMessageDetailsModal, {
      props: {
        isOpen: true,
        messageId: "M300000",
        details: {
          statusId: "SmsgProduced",
          statusLabel: "Produced",
          bulkOperationId: "gid://shopify/BulkOperation/123",
          nextStepReason: "The send job will submit this request.",
          nextJobLabel: "Send bulk operation",
          nextJobRunLabel: "in 2 minutes",
        },
        primaryAction: { id: "send", label: "Send now" },
        secondaryActions: [{ id: "cancel", label: "Cancel run" }],
      },
      global: { stubs: ionicStubs },
    });

    expect(wrapper.text()).toContain("M300000");
    expect(wrapper.text()).toContain("Bulk operation ID");
    expect(wrapper.text()).toContain("The send job will submit this request.");
    expect(wrapper.text()).toContain("Send now");
    expect(wrapper.text()).toContain("Cancel run");

    const actionButtons = wrapper.findAll("button");
    await actionButtons.find((button) => button.text() === "Send now")!.trigger("click");
    expect(wrapper.emitted("action")).toEqual([["send"]]);

    const source = readFileSync(`${process.cwd()}/src/components/common/SystemMessageDetailsModal.vue`, "utf8");
    expect(source).not.toContain("messageText");
    expect(source).not.toContain("errorText");
    expect(source).not.toContain("payload");
  });

  it("is the shared modal used by both Product Sync and Order Sync", () => {
    const productSyncSource = readFileSync(`${process.cwd()}/src/views/ShopifyProductSync.vue`, "utf8");
    const orderSyncSource = readFileSync(`${process.cwd()}/src/views/ShopifyOrderSync.vue`, "utf8");
    expect(productSyncSource).toContain('import SystemMessageDetailsModal from "@/components/common/SystemMessageDetailsModal.vue"');
    expect(orderSyncSource).toContain('import SystemMessageDetailsModal from "@/components/common/SystemMessageDetailsModal.vue"');
    expect(productSyncSource).not.toMatch(/currentSyncRun\.systemMessage\.(messageText|errorText)/);
  });
});
