import { describe, expect, it } from "vitest";
import { errorLine, inlineInclude, isTemplateName, locationFile, publishActionFor, sameSelection, serverErrorMessage, sourceParameterOf, suggestTemplateName, templateErrorFile } from "@/utils/documentTemplates";

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

describe("editing helpers", () => {
  it("accepts only the template names the server accepts", () => {
    expect(isTemplateName("pick-list-copy")).toBe(true);
    expect(isTemplateName("2026-holiday")).toBe(true);
    expect(isTemplateName("Pick List")).toBe(false);
    expect(isTemplateName("-copy")).toBe(false);
    expect(isTemplateName("../live")).toBe(false);
    expect(isTemplateName("a".repeat(61))).toBe(false);
  });

  it("suggests a free name from the document's name", () => {
    expect(suggestTemplateName("Pick list", [])).toBe("pick-list-copy");
    expect(suggestTemplateName("Pick list", ["pick-list-copy", "pick-list-copy-2"])).toBe("pick-list-copy-3");
    expect(suggestTemplateName("Packing slip and shipping label", [])).toBe("packing-slip-and-shipping-label-copy");
    expect(isTemplateName(suggestTemplateName("x".repeat(80), []))).toBe(true);
  });

  it("reads the line a refused save points at", () => {
    expect(errorLine("Template does not parse: Unclosed #if (line 12, column 5)")).toBe(12);
    expect(errorLine("Template holiday is at version 03")).toBeUndefined();
  });

  it("copies a shared file in place of its include line, and only that one", () => {
    const location = "dbresource://resources/poorti/template/pdf/PackingSlipContent.xsl-fo.ftl";
    const code = `<fo:root>\n  <#include "${location}">\n  <#include "dbresource://resources/poorti/template/pdf/LabelContent.xsl-fo.ftl"/>\n</fo:root>`;
    const inlined = inlineInclude(code, location, "\n<fo:block>Packing slip</fo:block>\n");
    expect(inlined).toContain("<fo:block>Packing slip</fo:block>");
    expect(inlined).not.toContain("PackingSlipContent");
    expect(inlined).toContain("LabelContent.xsl-fo.ftl");
    expect(locationFile(location)).toBe("PackingSlipContent.xsl-fo.ftl");
  });
});

describe("sourceParameterOf", () => {
  it("uses what the server says a type prints from", () => {
    expect(sourceParameterOf("GORJANA_PICK_TICKET", { documentTypeId: "GORJANA_PICK_TICKET", sourceParameter: "picklistId" })).toBe("picklistId");
    expect(sourceParameterOf("GORJANA_TO_PICKLIST", { documentTypeId: "GORJANA_TO_PICKLIST", sourceParameter: "orderId" })).toBe("orderId");
    expect(sourceParameterOf("PICKLIST", { documentTypeId: "PICKLIST", sourceParameter: "shipmentId" })).toBe("shipmentId");
  });

  it("falls back to Poorti's three types on an OMS that does not send it, or sends something unknown", () => {
    expect(sourceParameterOf("PICKLIST")).toBe("picklistId");
    expect(sourceParameterOf("PACKING_SLIP", { documentTypeId: "PACKING_SLIP" })).toBe("shipmentId");
    expect(sourceParameterOf("PICKLIST", { documentTypeId: "PICKLIST", sourceParameter: "returnId" })).toBe("picklistId");
  });
});
