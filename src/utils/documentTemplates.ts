/** A named template in a document type's library (`poorti/documentTemplates`). */
export interface LibraryTemplate {
  templateName: string;
  versionName?: string;
  versionDate?: number;
  userId?: string;
}

/** One document type and its live template, as stored in the `documentTemplates` table. */
export interface DocumentTemplate {
  documentTypeId: string;
  description?: string;
  liveVersionName?: string;
  liveVersionDate?: number;
  liveUserId?: string;
  /** The parameter its print screen takes: shipmentId, picklistId or orderId. Older OMS versions do not send it. */
  sourceParameter?: string;
  templates?: LibraryTemplate[];
}

export type SourceParameter = "shipmentId" | "picklistId" | "orderId";

/**
 * What a document type is printed from, so a preview offers the right documents. OMS versions without
 * `sourceParameter` only have Poorti's three types, where the pick list prints from a pick list.
 */
export function sourceParameterOf(documentTypeId: string, template?: DocumentTemplate): SourceParameter {
  const value = template?.sourceParameter;
  if(value === "shipmentId" || value === "picklistId" || value === "orderId") {return value;}

  return documentTypeId === "PICKLIST" ? "picklistId" : "shipmentId";
}

/** One saved version of the live template or of a library template, newest first. */
export interface DocumentTemplateVersion {
  versionName: string;
  previousVersionName?: string;
  userId?: string;
  versionDate?: number;
  isCurrent?: boolean;
}

/** What is being previewed: a library template (`templateName`) or the live template, at a version. */
export interface TemplateSelection {
  templateName?: string;
  versionName?: string;
}

/** One revision's code, from the `documentTemplateText` GraphQL root. */
export interface TemplateText {
  versionName: string;
  currentVersionName: string;
  templateText: string;
  /** Shared print files the code includes, with their current text; a template can copy one in to change it. */
  includes: Array<{ location: string; templateText: string }>;
}

export interface TemplateError {
  message?: string;
  templateName?: string;
  line?: number;
  column?: number;
  expression?: string;
  type?: string;
}

export interface PreviewResult {
  rendered: boolean;
  pageCount?: number;
  errors: Array<{ stage?: string; message?: string }>;
  templateErrors: TemplateError[];
  /** The version rendered: publish passes it, so nothing saved since the preview goes live. */
  versionName?: string;
  previewUrl?: string;
}

/** A real document a preview renders: a shipment for packing slips, a pick list, or an order such as a transfer order. */
export interface SampleDocument {
  sourceId: string;
  kind: "shipment" | "picklist" | "order";
  statusId?: string;
  facilityId?: string;
  orderId?: string;
  orderName?: string;
  date?: number;
}

/**
 * What publishing a previewed selection does: a library template is published, an earlier version of
 * the live template is rolled back to. Nothing for the live template's current version. Publishing a
 * library template that already matches the live text is refused by the server.
 */
export function publishActionFor(selection: TemplateSelection, template?: DocumentTemplate): "publish" | "rollback" | "" {
  if(!template) {return "";}
  if(selection.templateName) {return "publish";}

  return selection.versionName && selection.versionName !== template.liveVersionName ? "rollback" : "";
}

export const sameSelection = (a?: TemplateSelection, b?: TemplateSelection): boolean =>
  (a?.templateName || "") === (b?.templateName || "") && (a?.versionName || "") === (b?.versionName || "");

/** The server's message from a failed Moqui REST call (`{ errors: "…" }`), when it sent one. */
export function serverErrorMessage(error: any): string {
  const errors = error?.response?.data?.errors ?? error?.data?.errors;

  return typeof errors === "string" ? errors.trim() : "";
}

/** The file a template error is in, without its location, for example `PackingSlipContent.xsl-fo.ftl`. */
export const templateErrorFile = (error: TemplateError): string => error.templateName?.split("/").pop() || "";

/** Template names the server accepts: 1 to 60 lowercase letters, digits and hyphens, starting with a letter or digit. */
export const isTemplateName = (name: string): boolean => /^[a-z0-9][a-z0-9-]{0,59}$/.test(name);

/**
 * A free template name built from `base` ("Pick list" → `pick-list-copy`), adding `-2`, `-3`… when it is taken, so
 * nobody has to invent a name to save a copy.
 */
export function suggestTemplateName(base: string, taken: string[]): string {
  const stem = (base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "template").slice(0, 50) + "-copy";
  const names = new Set(taken);
  if(!names.has(stem)) {return stem;}
  let suffix = 2;
  while(names.has(`${stem}-${suffix}`)) {suffix++;}

  return `${stem}-${suffix}`;
}

/** The line a refused save points at: the server says "Template does not parse: … (line 12, column 5)". */
export function errorLine(message: string): number | undefined {
  const match = /\bline (\d+)/i.exec(message);

  return match ? Number(match[1]) : undefined;
}

/** The file name of a template location, for example `PackingSlipContent.xsl-fo.ftl`. */
export const locationFile = (location: string): string => location.split("/").pop() || location;

/**
 * Replaces the `<#include "location">` line with the included file's text, so a template can change a layout it
 * shares with other documents without changing it for them.
 */
export function inlineInclude(code: string, location: string, includedText: string): string {
  const escaped = location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return code.replace(new RegExp(`<#include\\s+"${escaped}"\\s*/?>`, "g"), () => includedText.trim());
}

/** One approved order found by the preview search, with the documents a template can render for it. */
export interface PreviewOrder {
  orderId: string;
  orderName?: string;
  customerName?: string;
  facilityName?: string;
  orderDate?: number;
  /** Where the order is in fulfillment: not picked yet, picked, or packed. */
  stage: "open" | "picked" | "packed";
  documents: SampleDocument[];
}
