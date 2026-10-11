import { computed } from "vue";
import { isEffectiveNow } from "@/utils/cacheProjection";
import { alertController } from "@ionic/vue";
import { api, commonUtil, emitter, logger } from "@common";
import { translate } from "@/i18n";
import {
  enumGroupMemberCache,
  facilityIdentificationCache,
  integrationTypeMappingCache,
} from "@/utils/cacheEntities";
import { resyncDomain } from "@/services/appCacheBootstrap";
import { useCachedList } from "./useCachedList";

/**
 * NetSuite master entity — the whole integration surface in one composable.
 *
 * The NetSuite screens are pure CRUD over a handful of reference tables, so reads and writes both
 * live here rather than being split across a store and a helper file:
 *   - READS come from the local cache (synced at login), so the pages open with no request.
 *   - WRITES call the REST endpoints directly and then resync the affected cached domain, because
 *     Moqui returns only the PK on create and effectively nothing on update — the cache has to be
 *     re-read for the UI to reflect a change (see docs/cache-sync-rollout-plan.md F1).
 *
 * Value sets NetSuite maps against are seed data and stay in `useSeed` (payment method types,
 * shipment method types, sales-channel and variance-reason enums).
 */

// =============================================================================================
// Reads
// =============================================================================================

/**
 * Integration type mappings, optionally narrowed to one `integrationTypeId`.
 * This is the table every NetSuite mapping screen edits.
 */
export function useIntegrationTypeMappings(integrationTypeId?: string) {
  const { records, hydrated } = useCachedList<any>(
    integrationTypeMappingCache,
    integrationTypeId ? { scope: { field: "integrationTypeId", value: integrationTypeId } } : {},
  );

  /** mappingKey → mappingValue for the active type. */
  const valueByKey = computed<Record<string, string>>(() =>
    records.value.reduce((map: Record<string, string>, row: any) => {
      if (row.mappingKey) map[row.mappingKey] = row.mappingValue ?? "";
      return map;
    }, {}));

  /** mappingKey → the whole row, when a screen needs the mapping id to update or delete it. */
  const mappingByKey = computed<Record<string, any>>(() =>
    records.value.reduce((map: Record<string, any>, row: any) => {
      if (row.mappingKey) map[row.mappingKey] = row;
      return map;
    }, {}));

  const byType = computed<Record<string, any[]>>(() =>
    records.value.reduce((map: Record<string, any[]>, row: any) => {
      const type = row.integrationTypeId ?? "";
      (map[type] ||= []).push(row);
      return map;
    }, {}));

  return { mappings: records, valueByKey, mappingByKey, byType, records, hydrated };
}

/** Members of the NetSuite variance-reason enum group. */
export function useEnumGroupMembers() {
  const { records, hydrated } = useCachedList<any>(enumGroupMemberCache);
  return { members: records, records, hydrated };
}

/** Facility identifications NetSuite uses as departments. */
export function useFacilityIdentifications() {
  const { records, hydrated } = useCachedList<any>(facilityIdentificationCache);

  /**
   * Only identifications in force right now. `oms/facilities/identifications` returns thru-dated
   * rows, and "remove" here means stamping a `thruDate` — so without this filter a removed
   * identification keeps rendering and the Remove button appears to do nothing.
   *
   * `Date.now()` is read at evaluation time, so this re-filters whenever the cache changes rather
   * than on a timer; a row expiring mid-session clears on the next cache write, which is fine for
   * dates a user just set.
   */
  const active = computed<any[]>(() => {
    const now = Date.now();
    return records.value.filter((row: any) => isEffectiveNow(row.raw ?? row, now));
  });

  /** facilityId → identification value, the shape the departments screen edits. */
  const valueByFacility = computed<Record<string, string>>(() =>
    active.value.reduce((map: Record<string, string>, row: any) => {
      if (row.facilityId) map[row.facilityId] = row.idValue ?? "";
      return map;
    }, {}));

  return { identifications: active, valueByFacility, records, hydrated };
}

// =============================================================================================
// Writes — each resyncs the cached domain it changed
// =============================================================================================

/**
 * CRUD for one integration type. `integrationTypeId` scopes every write, matching how each screen
 * owns exactly one mapping type.
 */
