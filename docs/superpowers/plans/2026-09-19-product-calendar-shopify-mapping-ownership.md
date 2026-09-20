# Product Calendar Shopify Mapping Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Company Product Sync the only calendar-metafield editor, while Products provides a ProductStore-scoped mapping summary and directs operators to that editor.

**Architecture:** Company adds one Product Sync card over its existing cached `ShopifyShopTypeMapping` slice and existing save/retire mutations. Products removes its mapping mutation UI, derives an active mapping count for all linked shops, and builds a stable Company deep link. Order Routing remains responsible only for calendar conditions and its scoped Products link.

**Tech Stack:** Vue 3, Ionic 8, TypeScript, Vitest, Company Dexie cached-entity composables, shared Fast Travel `buildAppUrl`.

**Spec:** `docs/superpowers/specs/2026-09-19-product-calendar-shopify-mapping-ownership.md`

## Global Constraints

- Use `SHOPIFY_PRODUCT_CALENDAR_DATE` and only `introductionDate`, `releaseDate`, `supportDiscontinuationDate`, and `salesDiscontinuationDate`.
- Company reads through `useShopifyTypeMappings` and writes through `useShopifyShopMutations`; do not add a store, fetch loop, cache domain, endpoint, or backend migration.
- A non-empty `mappedValue` is active; an empty one is retired.
- Use `buildAppUrl("company", ...)` and `target="_blank" rel="noopener noreferrer"`; never hard-code a host.
- Choose the first linked shop by ascending local `shopId`; count mappings across every linked shop.
- Keep Ionic controls native and use CSS only for layout with existing spacer variables.
- Do not restart Moqui or make a live mapping write without a user-approved safe test shop and value.

## Review Focus

- Retired rows never contribute to the Products active count; Task 2 tests an empty `mappedValue` beside active rows.
- Unordered linked shops produce a deterministic Company target while preserving the aggregate count; Task 2 tests two shops.
- A ProductStore without a Shopify shop or Company URL renders no dead link; Task 2 tests both outcomes.
- Clearing a configured selector calls the existing retirement mutation rather than DELETE; Task 1 tests the exact payload.
- Routing's draft-only Add condition action keeps its payload behavior when converted to the native clear trailing-icon action; Task 3 tests rendering and emissions.

---

### Task 1: Add the Company Product Sync calendar-mapping card

**Files:**
- Create: `accxui/apps/company/src/components/shopify-product-sync/ProductCalendarMappingsCard.vue`
- Create: `accxui/apps/company/tests/components/shopify-product-sync/ProductCalendarMappingsCard.spec.ts`
- Modify: `accxui/apps/company/src/views/ShopifyProductSync.vue:1-230`
- Modify: `accxui/apps/company/src/locales/en.json`

**Interfaces:**
- Consumes `useShopifyTypeMappings(shopId, "SHOPIFY_PRODUCT_CALENDAR_DATE")`.
- Consumes `useShopifyShopMutations(shopId)` with `saveTypeMapping`, `retireTypeMapping`, and `refreshTypeMappings`.
- Produces `<ProductCalendarMappingsCard :shop-id="id" />` outside the first-time/returning Product Sync split.
- Saves `{ mappedTypeId: "SHOPIFY_PRODUCT_CALENDAR_DATE", mappedKey: CalendarDateField, mappedValue?: string }`.

- [ ] **Step 1: Write the failing component tests**

```ts
it("shows the cached selector for each calendar field", () => {
  const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })
  expect(wrapper.get('[data-testid="calendar-mapping-releaseDate"] input').element.value)
    .toBe("calendar:release_date")
})

it("saves a non-empty selector to its calendar field", async () => {
  const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })
  await wrapper.get('[data-testid="calendar-mapping-releaseDate"] input').setValue("calendar:launch")
  await wrapper.get('[data-testid="save-calendar-mapping-releaseDate"]').trigger("click")
  expect(saveTypeMapping).toHaveBeenCalledWith({
    mappedTypeId: "SHOPIFY_PRODUCT_CALENDAR_DATE", mappedKey: "releaseDate", mappedValue: "calendar:launch",
  })
})

it("retires a configured field when the selector is cleared", async () => {
  const wrapper = mount(ProductCalendarMappingsCard, { props: { shopId: "SHOP_1" } })
  await wrapper.get('[data-testid="calendar-mapping-releaseDate"] input').setValue("")
  await wrapper.get('[data-testid="save-calendar-mapping-releaseDate"]').trigger("click")
  expect(retireTypeMapping).toHaveBeenCalledWith({
    mappedTypeId: "SHOPIFY_PRODUCT_CALENDAR_DATE", mappedKey: "releaseDate",
  })
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm exec vitest run tests/components/shopify-product-sync/ProductCalendarMappingsCard.spec.ts`

Expected: FAIL because `ProductCalendarMappingsCard.vue` does not exist.

- [ ] **Step 3: Implement the Company component using existing mapping seams**

