# TikTok Shop Config Management UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins manage TikTok Shop connections in the company PWA like they manage Shopify: app setup → authorize/import shops → per-shop settings → shipping-provider mappings.

**Architecture:** Two parts in two repos. Part A adds a small authenticated management API (9 endpoints) to the existing Moqui `tiktok` component — dedicated services (not raw entity REST) so tokens/secrets are never echoed. Part B adds a Pinia store + 4 routed screens + 2 modals to the company PWA, mirroring the Shopify section's structure and conventions.

**Tech Stack:** Moqui XML services + Service REST (Part A); Vue 3 + Ionic + Pinia + `@common` from accxui (Part B).

**Spec:** `docs/superpowers/specs/2026-06-11-tiktok-config-ui-design.md`

**Testing note (read first):** Neither repo has a unit-test harness for this work — the company app removed Vitest, and the tiktok component's convention is e2e against its bundled sandbox plus the `moqui-verification` audit. So tasks here use **verify-after** with exact commands (curl with expected JSON; `vue-tsc` + `pnpm build`) instead of test-first. Do not skip verification steps.

**Repos / branches:**
- Part A: `/Users/anilpatel/maarg-sd/asbeauty/runtime/component/tiktok` (its own git repo) — create branch `feat/management-api`.
- Part B: `/Users/anilpatel/pwa-sd/company` — branch `feat/tiktok-config-ui` (already exists, contains the spec).

**Backend verify prerequisites:** a local Moqui instance running the asbeauty stack: `cd /Users/anilpatel/maarg-sd/asbeauty && ./gradlew run` (first boot takes a few minutes; instance on `http://localhost:8080`). Curl examples use the Moqui dev admin `john.doe:moqui` — substitute your local admin credentials if different. Adding XML service/REST files requires an instance **restart** to load.

---

## Part A — Backend management API (tiktok component)

### Task 1: App-credentials services + REST resources

**Files:**
- Create: `/Users/anilpatel/maarg-sd/asbeauty/runtime/component/tiktok/service/co/hotwax/tiktok/TikTokShopManagementServices.xml`
- Modify: `/Users/anilpatel/maarg-sd/asbeauty/runtime/component/tiktok/service/tiktok.rest.xml`

- [ ] **Step 1: Create the branch**

```bash
cd /Users/anilpatel/maarg-sd/asbeauty/runtime/component/tiktok
git checkout -b feat/management-api
```

- [ ] **Step 2: Create `TikTokShopManagementServices.xml` with the two credential services**

Create `service/co/hotwax/tiktok/TikTokShopManagementServices.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<services xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://moqui.org/xsd/service-definition-3.xsd">

    <!-- ============================================================================ -->
    <!-- Management API backing the company PWA's TikTok config screens.             -->
    <!-- Dedicated services (not entity REST) so credentials and OAuth tokens are    -->
    <!-- NEVER returned: get#TikTokAppCredentials reports only whether a secret is   -->
    <!-- set; shop reads strip accessToken/refreshToken.                             -->
    <!-- ============================================================================ -->

    <service verb="get" noun="TikTokAppCredentials">
        <description>App credential status for the admin UI: app_key + hosts + whether a
            secret is configured. The secret itself is write-only.</description>
        <in-parameters>
            <parameter name="systemMessageRemoteId" default-value="TikTokShopApi"/>
        </in-parameters>
        <out-parameters>
            <parameter name="appKey"/>
            <parameter name="sendUrl"/>
            <parameter name="receiveUrl"/>
            <parameter name="configured" type="Boolean"/>
        </out-parameters>
        <actions>
            <entity-find-one entity-name="moqui.service.message.SystemMessageRemote" value-field="remote"/>
            <set field="appKey" from="remote?.username"/>
            <set field="sendUrl" from="remote?.sendUrl"/>
            <set field="receiveUrl" from="remote?.receiveUrl"/>
            <set field="configured" from="remote?.username &amp;&amp; remote?.password ? true : false"/>
        </actions>
    </service>

    <service verb="update" noun="TikTokAppCredentials">
        <description>Set Partner Center app credentials on the shared remote. Host URLs are
            optional overrides (used by the sandbox); existing values are kept when omitted.</description>
        <in-parameters>
            <parameter name="systemMessageRemoteId" default-value="TikTokShopApi"/>
            <parameter name="appKey" required="true"/>
            <parameter name="appSecret" required="true"/>
            <parameter name="sendUrl"/>
            <parameter name="receiveUrl"/>
        </in-parameters>
        <actions>
            <entity-find-one entity-name="moqui.service.message.SystemMessageRemote" value-field="remote"/>
            <service-call name="store#moqui.service.message.SystemMessageRemote" in-map="[
                    systemMessageRemoteId:systemMessageRemoteId,
                    username:appKey, password:appSecret,
                    sendUrl:(sendUrl ?: remote?.sendUrl ?: 'https://open-api.tiktokglobalshop.com'),
                    receiveUrl:(receiveUrl ?: remote?.receiveUrl ?: 'https://auth.tiktok-shops.com'),
                    description:(remote?.description ?: 'TikTok Shop Open API app credentials and hosts')]"/>
        </actions>
    </service>

</services>
```

- [ ] **Step 3: Add the REST resources**

In `service/tiktok.rest.xml`, add inside the root `<resource name="tiktok" ...>` element, **after** the closing `</resource>` of the `webhook` resource (line ~17). The webhook resource carries `require-authentication="anonymous-all"` on itself; these new resources do NOT set it, so they default to authenticated — that is intentional, do not add `anonymous-all` to them:

```xml
    <resource name="appCredentials"
            description="Partner Center app credential management for the admin UI. GET never returns the secret.">
        <method type="get">
            <service name="co.hotwax.tiktok.TikTokShopManagementServices.get#TikTokAppCredentials"/>
        </method>
        <method type="put">
            <service name="co.hotwax.tiktok.TikTokShopManagementServices.update#TikTokAppCredentials"/>
        </method>
    </resource>

    <resource name="authorize"
            description="Exchange a Partner Center auth_code (30-min TTL, single use) for tokens and import authorized shops.">
        <method type="post">
            <service name="co.hotwax.tiktok.TikTokApiServices.exchange#TikTokAuthCode"/>
        </method>
    </resource>
```

(`exchange#TikTokAuthCode` already exists in `TikTokApiServices.xml` with in-parameter `authCode` — the PWA posts `{"authCode": "..."}`.)

- [ ] **Step 4: Restart Moqui and verify with curl**

Restart the instance (`Ctrl-C` the gradle run, then `./gradlew run` again), then:

```bash
curl -s -u "john.doe:moqui" http://localhost:8080/rest/s1/tiktok/appCredentials
```
Expected (empty seed creds): `{"appKey":"","sendUrl":"https://open-api.tiktokglobalshop.com","receiveUrl":"https://auth.tiktok-shops.com","configured":false}`

