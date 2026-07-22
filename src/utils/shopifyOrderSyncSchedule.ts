import { CronExpressionParser } from "cron-parser";
import cronstrue from "cronstrue";

export const SHOPIFY_ORDER_SYNC_SCHEDULE_PRESETS = [
  { id: "every-15-minutes", label: "Every 15 minutes", expression: "0 */15 * ? * *" },
  { id: "every-30-minutes", label: "Every 30 minutes", expression: "0 */30 * ? * *" },
  { id: "every-hour", label: "Every hour", expression: "0 0 * ? * *" },
  { id: "daily-at-midnight", label: "Every day at midnight", expression: "0 0 0 ? * *" }
] as const;

export type ShopifyOrderSyncSchedulePreset = typeof SHOPIFY_ORDER_SYNC_SCHEDULE_PRESETS[number];

export type ShopifyOrderSyncCronValidationCode =
  | "required"
  | "field-count"
  | "invalid-time-zone"
  | "invalid-expression";

export interface ShopifyOrderSyncCronOptions {
  timeZone?: string;
}

export interface ShopifyOrderSyncNextRunOptions extends ShopifyOrderSyncCronOptions {
  currentDate?: Date;
}

export interface ShopifyOrderSyncCronValidation {
  valid: boolean;
  normalizedExpression: string;
  timeZone: string;
  code: ShopifyOrderSyncCronValidationCode | null;
  message: string | null;
  /**
   * Whether cron-parser can calculate a local next-run preview for this
   * structurally valid Quartz expression. OMS still validates every saved
   * expression with Moqui's cron-utils Quartz parser.
   */
  previewSupported: boolean;
}

export interface ShopifyOrderSyncScheduleState {
  cronExpression: string | null | undefined;
  active: boolean;
}

const QUARTZ_CRON_MIN_FIELD_COUNT = 6;
const QUARTZ_CRON_MAX_FIELD_COUNT = 7;

const MONTH_ALIASES: Readonly<Record<string, number>> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12
};

const DAY_OF_WEEK_ALIASES: Readonly<Record<string, number>> = {
  SUN: 1,
  MON: 2,
  TUE: 3,
  WED: 4,
  THU: 5,
  FRI: 6,
  SAT: 7
};

interface QuartzFieldDefinition {
  min: number;
  max: number;
  aliases?: Readonly<Record<string, number>>;
  strictRangeOrder?: boolean;
}

const QUARTZ_FIELD_DEFINITIONS = [
  { min: 0, max: 59 },
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12, aliases: MONTH_ALIASES },
  { min: 1, max: 7, aliases: DAY_OF_WEEK_ALIASES },
  { min: 1970, max: 2099, strictRangeOrder: true }
] as const satisfies readonly QuartzFieldDefinition[];

function getDefaultTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getTimeZone(timeZone?: string): string {
  return timeZone?.trim() || getDefaultTimeZone();
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch (_error) {
    return false;
  }
}

function parseQuartzFieldValue(value: string, definition: QuartzFieldDefinition): number | null {
  const alias = definition.aliases?.[value.toUpperCase()];
  if (alias !== undefined) return alias;
  if (!/^\d+$/.test(value)) return null;

  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue)
    && numericValue >= definition.min
    && numericValue <= definition.max
    ? numericValue
    : null;
}

function isValidQuartzStep(value: string, definition: QuartzFieldDefinition): boolean {
  if (!/^\d+$/.test(value)) return false;

  const step = Number(value);
  // Mirrors cron-utils FieldConstraints.isPeriodInRange().
  const maxStep = Math.min(definition.max, definition.max - definition.min + 1);
  return Number.isSafeInteger(step) && step > 0 && step <= maxStep;
}

function isValidQuartzRange(value: string, definition: QuartzFieldDefinition): boolean {
  const rangeParts = value.split("-");
  if (rangeParts.length !== 2) return false;

  const start = parseQuartzFieldValue(rangeParts[0], definition);
  const end = parseQuartzFieldValue(rangeParts[1], definition);
  if (start === null || end === null) return false;

  // cron-utils configures a strict range only for the optional Quartz year.
  return !definition.strictRangeOrder || start <= end;
}