```ts
const CALENDAR_MAPPING_TYPE = "SHOPIFY_PRODUCT_CALENDAR_DATE"
const calendarFields = ["introductionDate", "releaseDate", "supportDiscontinuationDate", "salesDiscontinuationDate"] as const
const { mappings } = useShopifyTypeMappings(props.shopId, CALENDAR_MAPPING_TYPE)
const shopMutations = useShopifyShopMutations(props.shopId)

async function saveField(field: CalendarDateField) {
  const mappedValue = drafts.value[field].trim()
  const existing = mappingByField.value[field]
  if (!mappedValue && existing?.mappedValue) {
    await shopMutations.retireTypeMapping({ mappedTypeId: CALENDAR_MAPPING_TYPE, mappedKey: field })
  } else if (mappedValue) {
    await shopMutations.saveTypeMapping({ mappedTypeId: CALENDAR_MAPPING_TYPE, mappedKey: field, mappedValue })
  }
}
```

Render one native card with four `ion-item` rows, one `ion-input` per destination field, and a clear end-slot Save action. Follow existing Company toast/error behavior and preserve failed input. Mount the card in `ShopifyProductSync.vue` outside the experience-mode branch.

- [ ] **Step 4: Run focused Company test to verify it passes**

Run: `pnpm exec vitest run tests/components/shopify-product-sync/ProductCalendarMappingsCard.spec.ts`

Expected: PASS, including save and retirement behavior.

- [ ] **Step 5: Run Company validation**

Run: `pnpm test:unit && pnpm typecheck && pnpm build`

Expected: PASS with no new Company failure.

- [ ] **Step 6: Commit the Company implementation**

```bash
git add src/components/shopify-product-sync/ProductCalendarMappingsCard.vue tests/components/shopify-product-sync/ProductCalendarMappingsCard.spec.ts src/views/ShopifyProductSync.vue src/locales/en.json
git commit -m "feat: manage calendar mappings in product sync"
```

### Task 2: Make Products a read-only ProductStore mapping summary

**Files:**
- Create: `accxui/apps/products/src/utils/productCalendarMappings.ts`
- Create: `accxui/apps/products/src/utils/__tests__/productCalendarMappings.test.ts`
- Modify: `accxui/apps/products/src/views/ProductCalendar.vue:1-260`
- Modify: `accxui/apps/products/src/api/productCalendar.ts:1-55`
- Modify: `accxui/apps/products/src/api/__tests__/productCalendar.test.ts`

**Interfaces:**
- Produces `getActiveCalendarMappings(shops, mappings): ShopifyTypeMapping[]`.
- Produces `getCalendarMappingManagementHref(shops): string | null`.
- Consumes the existing Product Calendar shop and mapping reads.
- Company target is `/shopify-connection-details/<shopId>/product-sync`.

- [ ] **Step 1: Write the failing helper tests**

```ts
it("counts only active calendar mappings for linked shops", () => {
  expect(getActiveCalendarMappings(
    [{ shopId: "B" }, { shopId: "A" }],
    [
      { shopId: "A", mappedTypeId: "SHOPIFY_PRODUCT_CALENDAR_DATE", mappedKey: "releaseDate", mappedValue: "calendar:launch" },
      { shopId: "B", mappedTypeId: "SHOPIFY_PRODUCT_CALENDAR_DATE", mappedKey: "introductionDate", mappedValue: "" },
      { shopId: "C", mappedTypeId: "SHOPIFY_PRODUCT_CALENDAR_DATE", mappedKey: "releaseDate", mappedValue: "calendar:other" },
    ],
  )).toHaveLength(1)
})

it("uses the first stable linked shop for the Company Product Sync URL", () => {
  expect(getCalendarMappingManagementHref([{ shopId: "B" }, { shopId: "A" }]))
    .toBe("https://company.example/shopify-connection-details/A/product-sync")
})

it("returns null when no linked shop is available", () => {
  expect(getCalendarMappingManagementHref([])).toBeNull()
})

it("returns null when the Company app URL is unavailable", () => {
  vi.mocked(buildAppUrl).mockReturnValueOnce(null)
  expect(getCalendarMappingManagementHref([{ shopId: "A" }])).toBeNull()
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm exec vitest run src/utils/__tests__/productCalendarMappings.test.ts`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement the pure Products helpers**

```ts
export function getActiveCalendarMappings(shops: Array<{ shopId?: unknown }>, mappings: ShopifyTypeMapping[]) {
  const shopIds = new Set(shops.map((shop) => String(shop.shopId ?? "")).filter(Boolean))
  return mappings.filter((mapping) => mapping.mappedTypeId === PRODUCT_CALENDAR_MAPPING_TYPE
    && shopIds.has(String(mapping.shopId ?? ""))
    && Boolean(String(mapping.mappedValue ?? "").trim()))
}

export function getCalendarMappingManagementHref(shops: Array<{ shopId?: unknown }>) {
  const shopId = shops.map((shop) => String(shop.shopId ?? "")).filter(Boolean).sort()[0]
  return shopId ? buildAppUrl("company", `/shopify-connection-details/\${encodeURIComponent(shopId)}/product-sync`) : null
}
```