```bash
curl -s -u "john.doe:moqui" -X PUT -H "Content-Type: application/json" \
  -d '{"appKey":"test_key","appSecret":"test_secret"}' \
  http://localhost:8080/rest/s1/tiktok/appCredentials
curl -s -u "john.doe:moqui" http://localhost:8080/rest/s1/tiktok/appCredentials
```
Expected after PUT: `"appKey":"test_key"` and `"configured":true`; the response must contain **no** `password`/`appSecret` field.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/rest/s1/tiktok/appCredentials
```
Expected: `401` (unauthenticated requests rejected).

- [ ] **Step 5: Commit**

```bash
cd /Users/anilpatel/maarg-sd/asbeauty/runtime/component/tiktok
git add service/co/hotwax/tiktok/TikTokShopManagementServices.xml service/tiktok.rest.xml
git commit -m "feat: management API — app credentials (secret write-only) + authorize REST"
```

---

### Task 2: Shop list/get/update services + REST

**Files:**
- Modify: `/Users/anilpatel/maarg-sd/asbeauty/runtime/component/tiktok/service/co/hotwax/tiktok/TikTokShopManagementServices.xml`
- Modify: `/Users/anilpatel/maarg-sd/asbeauty/runtime/component/tiktok/service/tiktok.rest.xml`

- [ ] **Step 1: Add the three shop services**

Append inside `<services>` in `TikTokShopManagementServices.xml` (after `update#TikTokAppCredentials`):

```xml
    <service verb="get" noun="TikTokShops">
        <description>All shops for the connections list, enriched with the ProductStore name.
            Token values excluded; expiry dates included so the UI can show token health.</description>
        <out-parameters>
            <parameter name="shops" type="List"/>
        </out-parameters>
        <actions>
            <entity-find entity-name="co.hotwax.tiktok.TikTokShop" list="shopList">
                <order-by field-name="shopName"/>
            </entity-find>
            <set field="shops" from="[]"/>
            <iterate list="shopList" entry="tikTokShop">
                <set field="shopMap" from="new HashMap(tikTokShop)"/>
                <script>shopMap.remove('accessToken'); shopMap.remove('refreshToken')</script>
                <if condition="tikTokShop.productStoreId">
                    <entity-find-one entity-name="org.apache.ofbiz.product.store.ProductStore" value-field="productStore" cache="true">
                        <field-map field-name="productStoreId" from="tikTokShop.productStoreId"/>
                    </entity-find-one>
                    <set field="shopMap.productStoreName" from="productStore?.storeName"/>
                </if>
                <script>shops.add(shopMap)</script>
            </iterate>
        </actions>
    </service>

    <service verb="get" noun="TikTokShop">
        <description>One shop's full settings, tokens excluded.</description>
        <in-parameters>
            <parameter name="shopId" required="true"/>
        </in-parameters>
        <out-parameters>
            <parameter name="shop" type="Map"/>
        </out-parameters>
        <actions>
            <entity-find-one entity-name="co.hotwax.tiktok.TikTokShop" value-field="tikTokShop"/>
            <if condition="!tikTokShop">
                <return error="true" message="TikTokShop [${shopId}] not found."/>
            </if>
            <set field="shop" from="new HashMap(tikTokShop)"/>
            <script>shop.remove('accessToken'); shop.remove('refreshToken')</script>
            <if condition="tikTokShop.productStoreId">
                <entity-find-one entity-name="org.apache.ofbiz.product.store.ProductStore" value-field="productStore" cache="true">
                    <field-map field-name="productStoreId" from="tikTokShop.productStoreId"/>
                </entity-find-one>
                <set field="shop.productStoreName" from="productStore?.storeName"/>
            </if>
        </actions>
    </service>

    <service verb="update" noun="TikTokShop">
        <description>Update the admin-editable settings only. Identity/cipher/token fields are
            not in-parameters, so they cannot be changed through this endpoint.</description>
        <in-parameters>
            <parameter name="shopId" required="true"/>
            <parameter name="shopName"/>
            <parameter name="productStoreId"/>
            <parameter name="holdMinutes" type="Integer"/>
            <parameter name="autoApproveBuyerCancel"/>
            <parameter name="facilityGroupId"/>
            <parameter name="tiktokWarehouseId"/>
            <parameter name="sellerCancelReason"/>
            <parameter name="shopStatusId"/>
        </in-parameters>
        <actions>
            <entity-find-one entity-name="co.hotwax.tiktok.TikTokShop" value-field="tikTokShop"/>
            <if condition="!tikTokShop">
                <return error="true" message="TikTokShop [${shopId}] not found."/>
            </if>
            <if condition="holdMinutes != null &amp;&amp; holdMinutes &lt; 0">
                <return error="true" message="holdMinutes must be 0 or greater."/>
            </if>
            <if condition="autoApproveBuyerCancel &amp;&amp; !(autoApproveBuyerCancel in ['Y','N'])">
                <return error="true" message="autoApproveBuyerCancel must be Y or N."/>
            </if>
            <if condition="shopStatusId &amp;&amp; !(shopStatusId in ['TTSHOP_ACTIVE','TTSHOP_DISABLED'])">
                <return error="true" message="shopStatusId must be TTSHOP_ACTIVE or TTSHOP_DISABLED."/>
            </if>
            <if condition="productStoreId">
                <entity-find-one entity-name="org.apache.ofbiz.product.store.ProductStore" value-field="productStore"/>
                <if condition="!productStore">
                    <return error="true" message="ProductStore [${productStoreId}] not found."/>
                </if>
            </if>
            <service-call name="update#co.hotwax.tiktok.TikTokShop" in-map="context"/>
        </actions>
    </service>
```

- [ ] **Step 2: Add the REST resource**

In `service/tiktok.rest.xml`, after the `authorize` resource:

```xml
    <resource name="shops" description="TikTok shop connections: list, read, update settings.">
        <method type="get">
            <service name="co.hotwax.tiktok.TikTokShopManagementServices.get#TikTokShops"/>
        </method>
        <id name="shopId">
            <method type="get">
                <service name="co.hotwax.tiktok.TikTokShopManagementServices.get#TikTokShop"/>
            </method>
            <method type="put">
                <service name="co.hotwax.tiktok.TikTokShopManagementServices.update#TikTokShop"/>
            </method>
        </id>
    </resource>
```

- [ ] **Step 3: Restart Moqui and verify**

Seed one demo shop if none exists (sandbox config data provides one when loaded; otherwise create directly):

```bash
curl -s -u "john.doe:moqui" http://localhost:8080/rest/s1/tiktok/shops
```
Expected: `{"shops":[...]}` — each entry has `shopId`, `shopName`, `shopStatusId`, `productStoreId`, `productStoreName`, `holdMinutes`, `accessTokenExpireDate`, and **no** `accessToken`/`refreshToken` keys. If the instance has no `TikTokShop` rows, expected `{"shops":[]}`.

With a shop row present (use its real id in place of `7000000001`):

```bash
curl -s -u "john.doe:moqui" -X PUT -H "Content-Type: application/json" \
  -d '{"holdMinutes":45,"autoApproveBuyerCancel":"N"}' \
  http://localhost:8080/rest/s1/tiktok/shops/7000000001
curl -s -u "john.doe:moqui" http://localhost:8080/rest/s1/tiktok/shops/7000000001
```
Expected: second response shows `"holdMinutes":45` and `"autoApproveBuyerCancel":"N"`.

