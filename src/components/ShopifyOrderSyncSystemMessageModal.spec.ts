// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import ShopifyOrderSyncSystemMessageModal from "./ShopifyOrderSyncSystemMessageModal.vue";

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

describe("ShopifyOrderSyncSystemMessageModal", () => {
  it("renders only the already-projected safe status and count facts", () => {
    const wrapper = mount(ShopifyOrderSyncSystemMessageModal, {
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
    const source = readFileSync(`${process.cwd()}/src/components/ShopifyOrderSyncSystemMessageModal.vue`, "utf8");
    expect(source).not.toMatch(/<ion-content>\s*<template>/);
    expect(source).toMatch(/aria-label="translate\('Close'\)"[\s\S]*closeOutline/);
  });

  it("shows one holistic safe progress story for a request that failed before import", () => {
    const wrapper = mount(ShopifyOrderSyncSystemMessageModal, {
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
});
