// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadTextFile } from "@/utils/index";

describe("downloadTextFile", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the object URL alive until Chromium has accepted the download", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:http://localhost/download");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    downloadTextFile("safe,csv\r\nvalue,row", "errors.csv");

    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/download");
  });
});
