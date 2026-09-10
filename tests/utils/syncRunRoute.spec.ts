import { describe, expect, it } from "vitest"
import { getSafeSyncRunQueryId } from "@/utils/syncRunRoute"

describe("getSafeSyncRunQueryId", () => {
  it("normalizes scalar and repeated query values", () => {
    expect(getSafeSyncRunQueryId("  MSG-100  ")).toBe("MSG-100")
    expect(getSafeSyncRunQueryId(["JOB-200", "ignored"])).toBe("JOB-200")
    expect(getSafeSyncRunQueryId(300)).toBe("300")
  })

  it("rejects missing, control-character, and oversized values", () => {
    expect(getSafeSyncRunQueryId(undefined)).toBe("")
    expect(getSafeSyncRunQueryId("MSG\n100")).toBe("")
    expect(getSafeSyncRunQueryId("x".repeat(256))).toBe("")
  })
})