```bash
curl -s -u "john.doe:moqui" -X PUT -H "Content-Type: application/json" \
  -d '{"holdMinutes":-5}' http://localhost:8080/rest/s1/tiktok/shops/7000000001
```
Expected: HTTP 400 with message containing `holdMinutes must be 0 or greater`.

- [ ] **Step 4: Commit**

```bash
git add service/co/hotwax/tiktok/TikTokShopManagementServices.xml service/tiktok.rest.xml
git commit -m "feat: management API — shop list/get/update with token redaction + field whitelist"
```

---

### Task 3: Mapping services + REST

**Files:**
- Modify: `/Users/anilpatel/maarg-sd/asbeauty/runtime/component/tiktok/service/co/hotwax/tiktok/TikTokShopManagementServices.xml`
- Modify: `/Users/anilpatel/maarg-sd/asbeauty/runtime/component/tiktok/service/tiktok.rest.xml`

- [ ] **Step 1: Add the three mapping services**

Append inside `<services>`:

```xml
    <service verb="get" noun="TikTokShopMappings">
        <in-parameters>
            <parameter name="shopId" required="true"/>
            <parameter name="mappedTypeId"/>
        </in-parameters>
        <out-parameters>
            <parameter name="mappings" type="List"/>
        </out-parameters>
        <actions>
            <entity-find entity-name="co.hotwax.tiktok.TikTokShopMapping" list="mappings">
                <econdition field-name="shopId"/>
                <econdition field-name="mappedTypeId" ignore-if-empty="true"/>
                <order-by field-name="mappedTypeId,mappedKey"/>
            </entity-find>
        </actions>
    </service>

    <service verb="store" noun="TikTokShopMapping">
        <in-parameters>
            <parameter name="shopId" required="true"/>
            <parameter name="mappedTypeId" required="true"/>
            <parameter name="mappedKey" required="true"/>
            <parameter name="mappedValue" required="true"/>
        </in-parameters>
        <actions>
            <if condition="!(mappedTypeId in ['TIKTOK_SHIP_PROVIDER','TIKTOK_SHIP_METHOD'])">
                <return error="true" message="mappedTypeId must be TIKTOK_SHIP_PROVIDER or TIKTOK_SHIP_METHOD."/>
            </if>
            <service-call name="store#co.hotwax.tiktok.TikTokShopMapping" in-map="context"/>
        </actions>
    </service>

    <service verb="delete" noun="TikTokShopMapping">
        <in-parameters>
            <parameter name="shopId" required="true"/>
            <parameter name="mappedTypeId" required="true"/>
            <parameter name="mappedKey" required="true"/>
        </in-parameters>
        <actions>
            <entity-delete-by-condition entity-name="co.hotwax.tiktok.TikTokShopMapping">
                <econdition field-name="shopId"/>
                <econdition field-name="mappedTypeId"/>
                <econdition field-name="mappedKey"/>
            </entity-delete-by-condition>
        </actions>
    </service>
```

- [ ] **Step 2: Add the nested REST resource**

In `tiktok.rest.xml`, inside `<id name="shopId">` (after the `put` method):

```xml
            <resource name="mappings" description="Per-shop key/value mappings (TIKTOK_SHIP_PROVIDER, TIKTOK_SHIP_METHOD).">
                <method type="get">
                    <service name="co.hotwax.tiktok.TikTokShopManagementServices.get#TikTokShopMappings"/>
                </method>
                <method type="post">
                    <service name="co.hotwax.tiktok.TikTokShopManagementServices.store#TikTokShopMapping"/>
                </method>
                <method type="delete">
                    <service name="co.hotwax.tiktok.TikTokShopManagementServices.delete#TikTokShopMapping"/>
                </method>
            </resource>
```

- [ ] **Step 3: Restart and verify (use a real shopId)**

```bash
curl -s -u "john.doe:moqui" -X POST -H "Content-Type: application/json" \
  -d '{"mappedTypeId":"TIKTOK_SHIP_PROVIDER","mappedKey":"_DEFAULT_","mappedValue":"7117858858472491822"}' \
  http://localhost:8080/rest/s1/tiktok/shops/7000000001/mappings
curl -s -u "john.doe:moqui" "http://localhost:8080/rest/s1/tiktok/shops/7000000001/mappings?mappedTypeId=TIKTOK_SHIP_PROVIDER"
```
Expected: `{"mappings":[{"shopId":...,"mappedTypeId":"TIKTOK_SHIP_PROVIDER","mappedKey":"_DEFAULT_","mappedValue":"7117858858472491822"}]}`

```bash
curl -s -u "john.doe:moqui" -X DELETE \
  "http://localhost:8080/rest/s1/tiktok/shops/7000000001/mappings?mappedTypeId=TIKTOK_SHIP_PROVIDER&mappedKey=_DEFAULT_"
curl -s -u "john.doe:moqui" "http://localhost:8080/rest/s1/tiktok/shops/7000000001/mappings"
```
Expected: `{"mappings":[]}`

Invalid type check:
```bash
curl -s -u "john.doe:moqui" -X POST -H "Content-Type: application/json" \
  -d '{"mappedTypeId":"BOGUS","mappedKey":"x","mappedValue":"y"}' \
  http://localhost:8080/rest/s1/tiktok/shops/7000000001/mappings
```
Expected: HTTP 400, message contains `mappedTypeId must be`.

- [ ] **Step 4: Commit**

```bash
git add service/co/hotwax/tiktok/TikTokShopManagementServices.xml service/tiktok.rest.xml
git commit -m "feat: management API — per-shop mapping CRUD with type whitelist"
```

---

### Task 4: Backend audit

- [ ] **Step 1: Run the moqui-verification audit** (Claude: invoke the `moqui-coding-assistant:moqui-verification` skill) over the changed files: XML contract checks, naming, public-exposure risk. The expected findings profile: zero new public exposures (all new resources authenticated), descriptions present on services/resources.

- [ ] **Step 2: Fix anything it flags, re-verify with the Task 1–3 curl checks, and commit**

```bash
git add -A
git commit -m "chore: address verification audit findings on management API"
```
(Skip the commit if the audit found nothing.)

---

## Part B — Company PWA

All paths below relative to `/Users/anilpatel/pwa-sd/company`. Branch `feat/tiktok-config-ui`. After each task run the type check; it must stay at **0 errors** (the only allowed diagnostic is the pre-existing `TS5101` baseUrl deprecation):

```bash
npx vue-tsc --noEmit -p tsconfig.json
```

### Task 5: Pinia store `src/store/tiktok.ts` + logout wiring

**Files:**
- Create: `src/store/tiktok.ts`
- Modify: `src/store/user.ts` (postLogout)

- [ ] **Step 1: Create `src/store/tiktok.ts`**

