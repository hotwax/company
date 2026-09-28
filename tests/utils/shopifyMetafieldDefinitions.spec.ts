import { describe, expect, it } from "vitest"
import {
  type ShopifyMetafieldDefinition,
  checkMetafieldSelector,
  parseMetafieldDefinitionsPage,
  parseMetafieldSelector,
} from "@/utils/shopifyMetafieldDefinitions"

const definition = (overrides: Partial<ShopifyMetafieldDefinition>): ShopifyMetafieldDefinition => ({
  ownerType: "PRODUCT",
  name: "Go live date",
  namespace: "custom",
  key: "go_live_date",
  type: "date",
  selector: "custom:go_live_date",
  ...overrides,
})

describe("parseMetafieldSelector", () => {
  it("splits at the first colon, as the connector does", () => {
    expect(parseMetafieldSelector(" custom:launch:us ")).toEqual({ namespace: "custom", key: "launch:us" })
  })

  it.each(["", "go_live_date", ":go_live_date", "custom:", "HC_PREORDER.PROMISE_DATE"])("rejects %j", (value) => {
    expect(parseMetafieldSelector(value)).toBeNull()
  })
})

describe("checkMetafieldSelector", () => {
  const definitions = [
    definition({}),
    definition({ ownerType: "PRODUCTVARIANT", name: "Notes", key: "notes", type: "single_line_text_field", selector: "custom:notes" }),
  ]

  it("matches a date definition by exact namespace and key", () => {
    expect(checkMetafieldSelector("custom:go_live_date", definitions)).toEqual({ status: "match", matches: [definitions[0]] })
  })

  it("flags a definition the sync would skip because it is not a date", () => {
    expect(checkMetafieldSelector("custom:notes", definitions)).toEqual({ status: "wrong-type", matches: [definitions[1]] })
  })

  it("reports no match for a different key or letter case", () => {
    expect(checkMetafieldSelector("custom:Go_Live_Date", definitions)).toEqual({ status: "no-match" })
  })

  it("reports a malformed selector before looking for matches", () => {
    expect(checkMetafieldSelector("go_live_date", definitions)).toEqual({ status: "invalid" })
  })
})

describe("parseMetafieldDefinitionsPage", () => {
  const page = (overrides: Record<string, unknown> = {}) => ({
    response: {
      data: {
        metafieldDefinitions: {
          nodes: [{ name: "Go live date", namespace: "custom", key: "go_live_date", type: { name: "date" } }],
          pageInfo: { hasNextPage: true, endCursor: "CURSOR_1" },
          ...overrides,
        },
      },
    },
  })

  it("maps definitions for the owner type and returns the next cursor", () => {
    expect(parseMetafieldDefinitionsPage(page(), "PRODUCTVARIANT")).toEqual({
      definitions: [definition({ ownerType: "PRODUCTVARIANT" })],
      endCursor: "CURSOR_1",
    })
  })

  it("stops paging on the last page", () => {
    expect(parseMetafieldDefinitionsPage(page({ pageInfo: { hasNextPage: false, endCursor: "CURSOR_1" } }), "PRODUCT").endCursor).toBeNull()
  })

  it("rejects GraphQL errors and incomplete pages", () => {
    expect(() => parseMetafieldDefinitionsPage({ response: { errors: [{ message: "Access denied" }] } }, "PRODUCT")).toThrow()
    expect(() => parseMetafieldDefinitionsPage({ response: { data: { metafieldDefinitions: { nodes: [] } } } }, "PRODUCT")).toThrow()
  })
})