export function useNetSuite(integrationTypeId?: any) {
  const { mappings, valueByKey, mappingByKey, hydrated } = useIntegrationTypeMappings(integrationTypeId);

  const refreshMappings = () => resyncDomain("integrationTypeMapping");

  async function addMapping(payload: any) {
    const resp: any = await api({ url: "admin/integrationTypeMappings", method: "post", data: payload });
    if (commonUtil.hasError(resp)) throw resp;
    await refreshMappings();
    return resp;
  }

  async function updateMapping(payload: any, integrationMappingId: any) {
    const resp: any = await api({
      url: `admin/integrationTypeMappings/${integrationMappingId}`,
      method: "post",
      data: payload,
    });
    if (commonUtil.hasError(resp)) throw resp;
    await refreshMappings();
    return resp;
  }

  async function removeMapping(integrationMappingId: any) {
    const resp: any = await api({
      url: `admin/integrationTypeMappings/${integrationMappingId}`,
      method: "delete",
    });
    if (commonUtil.hasError(resp)) throw resp;
    await refreshMappings();
    return resp;
  }

  /** Facility identification (department) upsert. */
  async function updateFacilityIdentification(payload: any) {
    const resp: any = await api({
      url: `oms/facilities/${payload.facilityId}/identifications`,
      method: "post",
      data: payload,
    });
    if (commonUtil.hasError(resp)) throw resp;
    await resyncDomain("facilityIdentification");
    return resp;
  }

  /**
   * Add (or date-expire) an enum's membership in the NetSuite reason group.
   * Passing `thruDate` expires the membership rather than creating a new one.
   */
  async function setEnumGroupMembership(payload: any) {
    const resp: any = await api({
      url: `admin/enumGroups/${payload.enumerationGroupId}/members`,
      method: "post",
      data: payload,
    });
    if (commonUtil.hasError(resp)) throw resp;
    await resyncDomain("enumGroupMember");
    return resp;
  }

  /**
   * Enum code edit (used for sales channels and variance reasons).
   *
   * Enums are cached as ONE domain and sliced by `enumTypeId` on read, so a change resyncs that
   * single domain rather than a per-type one.
   */
  async function updateEnumCode(payload: any) {
    const resp: any = await api({ url: `admin/enums/${payload.enumId}`, method: "put", data: payload });
    if (commonUtil.hasError(resp)) throw resp;
    await resyncDomain("enum");
    return resp;
  }

  /**
   * SFTP transfer settings for the NetSuite connector. Nothing here is cached — it is connector
   * configuration rather than reference data — so there is no resync to follow.
   */
  async function updateSftpConfig(payload: any) {
    const resp: any = await api({ url: "updateSftp", method: "post", data: payload });
    if (commonUtil.hasError(resp)) throw resp;
    return resp;
  }

  // -------------------------------------------------------------------------------------------
  // Prompt-driven helpers the screens bind to directly (previously useNetSuiteComposables)
  // -------------------------------------------------------------------------------------------

  /** Prompt for a NetSuite id and create or update the mapping for `mappingKey`. */
  const editNetSuiteId = async (mappingKey: any, integrationMapping: any) => {
    const alert = await alertController.create({
      header: translate("Add NetSuite ID"),
      inputs: [{
        name: "netSuiteId",
        value: integrationMapping?.integrationMappingId ? integrationMapping.mappingValue : "",
      }],
      buttons: [
        { text: translate("Cancel"), role: "cancel" },
        {
          text: translate("Apply"),
          handler: async (data: any) => {
            const netSuiteId = data?.netSuiteId?.trim();
            if (!netSuiteId) return;

            emitter.emit("presentLoader");
            try {
              if (integrationMapping?.integrationMappingId) {
                await updateMapping(
                  { mappingKey, mappingValue: netSuiteId, integrationTypeId },
                  integrationMapping.integrationMappingId,
                );
              } else {
                await addMapping({ mappingKey, mappingValue: netSuiteId, integrationTypeId });
              }
              commonUtil.showToast(translate("NetSuite ID updated successfully"));
            } catch (error) {
              logger.error(error);
              commonUtil.showToast(translate("Failed to update NetSuite ID"));
            }
            emitter.emit("dismissLoader");
          },
        },
      ],
    });
    await alert.present();
  };

  const addNetSuiteId = async (payload: any) => {
    emitter.emit("presentLoader");
    try {
      await addMapping({ ...payload, integrationTypeId });
      commonUtil.showToast(translate("NetSuite ID added successfully"));
    } catch (error) {
      logger.error(error);
      commonUtil.showToast(translate("Failed to add NetSuite ID"));
    }
    emitter.emit("dismissLoader");
  };

  const updateNetSuiteId = async (payload: any, integrationMappingId: any) => {
    emitter.emit("presentLoader");
    try {
      await updateMapping({ ...payload, integrationTypeId }, integrationMappingId);
      commonUtil.showToast(translate("NetSuite ID updated successfully"));
    } catch (error) {
      logger.error(error);
      commonUtil.showToast(translate("Failed to update NetSuite ID"));
    }
    emitter.emit("dismissLoader");
  };

  const removeNetSuiteId = async (integrationMappingId: any) => {
    emitter.emit("presentLoader");
    try {
      await removeMapping(integrationMappingId);
      commonUtil.showToast(translate("NetSuite ID removed successfully"));
    } catch (error) {
      logger.error(error);
      commonUtil.showToast(translate("Failed to remove NetSuite ID"));
    }
    emitter.emit("dismissLoader");
  };

  return {
    // reads
    mappings, valueByKey, mappingByKey, hydrated,
    // raw writes
    addMapping, updateMapping, removeMapping, updateFacilityIdentification, updateEnumCode,
    setEnumGroupMembership, updateSftpConfig,
    refreshMappings,
    // prompt-driven helpers
    editNetSuiteId, addNetSuiteId, updateNetSuiteId, removeNetSuiteId,
  };
}