- [ ] **Step 4: Replace Products mapping editing with the summary item**

Remove the Add Shopify mapping action, mapping modal, mapping list, save state, and `saveProductCalendarMapping` export. Keep the mapping read. Render a native summary `ion-item` containing the active count and a clear **Manage Shopify mappings** action only when the helper has an href. Use `target="_blank"` and `rel="noopener noreferrer"`.

- [ ] **Step 5: Run focused Products tests to verify them passing**

Run: `pnpm exec vitest run src/utils/__tests__/productCalendarMappings.test.ts src/api/__tests__/productCalendar.test.ts`

Expected: PASS, with obsolete mutation assertions removed and summary behavior covered.

- [ ] **Step 6: Run Products validation**

Run: `pnpm test:unit && pnpm build && pnpm lint`

Expected: PASS or pre-existing lint failures documented separately.

- [ ] **Step 7: Commit the Products implementation**

```bash
git add src/utils/productCalendarMappings.ts src/utils/__tests__/productCalendarMappings.test.ts src/views/ProductCalendar.vue src/api/productCalendar.ts src/api/__tests__/productCalendar.test.ts
git commit -m "refactor: manage calendar mappings in company"
```

### Task 3: Finish the Routing calendar-condition card action

**Files:**
- Modify: `accxui/apps/order-routing/src/components/ProductCalendarRuleConditions.vue:1-190`
- Modify: `accxui/apps/order-routing/tests/productCalendarRuleConditions.test.ts:1-125`

**Interfaces:**
- Preserves `update:conditions` only after a calendar condition becomes complete.
- Produces a direct `<ion-button fill="clear">` Add condition action with `addCircleOutline` in the end slot.

- [ ] **Step 1: Add the failing render contract to the existing test**

```ts
const addCondition = wrapper.findAll("button").find((button) => button.text() === "Add condition")
expect(addCondition?.attributes("fill")).toBe("clear")
expect(addCondition?.find('i[slot="end"]').exists()).toBe(true)
await addCondition?.trigger("click")
expect(wrapper.emitted("update:conditions")).toBeUndefined()
```

Update the mocked `IonIcon` to forward attributes so the end slot is observable.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm exec vitest run tests/productCalendarRuleConditions.test.ts`

Expected: FAIL because the action is currently outlined, has a start icon, and is wrapped in an `ion-item`.

- [ ] **Step 3: Implement the direct native card action**

```vue
<ion-button class="calendar-condition-actions" fill="clear" size="small" @click="addCondition">
  {{ translate("Add condition") }}
  <ion-icon slot="end" :icon="addCircleOutline" />
</ion-button>
```

Remove the `IonItem` and `calendarOutline` imports. Preserve the existing margin class and all condition-row behavior.

- [ ] **Step 4: Run focused Routing test to verify it passes**

Run: `pnpm exec vitest run tests/productCalendarRuleConditions.test.ts`

Expected: PASS, including no draft-to-payload leakage.

- [ ] **Step 5: Run Routing validation and commit**

Run: `pnpm test:unit && pnpm typecheck && git diff --check`

Expected: PASS with no whitespace error.

```bash
git add src/components/ProductCalendarRuleConditions.vue tests/productCalendarRuleConditions.test.ts
git commit -m "fix: align calendar condition action"
```

### Task 4: Verify the cross-app handoff and publish reviewable branches

**Files:**
- Modify: `accxui/apps/company/docs/superpowers/plans/2026-09-19-product-calendar-shopify-mapping-ownership.md`

**Interfaces:**
- Uses the existing app registry: Routing → Products → Company.
- Keeps the Company Product Sync route shop-scoped and opens it in a new tab.

- [ ] **Step 1: Start current local frontend servers without restarting Moqui**

Use separate localhost ports and the current local OMS configuration. Do not print credentials or alter the backend process.

- [ ] **Step 2: Browser UAT the no-write path**

In the in-app browser, verify the Routing rule action, follow the Products calendar link, confirm the Products count and Company action, and open the Company Product Sync card for the selected shop. Do not save a mapping without the user providing a safe test shop and selector.

- [ ] **Step 3: Record completed checks and commit the plan update**

```bash
git add docs/superpowers/plans/2026-09-19-product-calendar-shopify-mapping-ownership.md
git commit -m "docs: record calendar mapping verification"
```

- [ ] **Step 4: Inspect each push destination before pushing**

```bash
git rev-parse --show-toplevel
git status --short --branch
git branch --show-current
git remote -v
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Push only the dedicated Company branch and the existing Products and Routing feature branches. Never push `main`, force-push, merge, deploy, or change production state.
