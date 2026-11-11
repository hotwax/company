export interface SampleLabel {
  labelImageUrl?: string;
  labelImage?: string;
  labelImageType?: string;
  trackingCode?: string;
  carrierPartyId?: string;
  gatewayMessage?: string;
}

export type LabelTarget =
  | { kind: "url"; url: string }
  | { kind: "blob"; blob: Blob };

const MIME_BY_TYPE: Record<string, string> = {
  PDF: "application/pdf",
  PNG: "image/png",
  GIF: "image/gif",
  JPG: "image/jpeg",
  JPEG: "image/jpeg",
};

const decodeBase64 = (value: string): Uint8Array => {
  const raw = value.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for(let index = 0; index < binary.length; index++) {bytes[index] = binary.charCodeAt(index);}

  return bytes;
};

/** ZPL is printer markup a browser tab can't render. */
export const isViewableLabel = (label: SampleLabel): boolean =>
  Boolean(label.labelImageUrl || (label.labelImage && (label.labelImageType || "PDF").toUpperCase() !== "ZPLII"));

/** What a new tab should load: the label URL, or a Blob from the base64 image; null if neither can be shown. */
export function resolveLabelTarget(label: SampleLabel): LabelTarget | null {
  if(label.labelImageUrl) {return { kind: "url", url: label.labelImageUrl };}
  if(!isViewableLabel(label)) {return null;}

  const mime = MIME_BY_TYPE[(label.labelImageType || "PDF").toUpperCase()] || "application/pdf";
  return { kind: "blob", blob: new Blob([decodeBase64(label.labelImage as string) as BlobPart], { type: mime }) };
}
