/**
 * Routing stress test — does fast SPA navigation degrade the app?
 *
 * Runs three phases against a real logged-in session:
 *
 *   A  baseline   navigate each route, wait for it to settle, record how long it took
 *   B  burst      hammer the router with no settle wait, `--laps` times over every route
 *   C  re-measure repeat phase A verbatim
 *
 * C-minus-A is the whole point. If the app leaks under fast routing — retained Ionic pages,
 * un-torn-down `liveQuery` subscriptions, in-flight fetches from abandoned views — then the same
 * navigation that was fast in A is measurably slower in C, and the growth counters below say why.
 *
 * Navigation goes through the app's own Vue Router (`$router.push`), NOT `page.goto`. A goto is a
 * full reload: it would reset the heap, the DOM and every subscription between samples, which is
 * exactly the state this test is trying to accumulate.
 *
 *   node tests/e2e/routing-stress.mjs                  # default: 3 laps, headless
 *   node tests/e2e/routing-stress.mjs --laps 8 --headed
 *   node tests/e2e/routing-stress.mjs --delay 0        # no pause between pushes at all
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "../..");

/**
 * Playwright is a transitive dep in this pnpm workspace, so it has no top-level `node_modules`
 * entry to import by name. Resolve it out of the pnpm store instead — adding it to package.json
 * just to run a diagnostic would churn the lockfile.
 */
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    for (const root of [resolve(APP_ROOT, "node_modules/.pnpm"), resolve(APP_ROOT, "../../node_modules/.pnpm")]) {
      if (!existsSync(root)) continue;
      const dir = readdirSync(root)
        .filter((d) => d.startsWith("playwright@"))
        .sort()
        .pop();
      if (!dir) continue;
      const entry = resolve(root, dir, "node_modules/playwright/index.js");
      if (existsSync(entry)) return import(pathToFileURL(entry).href);
    }
    throw new Error("playwright not found in node_modules or the pnpm store");
  }
}

// Playwright ships CommonJS, so a store-path import lands the real exports under `default`.
const playwright = await loadPlaywright();
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) throw new Error("could not resolve playwright's chromium export");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const LAPS = Number(flag("laps", 3));
const DELAY = Number(flag("delay", 120));
const BASE = flag("base", "http://localhost:8100");
const HEADED = args.includes("--headed");
const SETTLE_TIMEOUT = 12_000;

/**
 * Credentials come out of the app's own `.env` at runtime and are never logged. The dev server
 * already reads these two keys, so the test authenticates as the same user a developer would.
 */
