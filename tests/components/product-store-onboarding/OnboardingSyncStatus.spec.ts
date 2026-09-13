// @vitest-environment jsdom
import { mount } from "@vue/test-utils"
import { beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@common", () => ({
  translate: (key: string) => key
}))

let Component: (typeof import("@/components/product-store-onboarding/OnboardingSyncStatus.vue"))["default"]

beforeAll(async () => {
  Component = (await import("@/components/product-store-onboarding/OnboardingSyncStatus.vue")).default
})

function mountStatus(overrides: Record<string, unknown> = {}) {
  return mount(Component, {
    props: {
      configuration: {
        status: "configured",
        summary: "The product matching rules and sync jobs are ready.",
        checks: [
          { id: "identifier", label: "Product identifier", status: "complete", detail: "Shopify Product SKU" },
          { id: "queue", label: "Queue update requests", status: "complete" },
          { id: "import", label: "Import completed requests", status: "missing" }
        ]
      },
      initialLoad: {
        status: "running",
        summary: "HotWax is processing the exported Shopify product file.",
        lastRunLabel: "Last run: Aug 12, 10:30 · Running",
        totalRecordCount: 1200,
        failedRecordCount: 3,
        stages: [
          { id: "message", label: "System message", status: "completed", detail: "MSG-100 · Created 2 minutes ago" },
          { id: "bulk", label: "Shopify bulk operation", status: "running", totalRecordCount: 1200 },
          { id: "import", label: "HotWax bulk import", status: "pending", detail: "Waiting for HotWax to import the Shopify export file." }
        ]
      },
      saveActionLabel: "Save product setup",
      showRunAction: true,
      showRefreshAction: true,
      showDetailsAction: true,
      ...overrides
    },
    global: {
      stubs: { IonIcon: true }
    }
  })
}