function isValidStandardQuartzListItem(value: string, definition: QuartzFieldDefinition): boolean {
  const stepParts = value.split("/");
  if (stepParts.length > 2 || !stepParts[0]) return false;

  const base = stepParts[0];
  if (stepParts.length === 2 && !isValidQuartzStep(stepParts[1], definition)) return false;

  return base === "*"
    || parseQuartzFieldValue(base, definition) !== null
    || isValidQuartzRange(base, definition);
}

function isValidDayOfMonthListItem(value: string): boolean {
  const definition = QUARTZ_FIELD_DEFINITIONS[3];
  const normalized = value.toUpperCase();

  if (normalized === "L" || normalized === "LW") return true;

  const lastOffsetMatch = normalized.match(/^L-(\d+)$/);
  if (lastOffsetMatch) return parseQuartzFieldValue(lastOffsetMatch[1], definition) !== null;

  const nearestWeekdayMatch = normalized.match(/^(\d+)W$/);
  if (nearestWeekdayMatch) return parseQuartzFieldValue(nearestWeekdayMatch[1], definition) !== null;

  // cron-utils accepts a numeric value before L for this field as well.
  const lastMatch = normalized.match(/^(\d+)L$/);
  if (lastMatch) return parseQuartzFieldValue(lastMatch[1], definition) !== null;

  return isValidStandardQuartzListItem(value, definition);
}

