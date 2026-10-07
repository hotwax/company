import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The facility's operating hours are three records: the date-effective `FacilityCalendar`
 * association (what `oms/facilities/{id}/calendars` returns), the `TechDataCalendar` (its
 * description) and the `TechDataCalendarWeek` (the day timings). The detail page used to render the
 * first OPERATING_HOURS association on its own — so a removed schedule (closed with a `thruDate`,
 * never deleted) stayed on screen, and a live one showed "Closed" for every day.
 */

const harness = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { hasError: () => false },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
  useDb: vi.fn(),
}));

vi.mock("@/services/appDbSync", () => ({
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
}));
vi.mock("@/composables/useShopify", () => ({ useShopifyFacilityMappings: vi.fn() }));
vi.mock("@/composables/useSeed", () => ({ useTypedEnums: vi.fn() }));
vi.mock("@/composables/useNetSuite", () => ({ useFacilityIdentifications: vi.fn() }));

import { resolveFacilityCalendar, useFacilityCalendars } from "@/composables/useFacilities";

const NOW = Date.UTC(2026, 9, 7, 12);
const HOUR = 3_600_000;

const week = {
  calendarWeekId: "WEEK_1",
  description: null,
  ...Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    .flatMap((day) => [[`${day}StartTime`, "09:07:00"], [`${day}Capacity`, 8 * HOUR]])),
};

describe("resolveFacilityCalendar", () => {
  const options = [{ ...week, calendarId: "CAL_1", description: "Store hours", calendarWeekId: "WEEK_1" }];

  it("joins the effective association with its calendar's description and week timings", () => {
    const resolved = resolveFacilityCalendar(
      [{ facilityId: "F1", calendarId: "CAL_1", facilityCalendarTypeId: "OPERATING_HOURS", fromDate: NOW - HOUR }],
      options,
      NOW,
    );

    expect(resolved).toMatchObject({
      calendarId: "CAL_1",
      description: "Store hours",
      fromDate: NOW - HOUR,
      mondayStartTime: "09:07:00",
      sundayCapacity: 8 * HOUR,
    });
  });

  it("skips an association closed by remove and selects the one still in effect", () => {
    const resolved = resolveFacilityCalendar([
      { calendarId: "OLD", facilityCalendarTypeId: "OPERATING_HOURS", fromDate: NOW - 5 * HOUR, thruDate: NOW - HOUR },
      { calendarId: "CAL_1", facilityCalendarTypeId: "OPERATING_HOURS", fromDate: NOW - HOUR },
    ], options, NOW);

    expect(resolved.calendarId).toBe("CAL_1");
  });

  it("returns no calendar when the only association has been removed", () => {
    expect(resolveFacilityCalendar([
      { calendarId: "CAL_1", facilityCalendarTypeId: "OPERATING_HOURS", fromDate: NOW - 5 * HOUR, thruDate: NOW - HOUR },
    ], options, NOW)).toEqual({});
  });

  it("ignores other calendar types and future-dated associations", () => {
    expect(resolveFacilityCalendar([
      { calendarId: "CAL_1", facilityCalendarTypeId: "HOLIDAYS", fromDate: NOW - HOUR },
      { calendarId: "CAL_1", facilityCalendarTypeId: "OPERATING_HOURS", fromDate: NOW + HOUR },
    ], options, NOW)).toEqual({});
  });

  it("keeps the association's fromDate, which closing the schedule addresses it by", () => {
    const resolved = resolveFacilityCalendar(
      [{ calendarId: "CAL_1", facilityCalendarTypeId: "OPERATING_HOURS", fromDate: NOW - HOUR }],
      [{ ...options[0], fromDate: 1 }],
      NOW,
    );

    expect(resolved.fromDate).toBe(NOW - HOUR);
  });
});

describe("useFacilityCalendars.loadCalendarOptions", () => {
  beforeEach(() => harness.api.mockReset());

  it("merges each calendar with its week without the week's empty description shadowing the calendar's", async () => {
    harness.api.mockImplementation(async (request: any) => ({
      data: request?.url?.endsWith("/week") ? [week] : [{ calendarId: "CAL_1", description: "Store hours", calendarWeekId: "WEEK_1" }],
    }));

    const options = await useFacilityCalendars().loadCalendarOptions();

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ calendarId: "CAL_1", description: "Store hours", tuesdayStartTime: "09:07:00" });
  });
});
