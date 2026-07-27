import { describe, expect, it } from "vitest";

import {
  SYSTEM_MESSAGE_STATUS_IDS,
  belongsToRemote,
  isFailure,
  isSuccess,
  isTerminal,
  messageState,
  resolveRemoteId,
  resolveShopRemoteIds,
  shopRemoteCandidates,
  sortRemotesByAccess,
  type SystemMessage,
  type SystemMessageState,
} from "@/utils/systemMessage";

/**
 * L1 pure behaviors for the SystemMessage entity — no mocks, no DOM.
 * Status vocabulary verified against the maarg-oms StatusItem seed
 * (statusTypeId="SystemMessage", 11 statuses).
 */

const makeMessage = (over: Partial<SystemMessage>): SystemMessage => ({
  systemMessageId: "M1",
  systemMessageTypeId: "ShopifyOrderSync",
  systemMessageRemoteId: "SHOPIFY_10010",
  statusId: "SmsgProduced",
  ...over,
});

describe("messageState — direct map of the real SystemMessage status id", () => {
  it.each<[statusId: string, expected: SystemMessageState]>([
    // Staged — nothing is being transferred yet.
    ["SmsgTriggered", "pending"],
    ["SmsgProduced", "pending"],
    ["SmsgReceived", "pending"],
    // In flight — a transfer is actively happening.
    ["SmsgSending", "active"],
    ["SmsgConsuming", "active"], // regression guard: must not fall through to pending
    // Terminal success.
    ["SmsgSent", "completed"],
    ["SmsgConsumed", "completed"],
    ["SmsgConfirmed", "completed"],
    // Terminal failure.
    ["SmsgRejected", "failed"],
    ["SmsgCancelled", "failed"],
    ["SmsgError", "failed"],
  ])("%s → %s", (statusId, expected) => {
    expect(messageState(statusId)).toBe(expected);
  });

  it("covers exactly the 11 seeded statuses", () => {
    expect(SYSTEM_MESSAGE_STATUS_IDS).toHaveLength(11);
  });

  it("treats an absent or empty status as pending", () => {
    expect(messageState(null)).toBe("pending");
    expect(messageState(undefined)).toBe("pending");
    expect(messageState("")).toBe("pending");
  });

  it("maps the exact id only — an unrecognized status defaults to pending, never a guess", () => {
    expect(messageState("SmsgResent")).toBe("pending");
    expect(messageState("smsgconsumed")).toBe("pending"); // exact, not case-folded
  });
});

describe("terminal / success / failure predicates", () => {
  it("marks completed and failed as terminal, in-flight as not", () => {
    expect(isTerminal("SmsgConsumed")).toBe(true);
    expect(isTerminal("SmsgError")).toBe(true);
    expect(isTerminal("SmsgSending")).toBe(false);
    expect(isTerminal("SmsgProduced")).toBe(false);
    expect(isTerminal(null)).toBe(false);
  });

  it("separates success from failure", () => {
    expect(isSuccess("SmsgConsumed")).toBe(true);
    expect(isSuccess("SmsgError")).toBe(false);
    expect(isFailure("SmsgError")).toBe(true);
    expect(isFailure("SmsgConsumed")).toBe(false);
  });
});

describe("belongsToRemote — shop scope guard", () => {
  it("matches only the exact remote id", () => {
    expect(belongsToRemote(makeMessage({ systemMessageRemoteId: "SHOPIFY_10010" }), "SHOPIFY_10010")).toBe(true);
    expect(belongsToRemote(makeMessage({ systemMessageRemoteId: "SHOPIFY_10010" }), "SHOPIFY_99999")).toBe(false);
  });

  it("rejects when either side is missing", () => {
    expect(belongsToRemote(makeMessage({ systemMessageRemoteId: "SHOPIFY_10010" }), "")).toBe(false);
    expect(belongsToRemote(null, "SHOPIFY_10010")).toBe(false);
  });
});

describe("resolveRemoteId", () => {
  it("returns a raw id string unchanged", () => {
    expect(resolveRemoteId("SHOPIFY_10010")).toBe("SHOPIFY_10010");
  });

  it("reads systemMessageRemoteId from a remote record", () => {
    expect(resolveRemoteId({ systemMessageRemoteId: "SHOPIFY_10010" })).toBe("SHOPIFY_10010");
  });

  it("returns an empty string when the remote is absent", () => {
    expect(resolveRemoteId(null)).toBe("");
    expect(resolveRemoteId(undefined)).toBe("");
  });
});