```typescript
import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'

export const useTikTokStore = defineStore('tiktok', {
  state: () => ({
    appCredentials: { appKey: '', sendUrl: '', receiveUrl: '', configured: false } as any,
    shops: [] as any[],
    current: null as any,
    shopMappings: {} as any, // keyed `${shopId}_${mappedTypeId}` -> mapping rows
    fetchStatus: {
      shops: 'none',
      lastFetched: 0
    }
  }),

  getters: {
    getShops: (state) => state.shops,
    getCurrentShop: (state) => state.current,
    getShopById: (state) => (id: string) => state.shops.find((s: any) => String(s.shopId) === String(id)),
    isAppConfigured: (state) => !!state.appCredentials.configured,
    getShopMappings: (state) => (shopId: string, mappedTypeId: string) =>
      state.shopMappings[`${shopId}_${mappedTypeId}`] ?? [],
    getFetchStatus: (state) => state.fetchStatus,
    // ok | expiring (<7d) | expired | unknown — from accessTokenExpireDate
    getTokenHealth: () => (shop: any): string => {
      const value = shop?.accessTokenExpireDate
      if (!value) return 'unknown'
      const expiry = typeof value === 'number' ? value : new Date(value).getTime()
      if (isNaN(expiry)) return 'unknown'
      const now = Date.now()
      if (expiry < now) return 'expired'
      if (expiry < now + 7 * 24 * 60 * 60 * 1000) return 'expiring'
      return 'ok'
    }
  },

  actions: {
    async fetchAppCredentials() {
      try {
        const resp = await api({ url: "tiktok/appCredentials", method: "get" })
        if (!commonUtil.hasError(resp) && resp.data) {
          this.appCredentials = resp.data
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
      }
    },

    async updateAppCredentials(payload: { appKey: string, appSecret: string }) {
      const resp = await api({ url: "tiktok/appCredentials", method: "put", data: payload })
      if (commonUtil.hasError(resp)) throw resp.data
      await this.fetchAppCredentials()
      return resp.data
    },

    async authorizeTikTok(authCode: string) {
      const resp = await api({ url: "tiktok/authorize", method: "post", data: { authCode } })
      if (commonUtil.hasError(resp)) throw resp.data
      await this.fetchTikTokShops()
      return resp.data // { shopIds: [...] }
    },

    async fetchTikTokShops() {
      this.fetchStatus = { ...this.fetchStatus, shops: 'pending' }
      let shops: any[] = []
      try {
        const resp = await api({ url: "tiktok/shops", method: "get" })
        if (!commonUtil.hasError(resp) && resp.data) {
          shops = resp.data.shops ?? []
          this.fetchStatus = { shops: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, shops: 'error' }
      }
      this.shops = shops
    },

    async fetchTikTokShop(shopId: string) {
      const resp = await api({ url: `tiktok/shops/${shopId}`, method: "get" })
      if (commonUtil.hasError(resp)) throw resp.data
      this.current = resp.data.shop ?? resp.data
      return this.current
    },

    async updateTikTokShop(payload: any) {
      const resp = await api({ url: `tiktok/shops/${payload.shopId}`, method: "put", data: payload })
      if (commonUtil.hasError(resp)) throw resp.data
      await this.fetchTikTokShop(payload.shopId)
      await this.fetchTikTokShops()
      return resp.data
    },

    async fetchTikTokShopMappings(shopId: string, mappedTypeId: string) {
      try {
        const resp = await api({ url: `tiktok/shops/${shopId}/mappings`, method: "get", params: { mappedTypeId } })
        if (!commonUtil.hasError(resp) && resp.data) {
          this.shopMappings = { ...this.shopMappings, [`${shopId}_${mappedTypeId}`]: resp.data.mappings ?? [] }
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
      }
    },

    async createTikTokShopMapping(payload: { shopId: string, mappedTypeId: string, mappedKey: string, mappedValue: string }) {
      const resp = await api({ url: `tiktok/shops/${payload.shopId}/mappings`, method: "post", data: payload })
      if (commonUtil.hasError(resp)) throw resp.data
      await this.fetchTikTokShopMappings(payload.shopId, payload.mappedTypeId)
      return resp.data
    },

    async deleteTikTokShopMapping(payload: { shopId: string, mappedTypeId: string, mappedKey: string }) {
      // params (not body): Moqui REST DELETE reads query parameters reliably
      const resp = await api({ url: `tiktok/shops/${payload.shopId}/mappings`, method: "delete", params: { mappedTypeId: payload.mappedTypeId, mappedKey: payload.mappedKey } })
      if (commonUtil.hasError(resp)) throw resp.data
      await this.fetchTikTokShopMappings(payload.shopId, payload.mappedTypeId)
      return resp.data
    },

    updateCurrentShop(shop: any) {
      this.current = shop
    },

    clearTikTokState() {
      this.$reset()
    }
  },

  persist: true
})
```

- [ ] **Step 2: Wire `clearTikTokState` into logout**

In `src/store/user.ts`, the `postLogout` action currently reads:

```typescript
    async postLogout() {
      this.$reset()
      useAuth().clearAuth()

      // Reset all other persisted stores so no data leaks across sessions
      const { useProductStore } = await import('./productStore')
      const { useUtilStore } = await import('./util')
      const { useNetSuiteStore } = await import('./netSuite')
      const { useShopifyStore } = await import('./shopify')
      const { useKlaviyoStore } = await import('./klaviyo')

      useProductStore().clearProductStoreState()
      useUtilStore().clearUtilState()
      useNetSuiteStore().clearNetSuiteState()
      useShopifyStore().clearShopifyState()
      useKlaviyoStore().clear()
    }
```

Add the tiktok import and clear call so it becomes:

```typescript
    async postLogout() {
      this.$reset()
      useAuth().clearAuth()

      // Reset all other persisted stores so no data leaks across sessions
      const { useProductStore } = await import('./productStore')
      const { useUtilStore } = await import('./util')
      const { useNetSuiteStore } = await import('./netSuite')
      const { useShopifyStore } = await import('./shopify')
      const { useKlaviyoStore } = await import('./klaviyo')
      const { useTikTokStore } = await import('./tiktok')

      useProductStore().clearProductStoreState()
      useUtilStore().clearUtilState()
      useNetSuiteStore().clearNetSuiteState()
      useShopifyStore().clearShopifyState()
      useKlaviyoStore().clear()
      useTikTokStore().clearTikTokState()
    }
```

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.json` — Expected: no errors (TS5101 only).

- [ ] **Step 4: Commit**

```bash
git add src/store/tiktok.ts src/store/user.ts
git commit -m "feat: TikTok Pinia store (management API client) + logout state clearing"
```

---

### Task 6: Routes + menu entry

**Files:**
- Modify: `src/router/index.ts`
- Modify: `src/components/Menu.vue`

- [ ] **Step 1: Add routes**

In `src/router/index.ts`, after the last Shopify route (`/shopify-connection-details/:id/instance-details`, line ~41), add:

```typescript
  { path: '/tiktok', name: 'TikTokConnections', component: () => import('@/views/TikTokConnections.vue'), beforeEnter: authGuard },
  { path: '/tiktok-connection-details/:id', name: 'TikTokConnectionDetails', component: () => import('@/views/TikTokConnectionDetails.vue'), props: true, beforeEnter: authGuard },
  { path: '/tiktok-connection-details/:id/settings', name: 'TikTokShopSettings', component: () => import('@/views/TikTokShopSettings.vue'), props: true, beforeEnter: authGuard },
  { path: '/tiktok-connection-details/:id/shipping-providers', name: 'TikTokShippingProviders', component: () => import('@/views/TikTokShippingProviders.vue'), props: true, beforeEnter: authGuard },
