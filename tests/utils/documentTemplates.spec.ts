import { describe, expect, it } from "vitest";
import { publishActionFor, sameSelection, serverErrorMessage, templateErrorFile } from "@/utils/documentTemplates";

const packingSlip = {
  documentTypeId: "PACKING_SLIP",
  liveVersionName: "15",
  templates: [
    { templateName: "holiday-2026", versionName: "02" },
    { templateName: "plain", versionName: "01" },
  ],
};

describe("publishActionFor", () => {
  it("publishes any library template, at any version (the server refuses text that is already live)", () => {
    expect(publishActionFor({ templateName: "plain" }, packingSlip)).toBe("publish");
    expect(publishActionFor({ templateName: "holiday-2026", versionName: "01" }, packingSlip)).toBe("publish");
  });

  it("rolls the live template back to an earlier version, never to the current one", () => {
    expect(publishActionFor({ versionName: "14" }, packingSlip)).toBe("rollback");
    expect(publishActionFor({ versionName: "15" }, packingSlip)).toBe("");
    expect(publishActionFor({}, packingSlip)).toBe("");
    expect(publishActionFor({ versionName: "14" }, undefined)).toBe("");
  });
});

describe("document template helpers", () => {
  it("treats an empty and a missing template or version as the same selection", () => {
    expect(sameSelection({ templateName: "", versionName: "" }, {})).toBe(true);
    expect(sameSelection({ templateName: "plain" }, { templateName: "plain", versionName: "01" })).toBe(false);
  });


  it("reads the server's reason from a refused Moqui REST call", () => {
    expect(serverErrorMessage({ response: { data: { errors: "The live PACKING_SLIP template is at version 16, not 15.\n" } } }))
      .toBe("The live PACKING_SLIP template is at version 16, not 15.");
    expect(serverErrorMessage(new Error("offline"))).toBe("");
  });

  it("names the file a template error is in", () => {
    expect(templateErrorFile({ templateName: "dbresource://resources/poorti/template/pdf/PackingSlipContent.xsl-fo.ftl" })).toBe("PackingSlipContent.xsl-fo.ftl");
    expect(templateErrorFile({})).toBe("");
  });
});
