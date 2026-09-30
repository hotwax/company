import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive, shallowRef } from "vue";

/**
 * The lookup composables in useSeed are thin wrappers over the framework's useSeedData. These pin
 * the shapes templates index into, and that `hydrated` keeps useDb's meaning: the first read has
 * landed, and an empty list is only trusted once sync has stopped filling the table.
 */
const harness = vi.hoisted(() => ({
  tables: {} as Record<string, any>,
  serviceState: {} as { running: boolean },
  firstRead: {} as Record<string, { resolve: () => void; promise: Promise<void> }>,
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { resolve, promise };
}

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: () => false },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  useDb: () => ({ records: { value: [] }, hydrated: { value: true } }),
}));

vi.mock("@common/db", () => ({
  get serviceState() { return harness.serviceState; },
  useSeedData: () => {
    const rows = (table: string) => harness.tables[table].value;
    return {
      statuses: () => rows("statuses"),
      statusItemsByType: (type: string) => rows("statuses").filter((row: any) => row.statusTypeId === type),
      enums: () => rows("enums"),
      enumsByType: (type: string) => rows("enums").filter((row: any) => row.enumTypeId === type),
      enumTypes: () => rows("enumTypes"),
      geos: () => rows("geos"),
      countries: () => rows("geos").filter((geo: any) => geo.geoTypeEnumId === "GEOT_COUNTRY"),
      statesForCountry: (id: string) => rows("geos").filter((geo: any) => geo.parent === id),
      dbicCountries: () => [],
      shipmentMethodTypes: () => rows("shipmentMethodTypes"),
      paymentMethodTypes: () => rows("paymentMethodTypes"),
      roleTypes: () => rows("roleTypes"),
      getEnumsByType: () => harness.firstRead.enums.promise,
      getGeos: () => harness.firstRead.geos.promise,
      getPaymentMethodTypes: () => harness.firstRead.paymentMethodTypes.promise,
    };
  },
}));

vi.mock("@/services/appDbSync", () => ({ refreshAfterMutation: vi.fn(), resyncDomain: vi.fn() }));
vi.mock("@/composables/useOrganizations", () => ({ usePrimaryOrganization: vi.fn() }));

beforeEach(() => {
  for (const table of ["statuses", "enums", "enumTypes", "geos", "shipmentMethodTypes", "paymentMethodTypes", "roleTypes"]) {
    harness.tables[table] = shallowRef<any[]>([]);
  }
  harness.serviceState = reactive({ running: true });
  harness.firstRead = { enums: deferred(), geos: deferred(), paymentMethodTypes: deferred() };
});

const flush = async () => { await Promise.resolve(); await nextTick(); };

describe("useSeed lookup wrappers", () => {
  it("keeps the status map, label fallback and sorted slices", async () => {
    const { useStatuses } = await import("@/composables/useSeed");
    harness.tables.statuses.value = [
      { statusId: "B", statusTypeId: "T", description: "Beta" },
      { statusId: "A", statusTypeId: "T", description: "Alpha" },
      { statusId: "C", statusTypeId: "OTHER" },
    ];
    const { statusItems, labelFor, ofType } = useStatuses();

    expect(statusItems.value).toEqual({ A: "Alpha", B: "Beta", C: "C" });
    expect(labelFor("A")).toBe("Alpha");
    expect(labelFor("MISSING")).toBe("MISSING");
    expect(labelFor(undefined)).toBe("");
    expect(ofType("T").map((row: any) => row.statusId)).toEqual(["A", "B"]);
  });

  it("re-renders its maps when the table fills", async () => {
    const { useTypedEnums } = await import("@/composables/useSeed");
    const { values, descriptionById } = useTypedEnums("FACLOC_TYPE");
    expect(values.value).toEqual([]);

    harness.tables.enums.value = [{ enumId: "PICK", enumTypeId: "FACLOC_TYPE", description: "Pick" }];
    expect(descriptionById.value).toEqual({ PICK: "Pick" });
  });

  it("is not hydrated until the first read lands", async () => {
    const { useTypedEnums } = await import("@/composables/useSeed");
    harness.serviceState.running = false;
    const { hydrated } = useTypedEnums("ORDER_SALES_CHANNEL");
    expect(hydrated.value).toBe(false);

    harness.firstRead.enums.resolve();
    await flush();
    expect(hydrated.value).toBe(true);
  });

  it("does not trust an empty list while sync is still filling the table", async () => {
    const { useGeos } = await import("@/composables/useSeed");
    const { hydrated } = useGeos();
    harness.firstRead.geos.resolve();
    await flush();
    expect(hydrated.value).toBe(false);

    harness.tables.geos.value = [{ geoId: "USA", geoTypeEnumId: "GEOT_COUNTRY" }];
    expect(hydrated.value).toBe(true);
  });

  it("trusts an empty list once sync has stopped", async () => {
    const { usePaymentMethodTypes } = await import("@/composables/useSeed");
    const { paymentMethodTypes, hydrated } = usePaymentMethodTypes();
    harness.firstRead.paymentMethodTypes.resolve();
    await flush();
    expect(hydrated.value).toBe(false);

    harness.serviceState.running = false;
    expect(hydrated.value).toBe(true);
    expect(paymentMethodTypes.value).toEqual([]);
  });

  it("reads countries from the stored geo type", async () => {
    const { useGeos } = await import("@/composables/useSeed");
    harness.tables.geos.value = [
      { geoId: "USA", geoName: "United States", geoTypeEnumId: "GEOT_COUNTRY" },
      { geoId: "USA_CA", geoName: "California", geoTypeEnumId: "GEOT_STATE", parent: "USA" },
    ];
    const { countries, statesOf, byId } = useGeos();

    expect(countries.value.map((geo: any) => geo.geoId)).toEqual(["USA"]);
    expect(statesOf("USA").map((geo: any) => geo.geoId)).toEqual(["USA_CA"]);
    expect(byId.value.USA_CA.geoName).toBe("California");
  });

  it("keeps the sorted type lists and the role description map", async () => {
    const { useRoleTypes, useShipmentMethodTypes } = await import("@/composables/useSeed");
    harness.tables.roleTypes.value = [
      { roleTypeId: "Z", description: "Zeta" },
      { roleTypeId: "A", description: "Alpha" },
    ];
    harness.tables.shipmentMethodTypes.value = [
      { shipmentMethodTypeId: "NEXT_DAY", description: "Next day" },
      { shipmentMethodTypeId: "GROUND", description: "Ground" },
    ];

    const { roleTypes, descriptionById } = useRoleTypes();
    expect(roleTypes.value.map((row: any) => row.roleTypeId)).toEqual(["A", "Z"]);
    expect(descriptionById.value).toEqual({ Z: "Zeta", A: "Alpha" });
    expect(useShipmentMethodTypes().shipmentMethodTypes.value.map((row: any) => row.shipmentMethodTypeId))
      .toEqual(["GROUND", "NEXT_DAY"]);
  });
});