function isValidDayOfWeekListItem(value: string): boolean {
  const definition = QUARTZ_FIELD_DEFINITIONS[5];
  const normalized = value.toUpperCase();

  if (normalized === "L") return true;

  const lastOffsetMatch = normalized.match(/^L-(\d+)$/);
  if (lastOffsetMatch) return parseQuartzFieldValue(lastOffsetMatch[1], definition) !== null;

  const lastMatch = normalized.match(/^([A-Z]+|\d+)L$/);
  if (lastMatch) return parseQuartzFieldValue(lastMatch[1], definition) !== null;

  const nthMatch = normalized.match(/^([A-Z]+|\d+)#(\d+)$/);
  if (nthMatch) {
    const occurrence = Number(nthMatch[2]);
    return parseQuartzFieldValue(nthMatch[1], definition) !== null
      // Quartz defines the nth weekday occurrence as 1-5. cron-utils 9.2.1
      // accidentally reuses the day-of-week 1-7 range here, which can create
      // schedules that never have a matching date.
      && Number.isSafeInteger(occurrence)
      && occurrence >= 1
      && occurrence <= 5;
  }

  return isValidStandardQuartzListItem(value, definition);
}

function isValidQuartzFieldList(
  value: string,
  validateItem: (item: string) => boolean
): boolean {
  const items = value.split(",");
  return items.length > 0 && items.every((item) => item.length > 0 && validateItem(item));
}

/**
 * Performs a conservative structural check against the Quartz definition used
 * by Moqui cron-utils 9.2.1. This deliberately does not claim to replace the
 * authoritative server parser used when the job is saved.
 */
function isStructurallyValidQuartzExpression(fields: string[]): boolean {
  const [seconds, minutes, hours, dayOfMonth, month, dayOfWeek, year] = fields;

  if (!isValidQuartzFieldList(seconds, (item) => isValidStandardQuartzListItem(item, QUARTZ_FIELD_DEFINITIONS[0]))) {
    return false;
  }
  if (!isValidQuartzFieldList(minutes, (item) => isValidStandardQuartzListItem(item, QUARTZ_FIELD_DEFINITIONS[1]))) {
    return false;
  }
  if (!isValidQuartzFieldList(hours, (item) => isValidStandardQuartzListItem(item, QUARTZ_FIELD_DEFINITIONS[2]))) {
    return false;
  }
  if (!isValidQuartzFieldList(month, (item) => isValidStandardQuartzListItem(item, QUARTZ_FIELD_DEFINITIONS[4]))) {
    return false;
  }
  if (year !== undefined
      && !isValidQuartzFieldList(year, (item) => isValidStandardQuartzListItem(item, QUARTZ_FIELD_DEFINITIONS[6]))) {
    return false;
  }

  const dayOfMonthUnspecified = dayOfMonth === "?";
  const dayOfWeekUnspecified = dayOfWeek === "?";
  if (dayOfMonthUnspecified === dayOfWeekUnspecified) return false;

  return (dayOfMonthUnspecified || isValidQuartzFieldList(dayOfMonth, isValidDayOfMonthListItem))
    && (dayOfWeekUnspecified || isValidQuartzFieldList(dayOfWeek, isValidDayOfWeekListItem));
}

function supportsLocalCronPreview(expression: string, timeZone: string): boolean {
  try {
    CronExpressionParser.parse(expression, { tz: timeZone });
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Normalizes only the whitespace that the save contract ignores. Internal
 * spacing is deliberately retained so an inherited expression is not
 * rewritten merely by opening the setup page.
 */
export function normalizeShopifyOrderSyncCronExpression(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Creates the initial setup draft without normalizing the inherited schedule.
 * A newly cloned job therefore retains the template expression byte-for-byte
 * until an administrator explicitly edits and saves it.
 */
export function createShopifyOrderSyncScheduleDraft(
  inheritedCronExpression: string | null | undefined,
  active = false
): ShopifyOrderSyncScheduleState {
  return {
    cronExpression: inheritedCronExpression ?? "",
    active
  };
}

export function validateShopifyOrderSyncCronExpression(
  value: unknown,
  options: ShopifyOrderSyncCronOptions = {}
): ShopifyOrderSyncCronValidation {
  const normalizedExpression = normalizeShopifyOrderSyncCronExpression(value);
  const timeZone = getTimeZone(options.timeZone);

  if (!normalizedExpression) {
    return {
      valid: false,
      normalizedExpression,
      timeZone,
      code: "required",
      message: "A cron expression is required.",
      previewSupported: false
    };
  }

  const fields = normalizedExpression.split(/\s+/);
  if (fields.length < QUARTZ_CRON_MIN_FIELD_COUNT || fields.length > QUARTZ_CRON_MAX_FIELD_COUNT) {
    return {
      valid: false,
      normalizedExpression,
      timeZone,
      code: "field-count",
      message: "Use a six- or seven-field Quartz cron expression.",
      previewSupported: false
    };
  }

  if (!isValidTimeZone(timeZone)) {
    return {
      valid: false,
      normalizedExpression,
      timeZone,
      code: "invalid-time-zone",
      message: "Use a valid IANA timezone.",
      previewSupported: false
    };
  }

  if (isStructurallyValidQuartzExpression(fields)) {
    return {
      valid: true,
      normalizedExpression,
      timeZone,
      code: null,
      message: null,
      previewSupported: supportsLocalCronPreview(normalizedExpression, timeZone)
    };
  }

  return {
    valid: false,
    normalizedExpression,
    timeZone,
    code: "invalid-expression",
    message: "Use a valid Quartz cron expression. OMS validates the expression when you save.",
    previewSupported: false
  };
}

export function isValidShopifyOrderSyncCronExpression(
  value: unknown,
  options: ShopifyOrderSyncCronOptions = {}
): boolean {
  return validateShopifyOrderSyncCronExpression(value, options).valid;
}

export function describeShopifyOrderSyncCronExpression(
  value: unknown,
  options: ShopifyOrderSyncCronOptions = {}
): string | null {
  const validation = validateShopifyOrderSyncCronExpression(value, options);
  if (!validation.valid) return null;

  try {
    return cronstrue.toString(validation.normalizedExpression);
  } catch (_error) {
    return null;
  }
}

export function getNextShopifyOrderSyncRun(
  value: unknown,
  options: ShopifyOrderSyncNextRunOptions = {}
): Date | null {
  const validation = validateShopifyOrderSyncCronExpression(value, options);
  if (!validation.valid || !validation.previewSupported) return null;

  try {
    const interval = CronExpressionParser.parse(validation.normalizedExpression, {
      tz: validation.timeZone,
      ...(options.currentDate ? { currentDate: options.currentDate } : {})
    });
    return interval.next().toDate();
  } catch (_error) {
    return null;
  }
}

export function isShopifyOrderSyncScheduleDirty(
  original: ShopifyOrderSyncScheduleState,
  draft: ShopifyOrderSyncScheduleState
): boolean {
  return normalizeShopifyOrderSyncCronExpression(original.cronExpression)
      !== normalizeShopifyOrderSyncCronExpression(draft.cronExpression)
    || original.active !== draft.active;
}