describe("OnboardingSyncStatus", () => {
  it("shows readiness checks, the latest run, stage hierarchy, and record evidence", async () => {
    const wrapper = await mountStatus()

    expect(wrapper.text()).toContain("Track sync progress")
    expect(wrapper.text()).toContain("Configuration")
    expect(wrapper.text()).toContain("Configured")
    expect(wrapper.text()).toContain("Product identifier")
    expect(wrapper.text()).toContain("Import completed requests")
    expect(wrapper.text()).toContain("Missing")
    expect(wrapper.text()).toContain("Current or last run")
    expect(wrapper.text()).toContain("Request context")
    expect(wrapper.text()).toContain("Last run: Aug 12, 10:30 · Running")
    expect(wrapper.text()).toContain("3 failed of 1,200 records processed")
    expect(wrapper.text()).toContain("System message")
    expect(wrapper.text()).toContain("Shopify bulk operation")
    expect(wrapper.text()).toContain("HotWax bulk import")
    expect((wrapper.find("ion-progress-bar").element as any).type).toBe("indeterminate")
  })

  it("announces changing run, active-stage, and count evidence without making the section live", async () => {
    const wrapper = await mountStatus()
    const announcement = wrapper.find("[role=\"status\"]")
    const runningAnnouncement = "Current or last run: Running. Active stage: Shopify bulk operation, Running. " +
      "3 failed of 1,200 records processed."

    expect(wrapper.attributes("aria-live")).toBeUndefined()
    expect(announcement.attributes("aria-live")).toBe("polite")
    expect(announcement.text()).toBe(runningAnnouncement)

    await wrapper.setProps({
      initialLoad: {
        status: "importing",
        summary: "HotWax is importing the export file.",
        stages: [
          { id: "bulk", label: "Shopify bulk operation", status: "completed" },
          {
            id: "import",
            label: "HotWax bulk import",
            status: "importing",
            totalRecordCount: 800
          }
        ]
      }
    })

    const importingAnnouncement = "Current or last run: Importing. Active stage: HotWax bulk import, Importing. " +
      "800 records processed."
    expect(announcement.text()).toBe(importingAnnouncement)
  })

  it("emits the four context actions", async () => {
    const wrapper = await mountStatus()
    const buttons = wrapper.findAll("ion-button")

    await buttons[0].trigger("click")
    await buttons[1].trigger("click")
    await buttons[2].trigger("click")
    await buttons[3].trigger("click")

    expect(wrapper.emitted("save")).toHaveLength(1)
    expect(wrapper.emitted("run")).toHaveLength(1)
    expect(wrapper.emitted("refresh")).toHaveLength(1)
    expect(wrapper.emitted("open-details")).toHaveLength(1)
  })

  it("uses Retry for failed runs and does not invent count or stage evidence", async () => {
    const wrapper = await mountStatus({
      configuration: {
        status: "unknown",
        summary: "Configuration status is unavailable. Refresh to check again."
      },
      initialLoad: {
        status: "error",
        summary: "The latest sync failed. Open details before retrying."
      },
      saveActionLabel: "",
      showDetailsAction: false
    })

    expect(wrapper.text()).toContain("Unknown")
    expect(wrapper.text()).toContain("Error")
    expect(wrapper.text()).toContain("Retry")
    expect(wrapper.text()).not.toContain("records processed")
    expect(wrapper.findAll(".stage-row")).toHaveLength(0)
    expect(wrapper.find("ion-progress-bar").exists()).toBe(false)
  })

  it("shows bounded source diagnostics and explains Refresh versus Retry", async () => {
    const wrapper = await mountStatus({
      initialLoad: {
        status: "error",
        summary: "Failed",
        recoveryHint: "Refresh status to check for newer evidence. Retry starts a new inventory load.",
        stages: [
          {
            id: "service-job",
            label: "Service job",
            status: "error",
            detail: "JOB-100",
            diagnostics: [
              { id: "errors", label: "Errors", detail: "Shopify inventory request timed out." },
              { id: "message", label: "Message", detail: "The remote shop did not respond." }
            ]
          }
        ]
      },
      saveActionLabel: "",
      showDetailsAction: false
    })

    expect(wrapper.text()).toContain("Error details")
    expect(wrapper.text()).toContain("Shopify inventory request timed out.")
    expect(wrapper.text()).toContain("The remote shop did not respond.")
    expect(wrapper.text()).toContain("Next action")
    expect(wrapper.text()).toContain("Refresh status to check for newer evidence. Retry starts a new inventory load.")
    expect(wrapper.text()).toContain("Retry")
  })

  it("keeps hydrated evidence visible while warning that the latest refresh failed", async () => {
    const wrapper = await mountStatus({
      hydrated: true,
      loadError: "syncRun: unavailable",
      initialLoad: {
        status: "completed",
        summary: "Completed",
        stages: [{ id: "import", label: "HotWax bulk import", status: "completed" }]
      }
    })

    expect(wrapper.text()).toContain("Latest refresh failed")
    expect(wrapper.text()).toContain("syncRun: unavailable")
    expect(wrapper.text()).toContain("Completed")
    expect(wrapper.text()).toContain("HotWax bulk import")
    expect(wrapper.find("[role=\"alert\"]").attributes("aria-live")).toBe("assertive")
  })

  it("announces an initial status load failure as an alert", async () => {
    const wrapper = await mountStatus({
      hydrated: false,
      loadError: "Sync status could not be loaded."
    })

    expect(wrapper.find("[role=\"alert\"]").text()).toContain("Sync status could not be loaded.")
    expect(wrapper.find("[role=\"alert\"]").attributes("aria-atomic")).toBe("true")
  })

  it("renders backend diagnostics as escaped text", async () => {
    const unsafe = "<img src=x onerror=\"alert(1)\">"
    const wrapper = await mountStatus({
      initialLoad: {
        status: "error",
        summary: "Failed",
        stages: [{
          id: "service-job",
          label: "Service job",
          status: "error",
          diagnostics: [{ id: "errors", label: "Errors", detail: unsafe }]
        }]
      }
    })

    expect(wrapper.text()).toContain(unsafe)
    expect(wrapper.find(".status-diagnostics img").exists()).toBe(false)
    expect(wrapper.html()).toContain("&lt;img")
  })

  it("renders measured progress only when the parent provides it", async () => {
    const wrapper = await mountStatus({
      initialLoad: {
        status: "running",
        summary: "Shopify is generating the export.",
        progress: 0.4
      }
    })
    const progress = wrapper.find("ion-progress-bar")

    expect((progress.element as any).type).toBe("determinate")
    expect((progress.element as any).value).toBe(0.4)
  })

  it("shows a skeleton while the selected shop scope is still hydrating", async () => {
    const wrapper = await mountStatus({ hydrated: false })

    expect(wrapper.text()).toContain("Loading sync status")
    expect(wrapper.findAll("ion-skeleton-text")).toHaveLength(2)
    expect(wrapper.text()).not.toContain("Status unavailable")
  })

  it.each([
    ["queued", "Queued"],
    ["sent", "Sent"],
    ["importing", "Importing"],
    ["skipped", "Skipped"]
  ])("uses the Product Sync %s progress vocabulary", async (status, label) => {
    const wrapper = await mountStatus({
      initialLoad: {
        status,
        summary: "Latest source-backed status."
      }
    })

    expect(wrapper.text()).toContain(label)
    if(status === "skipped") {
      expect(wrapper.find("ion-progress-bar").exists()).toBe(false)
    } else {
      expect((wrapper.find("ion-progress-bar").element as any).type).toBe("indeterminate")
    }
  })

  it("disables every action while one action is in flight", async () => {
    const wrapper = await mountStatus({ busyAction: "refresh" })
    const buttons = wrapper.findAll("ion-button")

    expect(buttons).toHaveLength(4)
    buttons.forEach((button) => expect((button.element as any).disabled).toBe(true))
    expect(buttons[2].find("ion-spinner").exists()).toBe(true)
    expect(wrapper.attributes("aria-busy")).toBe("true")
  })
})
