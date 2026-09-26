import { translate } from "@common";
import {
  CACHE_RECONCILIATION_ERROR_MESSAGE,
  isCacheReconciliationError,
} from "@/utils/cacheReconciliationError";

export const ERROR_WITH_DETAILS_KEY = "{summary} Details: {details}";
export const REFERENCE_DATA_ERROR_KEY =
  "Reference data could not be synchronized. Details: {details}";
export const CARRIER_ACCOUNT_VERIFICATION_ERROR_KEY =
  "Carrier account verification is unavailable. Details: {details}";

function diagnosticText(value: unknown): string {
  if(value instanceof Error && value.message) {
    return value.message;
  }

  return String(value ?? "").trim();
}

/**
 * Keep i18n lookup keys static while retaining server and consistency diagnostics as values.
 *
 * API errors can contain IDs, page numbers, and backend text. Passing that runtime text directly
 * to translate() creates an unbounded locale-key contract and makes partial-failure diagnostics
 * impossible to localize safely.
 */
export function translateMutationError(error: unknown, fallbackKey: string): string {
  if(isCacheReconciliationError(error)) {
    return translate(CACHE_RECONCILIATION_ERROR_MESSAGE);
  }

  const summary = translate(fallbackKey);
  const details = diagnosticText(error);
  if(!details || details === fallbackKey || details === summary) {
    return summary;
  }

  return translate(ERROR_WITH_DETAILS_KEY, { summary, details });
}

export function translateReferenceDataError(details: unknown): string {
  return translate(REFERENCE_DATA_ERROR_KEY, {
    details: diagnosticText(details),
  });
}

export function translateCarrierAccountVerificationError(details: unknown): string {
  return translate(CARRIER_ACCOUNT_VERIFICATION_ERROR_KEY, {
    details: diagnosticText(details),
  });
}