```

- [ ] **Step 2: Add the menu entry**

In `src/components/Menu.vue`: add `logoTiktok` to the existing ionicons import (line ~36), and in the `appPages` array insert after the Shopify entry (line ~56):

```typescript
  {
    title: "TikTok",
    url: "/tiktok",
    childRoutes: ["/tiktok-connection-details"],
    iosIcon: logoTiktok,
    mdIcon: logoTiktok,
  },
```

- [ ] **Step 3: Type-check** — this will FAIL with "Cannot find module '@/views/TikTokConnections.vue'" etc. That is expected; the views land in Tasks 8–11. To keep the branch green, create four placeholder views now (each will be fully replaced):

For EACH of `src/views/TikTokConnections.vue`, `src/views/TikTokConnectionDetails.vue`, `src/views/TikTokShopSettings.vue`, `src/views/TikTokShippingProviders.vue` create:

```vue
<template>
  <ion-page>
    <ion-content />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonPage } from "@ionic/vue";
</script>
```

Run: `npx vue-tsc --noEmit -p tsconfig.json` — Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/router/index.ts src/components/Menu.vue src/views/TikTok*.vue
git commit -m "feat: TikTok routes, menu entry, view scaffolds"
```

---

### Task 7: Modals — app credentials + authorize

**Files:**
- Create: `src/components/TikTokAppCredentialsModal.vue`
- Create: `src/components/AuthorizeTikTokModal.vue`

- [ ] **Step 1: Create `src/components/TikTokAppCredentialsModal.vue`**

```vue
<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("TikTok app credentials") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translate("Credentials of the TikTok Partner Center app. The secret is write-only: it is stored encrypted and never displayed again.") }}</p>
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-input v-model="appKey" :label="translate('App key')" label-placement="floating" />
      </ion-item>
      <ion-item>
        <ion-input v-model="appSecret" type="password" :label="translate('App secret')" label-placement="floating"
          :placeholder="appCredentials.configured ? '••••••••' : ''" />
      </ion-item>
    </ion-list>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :disabled="!appKey.trim() || !appSecret.trim() || isSaving" @click="save()">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import { translate, commonUtil } from '@common';
import { useTikTokStore } from '@/store/tiktok';

const tiktokStore = useTikTokStore();
const appCredentials = computed(() => tiktokStore.appCredentials)
const appKey = ref(appCredentials.value.appKey || "")
const appSecret = ref("")
const isSaving = ref(false)

function closeModal(saved = false) {
  modalController.dismiss({ saved })
}

async function save() {
  isSaving.value = true
  try {
    await tiktokStore.updateAppCredentials({ appKey: appKey.value.trim(), appSecret: appSecret.value.trim() })
    commonUtil.showToast(translate("TikTok app credentials saved"))
    closeModal(true)
  } catch (error) {
    commonUtil.showToast(translate("Failed to save TikTok app credentials"))
  } finally {
    isSaving.value = false
  }
}
</script>
```

- [ ] **Step 2: Create `src/components/AuthorizeTikTokModal.vue`**

```vue
<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Authorize TikTok shops") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translate("Authorize the seller in TikTok Partner Center, then paste the auth_code from the redirect URL here. Auth codes expire in 30 minutes and can only be used once.") }}</p>
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-input v-model="authCode" :label="translate('Auth code')" label-placement="floating" />
      </ion-item>
    </ion-list>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :disabled="!authCode.trim() || isAuthorizing" @click="authorize()">
        <ion-icon :icon="checkmarkDoneOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { checkmarkDoneOutline, closeOutline } from "ionicons/icons";
import { ref } from "vue";
import { translate, commonUtil } from '@common';
import { useTikTokStore } from '@/store/tiktok';

const tiktokStore = useTikTokStore();
const authCode = ref("")
const isAuthorizing = ref(false)

function closeModal() {
  modalController.dismiss({})
}

async function authorize() {
  isAuthorizing.value = true
  try {
    const data = await tiktokStore.authorizeTikTok(authCode.value.trim())
    const count = data?.shopIds?.length ?? 0
    commonUtil.showToast(translate("Imported {count} TikTok shops", { count }))
    modalController.dismiss({ shopIds: data?.shopIds ?? [] })
  } catch (error) {
    commonUtil.showToast(translate("Authorization failed. Check that the auth code is fresh — codes expire in 30 minutes and can only be used once."))
  } finally {
    isAuthorizing.value = false
  }
}
</script>
```

- [ ] **Step 3: Type-check** — `npx vue-tsc --noEmit -p tsconfig.json` — Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/TikTokAppCredentialsModal.vue src/components/AuthorizeTikTokModal.vue
git commit -m "feat: TikTok app-credentials and authorize modals"
```

---

### Task 8: Connections list — `TikTokConnections.vue`

**Files:**
- Modify (replace scaffold): `src/views/TikTokConnections.vue`

- [ ] **Step 1: Replace the scaffold with the full view**

```vue
<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("TikTok connections") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openAppCredentialsModal()">
            <ion-icon slot="icon-only" :icon="keyOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-item lines="full">
        <ion-icon slot="start" :icon="tiktokStore.isAppConfigured ? checkmarkCircleOutline : alertCircleOutline"
          :color="tiktokStore.isAppConfigured ? 'success' : 'warning'" />
        <ion-label>
          {{ tiktokStore.isAppConfigured ? translate("App configured") : translate("App not configured") }}
          <p v-if="!tiktokStore.isAppConfigured">{{ translate("Set app credentials before authorizing shops") }}</p>
        </ion-label>
      </ion-item>

      <main>
        <div class="list-item" v-for="shop in shops" :key="shop.shopId" @click="openConnectionDetails(shop)">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="storefrontOutline" />
            <ion-label class="ion-text-wrap">
              <p class="overline">{{ shop.shopId }}</p>
              {{ shop.shopName || shop.shopId }}
              <p>{{ shop.region }}</p>
            </ion-label>
          </ion-item>

          <div class="tablet">
            <ion-label class="ion-text-center">
              {{ shop.productStoreName || shop.productStoreId || "-" }}
              <p>{{ translate("Product store") }}</p>
            </ion-label>
          </div>

          <div class="tablet">
            <ion-badge :color="shop.shopStatusId === 'TTSHOP_ACTIVE' ? 'success' : 'medium'">
              {{ shop.shopStatusId === 'TTSHOP_ACTIVE' ? translate("Active") : translate("Disabled") }}
            </ion-badge>
          </div>

          <div class="tablet">
            <ion-badge :color="tokenHealthColor(shop)">{{ tokenHealthLabel(shop) }}</ion-badge>
          </div>
        </div>
      </main>
    </ion-content>

    <ion-fab slot="fixed" vertical="bottom" horizontal="end">
      <ion-fab-button :disabled="!tiktokStore.isAppConfigured" @click="openAuthorizeModal()">
        <ion-icon :icon="addOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBadge, IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPage, IonTitle, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, alertCircleOutline, checkmarkCircleOutline, keyOutline, storefrontOutline } from "ionicons/icons";
