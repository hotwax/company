import { describe, expect, it } from "vitest";
import { isViewableLabel, resolveLabelTarget } from "@/utils/fedexLabel";

describe("fedexLabel", () => {
  it("prefers the server url", () => {
    expect(resolveLabelTarget({ labelImageUrl: "https://x/label.pdf", labelImage: "AAAA" }))
      .toEqual({ kind: "url", url: "https://x/label.pdf" });
  });

  it("builds a pdf blob from base64 by default", async () => {
    const target = resolveLabelTarget({ labelImage: btoa("%PDF-1.4") });
    expect(target?.kind).toBe("blob");
    if(target?.kind === "blob") {
      expect(target.blob.type).toBe("application/pdf");
      expect(target.blob.size).toBe(8);
    }
  });

  it("uses the image mime type when the label is a png", () => {
    const target = resolveLabelTarget({ labelImage: btoa("x"), labelImageType: "png" });
    expect(target?.kind === "blob" && target.blob.type).toBe("image/png");
  });

  it("cannot preview ZPL or an empty label", () => {
    expect(isViewableLabel({ labelImage: "AAAA", labelImageType: "ZPLII" })).toBe(false);
    expect(resolveLabelTarget({ labelImage: "AAAA", labelImageType: "ZPLII" })).toBeNull();
    expect(resolveLabelTarget({})).toBeNull();
  });
});