function devCredentials() {
  const env = readFileSync(resolve(APP_ROOT, ".env"), "utf8");
  // Values in this file are quote-wrapped. Keeping the quotes sends them as part of the credential
  // and the server answers 400, which reads like a wrong password rather than a parsing slip.
  const pick = (key) => env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim()
    ?.replace(/^(['"])(.*)\1$/, "$2");
  const username = pick("VITE_USERNAME");
  const password = pick("VITE_PASSWORD");
  if (!username || !password) throw new Error("VITE_USERNAME / VITE_PASSWORD missing from .env");
  return { username, password };
}

/** Routes with no parameters — always safe to visit. */
const STATIC_ROUTES = [
  "/product-store",
  "/facilities/find",
  "/facilities/groups",
  "/parking",
  "/users",
  "/app-permissions",
  "/security-groups",
  "/shopify",
  "/klaviyo",
  "/netsuite",
  "/netsuite/shipment-methods",
  "/netsuite/inventory-variances",
  "/netsuite/payment-methods",
  "/netsuite/sales-channel",
  "/netsuite/departments",
  "/settings",
  "/create-facility",
  "/create-product-store",
];

/**
 * Parameterised routes, built from ids that actually exist in the cache. Hardcoding ids would make
 * the test silently exercise "not found" branches instead of the real pages.
 */
function parameterisedRoutes(ids) {
  const out = [];
  if (ids.facilityId) out.push(`/facility-details/${ids.facilityId}`);
  if (ids.facilityGroupId) out.push(`/facility-group-detail/${ids.facilityGroupId}`);
  if (ids.productStoreId) out.push(`/product-store-details/${ids.productStoreId}`);
  if (ids.shopId) {
    const s = `/shopify-connection-details/${ids.shopId}`;
    out.push(s, `${s}/locations`, `${s}/shipment-methods`, `${s}/payment-methods`,
      `${s}/sales-channels`, `${s}/product-types`, `${s}/instance-details`);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Node block-buffers stdout when it is a pipe rather than a TTY, so a long run redirected to a
 * file shows nothing at all until it exits. Flush every line so progress is visible live.
 */
const log = (...parts) => {
  process.stdout.write(`${parts.join(" ")}\n`);
  if (typeof process.stdout.flush === "function") process.stdout.flush();
};

async function main() {
  // Prefer whatever browser is already on the machine. Playwright's pinned build is often not
  // downloaded in this workspace, and a 150 MB fetch is a poor prerequisite for a diagnostic.
  const browser = await (async () => {
    // `undefined` (Playwright's own pinned build) goes last, so an explicit --channel or an
    // installed Chrome/Edge is tried first and only the final candidate is allowed to throw.
    const candidates = [flag("channel", null), "chrome", "msedge", undefined].filter((c, i, a) =>
      c !== null && a.indexOf(c) === i);
    for (let i = 0; i < candidates.length; i += 1) {
      try {
        return await chromium.launch({ headless: !HEADED, channel: candidates[i] });
      } catch (e) {
        if (i === candidates.length - 1) throw e;
      }
    }
  })();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");

  // ---- collectors -------------------------------------------------------------------------
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  let requestCount = 0;

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 300)));
  page.on("request", () => { requestCount += 1; });
  page.on("requestfailed", (req) => {
    // Aborted requests are the interesting ones: they are usually a view being torn down
    // mid-flight, which is exactly what fast routing causes.
    failedRequests.push(`${req.method()} ${req.url().slice(0, 110)} :: ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) failedRequests.push(`HTTP ${res.status()} ${res.url().slice(0, 110)}`);
  });

  // ---- login ------------------------------------------------------------------------------
  log("→ logging in…");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const { username, password } = devCredentials();

  /**
   * A fresh browser profile has no `oms` cookie, so the login form opens on its instance-picker
   * step and the credential fields do not exist yet. A developer's browser is already past this,
   * which is why it is easy to miss.
   */
  const omsField = page.locator('input[name="instanceUrl"]');
  if (await omsField.count()) {
    log("   instance step shown — selecting OMS");
    const discovered = page.locator("ion-list ion-item[button]").first();
    if (await discovered.count()) {
      await discovered.click();
    } else {
      await omsField.fill(flag("oms", "http://localhost:8080"));
      await page.getByRole("button", { name: /next/i }).click();
    }
    await page.locator('input[name="username"]').waitFor({ state: "visible", timeout: 30_000 });
  }

  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });

  log("→ waiting for the reference cache to seed…");
  await page.waitForFunction(async () => {
    const dbs = await indexedDB.databases();
    const meta = dbs.find((d) => d.name === "CompanyCacheDB");
    if (!meta) return false;
    const db = await new Promise((res) => {
      const r = indexedDB.open("CompanyCacheDB", meta.version);
      r.onsuccess = () => res(r.result);
    });
    const count = await new Promise((res) => {
      const g = db.transaction("facilities", "readonly").objectStore("facilities").count();
      g.onsuccess = () => res(g.result);
    });
    db.close();
    return count > 0;
  }, null, { timeout: 60_000, polling: 250 });

  // ---- route list -------------------------------------------------------------------------
  /**
   * The reference domains seed independently, so `facilities` having rows says nothing about
   * `shopifyShops`. Poll until every id resolves (or we run out of patience) rather than sampling
   * once — a single early read silently drops all seven parameterised routes from the run.
   */
  const ids = await (async () => {
    const deadline = Date.now() + 45_000;
    let last = {};
    while (Date.now() < deadline) {
      last = await page.evaluate(async () => {
        const dbs = await indexedDB.databases();
        const meta = dbs.find((d) => d.name === "CompanyCacheDB");
        if (!meta) return {};
        const db = await new Promise((res) => {
          const r = indexedDB.open("CompanyCacheDB", meta.version);
          r.onsuccess = () => res(r.result);
        });
        const names = new Set([...db.objectStoreNames]);
        const all = (store) => (names.has(store)
          ? new Promise((res) => {
            const g = db.transaction(store, "readonly").objectStore(store).getAll();
            g.onsuccess = () => res(g.result);
            g.onerror = () => res([]);
          })
          : Promise.resolve([]));
        const [facilities, groups, stores, shops] = await Promise.all(
          [all("facilities"), all("facilityGroups"), all("productStores"), all("shopifyShops")]);
        db.close();
        return {
          facilityId: facilities[0]?.facilityId,
          facilityGroupId: groups[0]?.facilityGroupId,
          productStoreId: stores[0]?.productStoreId,
          shopId: shops[0]?.shopId,
        };
      });
      if (Object.values(last).filter(Boolean).length === 4) break;
      await sleep(1000);
    }
    const missing = Object.entries(last).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) log(`   ⚠ ids never resolved: ${missing.join(", ")} — those routes are skipped`);
    return last;
  })();

  const ROUTES = [...STATIC_ROUTES, ...parameterisedRoutes(ids)];
  log(`→ ${ROUTES.length} routes; ids ${JSON.stringify(ids)}\n`);

  // ---- instrumentation --------------------------------------------------------------------
  /** Push a route through the app's own router and resolve once Vue has flushed. */
  async function push(path) {
    // `evaluate` can land exactly as a previous navigation tears the execution context down, which
    // surfaces as "Execution context was destroyed" and would otherwise be recorded as an app
    // failure. Retry once, and guard the lookup — the app root is briefly absent mid-transition.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await page.evaluate((p) => {
          const router = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
          if (!router) return "router unavailable";
          return router.push(p).catch((e) => String(e));
        }, path);
      } catch (e) {
        if (attempt === 1 || !/Execution context was destroyed/.test(e.message)) throw e;
        await sleep(150);
      }
    }
  }

  /**
   * A route has "settled" when its page element is the visible one and it has painted something
   * other than skeletons. Waiting on network idle would be wrong — the worker polls forever.
   */
  async function waitSettled(path) {
    await page.waitForFunction((expected) => {
      const router = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      if (router?.currentRoute?.value?.path !== expected) return false;
      const view = document.querySelector("ion-router-outlet > .ion-page:not(.ion-page-hidden)");
      if (!view) return false;
      if (view.querySelector("ion-skeleton-text")) return false;
      return view.innerText.trim().length > 0;
    }, path, { timeout: SETTLE_TIMEOUT, polling: 150 });
  }

  async function metrics() {
    // Without a forced collection, `JSHeapUsedSize` mostly reports how recently GC last ran — it
    // swings tens of MB between samples and would read as a leak that is not there. Collect first
    // so the number is retained memory.
    await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
    const perf = await cdp.send("Performance.getMetrics");
    const val = (n) => perf.metrics.find((m) => m.name === n)?.value ?? 0;
    const dom = await page.evaluate(() => ({
      // Ionic keeps visited pages mounted inside the outlet. If this climbs and never falls, the
      // outlet is retaining views and every later render pays for the extra DOM.
      ionPages: document.querySelectorAll("ion-router-outlet .ion-page").length,
      hiddenPages: document.querySelectorAll("ion-router-outlet .ion-page.ion-page-hidden").length,
      nodes: document.getElementsByTagName("*").length,
      overlays: document.querySelectorAll("ion-modal, ion-popover, ion-alert, ion-toast").length,
    }));
    return {
      heapMB: +(val("JSHeapUsedSize") / 1048576).toFixed(1),
      listeners: val("JSEventListeners"),
      documents: val("Documents"),
      ...dom,
    };
  }

  /** One timed pass over every route, settling on each. */
  async function measuredPass(label) {
    const rows = [];
    for (const path of ROUTES) {
      const before = requestCount;
      const t0 = Date.now();
      let error = null;
      try {
        await push(path);
        await waitSettled(path);
      } catch (e) {
        error = e.message.includes("Timeout") ? "did not settle" : e.message.slice(0, 80);
      }
      rows.push({ path, ms: Date.now() - t0, requests: requestCount - before, error });
      await sleep(60);
    }
    const total = rows.reduce((s, r) => s + r.ms, 0);
    log(`   ${label}: ${total} ms total, ${rows.filter((r) => r.error).length} failures`);
    return rows;
  }

  // ---- phase A ----------------------------------------------------------------------------
  log("PHASE A — baseline");
  const before = await metrics();
  const passA = await measuredPass("A");
  const afterA = await metrics();

  // ---- phase B ----------------------------------------------------------------------------
  log(`\nPHASE B — burst (${LAPS} laps x ${ROUTES.length} routes, ${DELAY} ms apart, no settle)`);
  const burstErrors = [];
  const t0 = Date.now();
  for (let lap = 0; lap < LAPS; lap += 1) {
    for (const path of ROUTES) {
      const rejected = await push(path);
      if (typeof rejected === "string") burstErrors.push(`${path} :: ${rejected.slice(0, 90)}`);
      if (DELAY > 0) await sleep(DELAY);
    }
    const m = await metrics();
    log(`   lap ${lap + 1}/${LAPS}  heap ${m.heapMB} MB  ionPages ${m.ionPages}  nodes ${m.nodes}  listeners ${m.listeners}`);
  }
  const burstMs = Date.now() - t0;
  // Let anything still in flight land before re-measuring, so phase C times the app's resting
  // state rather than the tail of the burst.
  await sleep(4000);
  const afterB = await metrics();

  // ---- phase C ----------------------------------------------------------------------------
  log("\nPHASE C — re-baseline");
  const passC = await measuredPass("C");
  const afterC = await metrics();

  // ---- report -----------------------------------------------------------------------------
  const byPath = new Map(passA.map((r) => [r.path, r]));
  const deltas = passC
    .map((c) => {
      const a = byPath.get(c.path);
      return { path: c.path, a: a.ms, c: c.ms, delta: c.ms - a.ms, pct: a.ms ? Math.round(((c.ms - a.ms) / a.ms) * 100) : 0 };
    })
    .sort((x, y) => y.delta - x.delta);

  const totalA = passA.reduce((s, r) => s + r.ms, 0);
  const totalC = passC.reduce((s, r) => s + r.ms, 0);

  log("\n──────────── RESULT ────────────");
  log(`routes ${ROUTES.length} | burst ${LAPS} laps in ${burstMs} ms | ${DELAY} ms apart\n`);
  log(`total settle time   A ${totalA} ms  →  C ${totalC} ms   (${totalC - totalA >= 0 ? "+" : ""}${totalC - totalA} ms, ${Math.round(((totalC - totalA) / totalA) * 100)}%)`);
  log(`heap                ${before.heapMB} → ${afterA.heapMB} → ${afterB.heapMB} → ${afterC.heapMB} MB`);
  log(`retained ion-pages  ${before.ionPages} → ${afterA.ionPages} → ${afterB.ionPages} → ${afterC.ionPages}`);
  log(`dom nodes           ${before.nodes} → ${afterA.nodes} → ${afterB.nodes} → ${afterC.nodes}`);
  log(`event listeners     ${before.listeners} → ${afterA.listeners} → ${afterB.listeners} → ${afterC.listeners}`);
  log(`stray overlays      ${afterC.overlays}`);
  log(`requests issued     ${requestCount}`);

  const slow = deltas.filter((d) => d.delta > 150);
  if (slow.length) {
    log(`\nslower after the burst (>150 ms):`);
    slow.slice(0, 12).forEach((d) => log(`   ${String(d.delta).padStart(6)} ms  ${String(d.pct).padStart(5)}%   ${d.path}`));
  }

  const failuresC = passC.filter((r) => r.error);
  if (failuresC.length) {
    log(`\nroutes that failed to settle in phase C:`);
    failuresC.forEach((r) => log(`   ${r.path} :: ${r.error}`));
  }
  if (burstErrors.length) {
    log(`\nrouter rejections during burst: ${burstErrors.length}`);
    [...new Set(burstErrors)].slice(0, 8).forEach((e) => log(`   ${e}`));
  }
  if (pageErrors.length) {
    log(`\nuncaught page errors: ${pageErrors.length}`);
    [...new Set(pageErrors)].slice(0, 8).forEach((e) => log(`   ${e}`));
  }
  if (failedRequests.length) {
    log(`\nfailed / aborted requests: ${failedRequests.length}`);
    [...new Set(failedRequests)].slice(0, 10).forEach((e) => log(`   ${e}`));
  }
  if (consoleErrors.length) {
    log(`\nconsole errors: ${consoleErrors.length}`);
    [...new Set(consoleErrors)].slice(0, 8).forEach((e) => log(`   ${e}`));
  }

  const out = resolve(APP_ROOT, "tests/e2e/.results/routing-stress.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(
    { laps: LAPS, delay: DELAY, routes: ROUTES, passA, passC, deltas,
      metrics: { before, afterA, afterB, afterC },
      burstMs, burstErrors, pageErrors, failedRequests, consoleErrors, requestCount }, null, 2));
  log(`\nfull data → ${out}`);

  await browser.close();

  // Fail the run on a hard breakage or a clear slowdown, so this is usable in CI.
  const regressed = totalA > 0 && (totalC - totalA) / totalA > 0.5;
  if (failuresC.length || pageErrors.length || regressed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