import { translate } from '@common';
import router from "@/router";
import { computed } from "vue";
import { useTikTokStore } from '@/store/tiktok';

import TikTokAppCredentialsModal from "@/components/TikTokAppCredentialsModal.vue";
import AuthorizeTikTokModal from "@/components/AuthorizeTikTokModal.vue";

const tiktokStore = useTikTokStore();
const shops = computed(() => tiktokStore.shops)

onIonViewWillEnter(async () => {
  await Promise.all([tiktokStore.fetchAppCredentials(), tiktokStore.fetchTikTokShops()])
})

function tokenHealthLabel(shop: any) {
  const health = tiktokStore.getTokenHealth(shop)
  if (health === 'expired') return translate("Token expired")
  if (health === 'expiring') return translate("Token expiring soon")
  if (health === 'ok') return translate("Token OK")
  return translate("Token unknown")
}

function tokenHealthColor(shop: any) {
  const health = tiktokStore.getTokenHealth(shop)
  if (health === 'expired') return 'danger'
  if (health === 'expiring') return 'warning'
  if (health === 'ok') return 'success'
  return 'medium'
}

function openConnectionDetails(shop: any) {
  tiktokStore.updateCurrentShop(shop)
  router.push({ path: `/tiktok-connection-details/${shop.shopId}` })
}

async function openAppCredentialsModal() {
  const modal = await modalController.create({ component: TikTokAppCredentialsModal })
  await modal.present()
  await modal.onWillDismiss()
}

async function openAuthorizeModal() {
  const modal = await modalController.create({ component: AuthorizeTikTokModal })
  await modal.present()
  const { data } = await modal.onWillDismiss()
  if (data?.shopIds?.length) {
    await tiktokStore.fetchTikTokShops()
  }
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
  border-bottom: var(--border-medium);
}

