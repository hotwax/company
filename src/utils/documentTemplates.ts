/** A named template in a document type's library (`poorti/documentTemplates`). */
export interface LibraryTemplate {
  templateName: string;
  versionName?: string;
  versionDate?: number;
  userId?: string;
  isLive?: boolean;
}

/** One document type and its live template, as stored in the `documentTemplates` table. */
export interface DocumentTemplate {
  documentTypeId: string;
  description?: string;
  liveVersionName?: string;
  liveVersionDate?: number;
  liveUserId?: string;
  liveTemplateNames?: string[];
  templates?: LibraryTemplate[];
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
  previewUrl?: string;
}

/** The id a preview renders: a shipment for packing slips, a picklist for pick lists. */
export const sourceIdLabel = (documentTypeId: string): string =>
  documentTypeId === "PICKLIST" ? "Picklist ID" : "Shipment ID";

/**
 * What publishing a previewed selection does: a library template is published, an earlier version of
 * the live template is rolled back to. Nothing when the selection is already what prints.
 */
export function publishActionFor(selection: TemplateSelection, template?: DocumentTemplate): "publish" | "rollback" | "" {
  if(!template) {return "";}
  if(selection.templateName) {
    const libraryTemplate = template.templates?.find(row => row.templateName === selection.templateName);
    const isCurrentVersion = !selection.versionName || selection.versionName === libraryTemplate?.versionName;

    return isCurrentVersion && libraryTemplate?.isLive ? "" : "publish";
  }

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