/**
 * Shop → SystemMessageRemote matching.
 *
 * These cases encode why the worker's message scope was silently empty: the link lives on the
 * REMOTE (`remoteId` / `internalId`), never on the shop row, so any rule that reads the shop for a
 * remote id matches nothing. Field values mirror a live record (2026-07-27): remote
 * `HCDemoShopifyConfig` carries remoteId `6973849727` (SHOPIFY_SHOP_ID) and internalId `10000`
 * (HOTWAX_SHOP_ID).
 */
describe("shop ↔ remote matching", () => {
  const shop = { shopId: "10000", shopifyShopId: "6973849727" };
  const remote = {
    systemMessageRemoteId: "HCDemoShopifyConfig",
    remoteId: "6973849727",
    internalId: "10000",
    accessScopeEnumId: "SHOP_RW_ACCESS",
  };
  const otherShopRemote = {
    systemMessageRemoteId: "OtherShopConfig",
    remoteId: "67452731546",
    internalId: "10010",
  };
  const nonShopRemote = { systemMessageRemoteId: "AWS_CONFIG" };

  it("matches a remote to its shop on remoteId + internalId", () => {
    expect(shopRemoteCandidates([remote], shop)).toEqual([remote]);
  });

  it("ignores remotes belonging to another shop", () => {
    expect(shopRemoteCandidates([otherShopRemote], shop)).toEqual([]);
  });

  it("ignores remotes that are not shop remotes at all", () => {
    expect(shopRemoteCandidates([nonShopRemote], shop)).toEqual([]);
  });

  it("accepts a remote with no internalId, since some legitimately omit it", () => {
    const noInternal = { systemMessageRemoteId: "R", remoteId: "6973849727" };
    expect(shopRemoteCandidates([noInternal], shop)).toEqual([noInternal]);
  });

  it("rejects a remoteId match whose internalId points at a different shop", () => {
    const mismatched = { systemMessageRemoteId: "R", remoteId: "6973849727", internalId: "99999" };
    expect(shopRemoteCandidates([mismatched], shop)).toEqual([]);
  });

  it("requires a shopifyShopId — a shop without one can never be matched", () => {
    expect(shopRemoteCandidates([remote], { shopId: "10000" })).toEqual([]);
  });

  it("ranks canonical write access above legacy, read-only and no-access", () => {
    const ranked = sortRemotesByAccess([
      { systemMessageRemoteId: "none", accessScopeEnumId: "SHOP_NO_ACCESS" },
      { systemMessageRemoteId: "read", accessScopeEnumId: "SHOP_READ_ACCESS" },
      { systemMessageRemoteId: "legacy", accessScopeEnumId: "SHOP_READ_WRITE_ACCESS" },
      { systemMessageRemoteId: "rw", accessScopeEnumId: "SHOP_RW_ACCESS" },
    ]).map((entry) => entry.systemMessageRemoteId);
    expect(ranked).toEqual(["rw", "legacy", "read", "none"]);
  });

  it("collects remote ids across every cached shop, de-duplicated", () => {
    const shops = [shop, { shopId: "10010", shopifyShopId: "67452731546" }];
    expect(resolveShopRemoteIds(shops, [remote, otherShopRemote, nonShopRemote, remote]))
      .toEqual(["HCDemoShopifyConfig", "OtherShopConfig"]);
  });

  /** The guard that must NOT be softened into "poll everything". */
  it("returns empty rather than falling back to every remote when nothing matches", () => {
    expect(resolveShopRemoteIds([{ shopId: "X", shopifyShopId: "does-not-exist" }], [remote])).toEqual([]);
    expect(resolveShopRemoteIds([], [remote])).toEqual([]);
  });

  it("does not match on a shop field, which is how the original bug went unnoticed", () => {
    // A shop row carrying its own systemMessageRemoteId is not a match signal: the field does not
    // exist on the endpoint, so relying on it yields nothing.
    const shopWithStaleField: any = { shopId: "10000", systemMessageRemoteId: "HCDemoShopifyConfig" };
    expect(resolveShopRemoteIds([shopWithStaleField], [remote])).toEqual([]);
  });
});