.list-item > ion-item {
  width: 100%;
}
</style>
```

- [ ] **Step 2: Type-check + build**

Run: `npx vue-tsc --noEmit -p tsconfig.json && pnpm build` — Expected: 0 type errors, `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add src/views/TikTokConnections.vue
git commit -m "feat: TikTok connections list with app-setup and authorize entry points"
```

---

### Task 9: Detail hub — `TikTokConnectionDetails.vue`

**Files:**
- Modify (replace scaffold): `src/views/TikTokConnectionDetails.vue`

- [ ] **Step 1: Replace the scaffold**

```vue
<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/tiktok" />
        <ion-title>{{ shop?.shopName || translate("TikTok connection") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-subtitle>{{ shop?.shopId }}</ion-card-subtitle>
          <ion-card-title>{{ shop?.shopName || shop?.shopId }}</ion-card-title>
        </ion-card-header>
        <ion-list lines="full">
          <ion-item>
            <ion-label>{{ translate("Region") }}</ion-label>
            <ion-label slot="end">{{ shop?.region || "-" }}</ion-label>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Status") }}</ion-label>
            <ion-badge slot="end" :color="shop?.shopStatusId === 'TTSHOP_ACTIVE' ? 'success' : 'medium'">
              {{ shop?.shopStatusId === 'TTSHOP_ACTIVE' ? translate("Active") : translate("Disabled") }}
            </ion-badge>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Token health") }}</ion-label>
            <ion-badge slot="end" :color="tokenHealthColor()">{{ tokenHealthLabel() }}</ion-badge>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Product store") }}</ion-label>
            <ion-label slot="end">{{ shop?.productStoreName || shop?.productStoreId || "-" }}</ion-label>
          </ion-item>
        </ion-list>
      </ion-card>

      <ion-item v-if="shop && !shop.productStoreId" lines="none" color="warning">
        <ion-icon slot="start" :icon="alertCircleOutline" />
        <ion-label class="ion-text-wrap">
          {{ translate("No product store linked. Orders cannot import until one is set.") }}
        </ion-label>
      </ion-item>

      <ion-list lines="full">
        <ion-item button detail @click="goTo('settings')">
          <ion-icon slot="start" :icon="settingsOutline" />
          <ion-label>{{ translate("Settings") }}</ion-label>
        </ion-item>
        <ion-item button detail @click="goTo('shipping-providers')">
          <ion-icon slot="start" :icon="airplaneOutline" />
          <ion-label>{{ translate("Shipping providers") }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonBadge, IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { airplaneOutline, alertCircleOutline, settingsOutline } from "ionicons/icons";
import { translate } from '@common';
import router from "@/router";
import { computed } from "vue";
import { useTikTokStore } from '@/store/tiktok';

const props = defineProps<{ id: string }>()
const tiktokStore = useTikTokStore();
const shop = computed(() => tiktokStore.current)

onIonViewWillEnter(async () => {
  await tiktokStore.fetchTikTokShop(props.id)
})

function tokenHealthLabel() {
  const health = tiktokStore.getTokenHealth(shop.value)
  if (health === 'expired') return translate("Token expired")
  if (health === 'expiring') return translate("Token expiring soon")
  if (health === 'ok') return translate("Token OK")
  return translate("Token unknown")
}

function tokenHealthColor() {
  const health = tiktokStore.getTokenHealth(shop.value)
  if (health === 'expired') return 'danger'
  if (health === 'expiring') return 'warning'
  if (health === 'ok') return 'success'
  return 'medium'
}

function goTo(section: string) {
  router.push({ path: `/tiktok-connection-details/${props.id}/${section}` })
}
</script>
```

- [ ] **Step 2: Type-check + build** — Expected: 0 type errors, `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add src/views/TikTokConnectionDetails.vue
git commit -m "feat: TikTok connection detail hub with token health and config links"
```

---

### Task 10: Settings screen — `TikTokShopSettings.vue`

**Files:**
- Modify (replace scaffold): `src/views/TikTokShopSettings.vue`

- [ ] **Step 1: Replace the scaffold**

```vue
<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" :default-href="`/tiktok-connection-details/${id}`" />
        <ion-title>{{ translate("TikTok shop settings") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list lines="full">
        <ion-item>
          <ion-select v-model="form.productStoreId" :label="translate('Product store')" interface="popover">
            <ion-select-option v-for="store in productStores" :key="store.productStoreId" :value="store.productStoreId">
              {{ store.storeName || store.productStoreId }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-select v-model="form.facilityGroupId" :label="translate('Facility group')" interface="popover">
            <ion-select-option v-for="group in facilityGroups" :key="group.facilityGroupId" :value="group.facilityGroupId">
              {{ group.facilityGroupName || group.facilityGroupId }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-input v-model.number="form.holdMinutes" type="number" min="0" :label="translate('Hold minutes')" label-placement="floating" />
        </ion-item>
        <ion-item>
          <ion-toggle :checked="form.autoApproveBuyerCancel === 'Y'"
            @ionChange="form.autoApproveBuyerCancel = $event.detail.checked ? 'Y' : 'N'">
            {{ translate("Auto-approve buyer cancellations") }}
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-input v-model="form.tiktokWarehouseId" :label="translate('TikTok warehouse ID')" label-placement="floating" />
        </ion-item>
        <ion-item>
          <ion-input v-model="form.sellerCancelReason" :label="translate('Seller cancel reason')" label-placement="floating" />
        </ion-item>
        <ion-item>
          <ion-toggle :checked="form.shopStatusId === 'TTSHOP_ACTIVE'"
            @ionChange="form.shopStatusId = $event.detail.checked ? 'TTSHOP_ACTIVE' : 'TTSHOP_DISABLED'">
            {{ translate("Active") }}
          </ion-toggle>
        </ion-item>
      </ion-list>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button :disabled="isSaving || !isValid" @click="save()">
          <ion-icon :icon="saveOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonList, IonPage, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { saveOutline } from "ionicons/icons";
import { translate, commonUtil } from '@common';
import { computed, reactive, ref } from "vue";
import { useTikTokStore } from '@/store/tiktok';
import { useProductStore } from '@/store/productStore';
import { useUtilStore } from '@/store/util';

const props = defineProps<{ id: string }>()
const tiktokStore = useTikTokStore();
const productStoreStore = useProductStore();
const utilStore = useUtilStore();

const productStores = computed(() => productStoreStore.productStores)
const facilityGroups = computed(() => utilStore.facilityGroups)

const form = reactive({
  productStoreId: '' as string,
  facilityGroupId: '' as string,
  holdMinutes: 60 as number,
  autoApproveBuyerCancel: 'Y' as string,
  tiktokWarehouseId: '' as string,
  sellerCancelReason: '' as string,
  shopStatusId: 'TTSHOP_ACTIVE' as string
})
const isSaving = ref(false)

const isValid = computed(() => Number.isInteger(form.holdMinutes) && form.holdMinutes >= 0)

onIonViewWillEnter(async () => {
  const [shop] = await Promise.all([
    tiktokStore.fetchTikTokShop(props.id),
    productStoreStore.fetchProductStores(),
    utilStore.fetchFacilityGroups()
  ])
  form.productStoreId = shop.productStoreId || ''
  form.facilityGroupId = shop.facilityGroupId || ''
  form.holdMinutes = shop.holdMinutes ?? 60
  form.autoApproveBuyerCancel = shop.autoApproveBuyerCancel || 'Y'
  form.tiktokWarehouseId = shop.tiktokWarehouseId || ''
  form.sellerCancelReason = shop.sellerCancelReason || ''
  form.shopStatusId = shop.shopStatusId || 'TTSHOP_ACTIVE'
})

async function save() {
  isSaving.value = true
  try {
    await tiktokStore.updateTikTokShop({ shopId: props.id, ...form })
    commonUtil.showToast(translate("TikTok shop updated"))
  } catch (error) {
    commonUtil.showToast(translate("Failed to update TikTok shop"))
  } finally {
    isSaving.value = false
  }
}
</script>
```

- [ ] **Step 2: Type-check + build** — Expected: 0 type errors, `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add src/views/TikTokShopSettings.vue
git commit -m "feat: TikTok shop settings screen (store, facility group, hold, toggles)"
```

---

### Task 11: Shipping providers screen — `TikTokShippingProviders.vue`

**Files:**
- Modify (replace scaffold): `src/views/TikTokShippingProviders.vue`

- [ ] **Step 1: Replace the scaffold**

```vue
<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" :default-href="`/tiktok-connection-details/${id}`" />
        <ion-title>{{ translate("Shipping providers") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-item v-if="!hasDefaultMapping" lines="none" color="warning">
        <ion-icon slot="start" :icon="alertCircleOutline" />
        <ion-label class="ion-text-wrap">
          {{ translate("Default provider mapping (_DEFAULT_) is required for fulfillment pushes.") }}
        </ion-label>
      </ion-item>

      <ion-list lines="full">
        <ion-item v-for="mapping in mappings" :key="mapping.mappedKey">
          <ion-label>
            {{ mapping.mappedKey }}
            <p>{{ translate("Carrier") }}</p>
          </ion-label>
          <ion-label slot="end">{{ mapping.mappedValue }}</ion-label>
          <ion-button slot="end" fill="clear" color="danger" @click="removeMapping(mapping)">
            <ion-icon slot="icon-only" :icon="trashOutline" />
          </ion-button>
        </ion-item>
      </ion-list>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ translate("Add mapping") }}</ion-card-title>
        </ion-card-header>
        <ion-list lines="full">
          <ion-item>
            <ion-select v-model="newMappedKey" :label="translate('Carrier')" interface="popover">
              <ion-select-option value="_DEFAULT_">_DEFAULT_</ion-select-option>
              <ion-select-option v-for="carrierPartyId in carrierOptions" :key="carrierPartyId" :value="carrierPartyId">
                {{ carrierPartyId }}
              </ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input v-model="newMappedValue" :label="translate('Shipping provider ID')" label-placement="floating" />
          </ion-item>
        </ion-list>
        <ion-button expand="block" fill="clear" :disabled="!newMappedKey || !newMappedValue.trim() || isSaving" @click="addMapping()">
          {{ translate("Add mapping") }}
        </ion-button>
      </ion-card>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonButton, IonCard, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonPage, IonSelect, IonSelectOption, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { alertCircleOutline, trashOutline } from "ionicons/icons";
import { translate, commonUtil } from '@common';
import { computed, ref } from "vue";
import { useTikTokStore } from '@/store/tiktok';
import { useNetSuiteStore } from '@/store/netSuite';

const props = defineProps<{ id: string }>()
const MAPPED_TYPE_ID = "TIKTOK_SHIP_PROVIDER"

const tiktokStore = useTikTokStore();
const netSuiteStore = useNetSuiteStore();

const mappings = computed(() => tiktokStore.getShopMappings(props.id, MAPPED_TYPE_ID))
const hasDefaultMapping = computed(() => mappings.value.some((m: any) => m.mappedKey === '_DEFAULT_'))
const carrierOptions = computed(() => {
  const carriers = new Set<string>()
  ;(netSuiteStore.productStoreShipmentMethods || []).forEach((sm: any) => {
    if (sm.carrierPartyId) carriers.add(sm.carrierPartyId)
  })
  return Array.from(carriers).sort()
})

const newMappedKey = ref("")
const newMappedValue = ref("")
const isSaving = ref(false)

onIonViewWillEnter(async () => {
  const shop = await tiktokStore.fetchTikTokShop(props.id)
  const fetches: Promise<any>[] = [tiktokStore.fetchTikTokShopMappings(props.id, MAPPED_TYPE_ID)]
  if (shop.productStoreId) {
    fetches.push(netSuiteStore.fetchProductStoreShipmentMethods({ productStoreId: shop.productStoreId }))
  }
  await Promise.all(fetches)
})

async function addMapping() {
  isSaving.value = true
  try {
    await tiktokStore.createTikTokShopMapping({
      shopId: props.id,
      mappedTypeId: MAPPED_TYPE_ID,
      mappedKey: newMappedKey.value,
      mappedValue: newMappedValue.value.trim()
    })
    commonUtil.showToast(translate("Mapping saved"))
    newMappedKey.value = ""
    newMappedValue.value = ""
  } catch (error) {
    commonUtil.showToast(translate("Failed to save mapping"))
  } finally {
    isSaving.value = false
  }
}

async function removeMapping(mapping: any) {
  try {
    await tiktokStore.deleteTikTokShopMapping({
      shopId: props.id,
      mappedTypeId: MAPPED_TYPE_ID,
      mappedKey: mapping.mappedKey
    })
    commonUtil.showToast(translate("Mapping removed"))
  } catch (error) {
    commonUtil.showToast(translate("Failed to remove mapping"))
  }
}
</script>
```

- [ ] **Step 2: Type-check + build** — Expected: 0 type errors, `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add src/views/TikTokShippingProviders.vue
git commit -m "feat: TikTok shipping-provider mappings screen with _DEFAULT_ guard"
```

---

### Task 12: Locale keys, Settings.vue data-freshness entry, final verification

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/views/Settings.vue`

- [ ] **Step 1: Add the locale keys**

In `src/locales/en.json`, add inside the root object (keep alphabetical-ish placement near the end; values equal keys, with the two `{count}` keys preserving the placeholder):

```json
  "TikTok connections": "TikTok connections",
  "TikTok app credentials": "TikTok app credentials",
  "TikTok connection": "TikTok connection",
  "TikTok shop settings": "TikTok shop settings",
  "TikTok shop updated": "TikTok shop updated",
  "TikTok warehouse ID": "TikTok warehouse ID",
  "TikTok Shops": "TikTok Shops",
  "App key": "App key",
  "App secret": "App secret",
  "App configured": "App configured",
  "App not configured": "App not configured",
  "Set app credentials before authorizing shops": "Set app credentials before authorizing shops",
  "Credentials of the TikTok Partner Center app. The secret is write-only: it is stored encrypted and never displayed again.": "Credentials of the TikTok Partner Center app. The secret is write-only: it is stored encrypted and never displayed again.",
  "TikTok app credentials saved": "TikTok app credentials saved",
  "Failed to save TikTok app credentials": "Failed to save TikTok app credentials",
  "Authorize TikTok shops": "Authorize TikTok shops",
  "Auth code": "Auth code",
  "Authorize the seller in TikTok Partner Center, then paste the auth_code from the redirect URL here. Auth codes expire in 30 minutes and can only be used once.": "Authorize the seller in TikTok Partner Center, then paste the auth_code from the redirect URL here. Auth codes expire in 30 minutes and can only be used once.",
  "Imported {count} TikTok shops": "Imported {count} TikTok shops",
  "Authorization failed. Check that the auth code is fresh — codes expire in 30 minutes and can only be used once.": "Authorization failed. Check that the auth code is fresh — codes expire in 30 minutes and can only be used once.",
  "Token expired": "Token expired",
  "Token expiring soon": "Token expiring soon",
  "Token OK": "Token OK",
  "Token unknown": "Token unknown",
  "Token health": "Token health",
  "Region": "Region",
  "No product store linked. Orders cannot import until one is set.": "No product store linked. Orders cannot import until one is set.",
  "Shipping providers": "Shipping providers",
  "Default provider mapping (_DEFAULT_) is required for fulfillment pushes.": "Default provider mapping (_DEFAULT_) is required for fulfillment pushes.",
  "Add mapping": "Add mapping",
  "Carrier": "Carrier",
  "Shipping provider ID": "Shipping provider ID",
  "Mapping saved": "Mapping saved",
  "Failed to save mapping": "Failed to save mapping",
  "Mapping removed": "Mapping removed",
  "Failed to remove mapping": "Failed to remove mapping",
  "Hold minutes": "Hold minutes",
  "Auto-approve buyer cancellations": "Auto-approve buyer cancellations",
  "Facility group": "Facility group",
  "Seller cancel reason": "Seller cancel reason",
  "Failed to update TikTok shop": "Failed to update TikTok shop"
```

(Keys already present in en.json — "Active", "Disabled", "Product store", "Status", "Settings" — must NOT be duplicated; check each with grep before adding.)

- [ ] **Step 2: Add the TikTok entry to Settings.vue data-freshness card**

In `src/views/Settings.vue` `<script setup>`: add the import and instance alongside the other stores:

```typescript
import { useTikTokStore } from '@/store/tiktok';
const tiktokStore = useTikTokStore();
const tiktokFetchStatus = computed(() => tiktokStore.fetchStatus)
```

In the `harmonizedFetchStatus` computed array, after the "Shopify Shops" entry:

```typescript
  {
    label: translate("TikTok Shops"),
    status: tiktokFetchStatus.value.shops,
    count: tiktokStore.shops?.length || 0,
    refresh: () => tiktokStore.fetchTikTokShops()
  },
```

- [ ] **Step 3: Full verification**

```bash
npx vue-tsc --noEmit -p tsconfig.json   # Expected: 0 errors (TS5101 only)
pnpm build                               # Expected: ✓ built
```

- [ ] **Step 4: Manual dogfood (requires Part A deployed on the local OMS)**

1. Start backend: `cd /Users/anilpatel/maarg-sd/asbeauty && ./gradlew run`; optionally `node runtime/component/tiktok/sandbox/server.js` for a fake TikTok.
2. Start PWA: `cd /Users/anilpatel/pwa-sd/company && pnpm dev`; log in.
3. Walk the flow: TikTok menu → App Setup (save creds; Authorize FAB enables) → Authorize (paste a sandbox auth code; shops appear) → open a shop → Settings (set product store, save, toast) → Shipping providers (add `_DEFAULT_` mapping; warning banner clears; delete restores banner).
4. Settings page → Data Fetch Status shows "TikTok Shops" row.
5. Log out → log in: TikTok state cleared (app status refetches; no stale shops flash).

- [ ] **Step 5: Commit**

```bash
git add src/locales/en.json src/views/Settings.vue
git commit -m "feat: TikTok locale keys + data-freshness entry in Settings"
```

---

## Done criteria (maps to spec)

- Spec Part 1 (9 endpoints) → Tasks 1–3. Secret/token redaction verified by curl in Tasks 1–2.
- Spec Part 2 (routes, 4 screens, 2 modals, store with fetchStatus + persist + logout clear) → Tasks 5–11.
- Spec Part 3 flows (app setup gate, authorize, settings, `_DEFAULT_` guard) → Tasks 7, 8, 10, 11 + dogfood in Task 12.
- Spec Part 4 validation → backend in Task 2 (holdMinutes/enums), UI gates in Tasks 8/9/11.
- Spec Part 5 testing → curl per backend task, audit in Task 4, type-check/build per PWA task, dogfood in Task 12.
- Facility-group picker dependency → resolved: existing `utilStore.fetchFacilityGroups()` (`admin/facilityGroups`), used in Task 10.
