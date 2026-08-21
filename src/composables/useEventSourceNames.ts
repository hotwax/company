import { api, commonUtil, logger } from "@common";
import { ref } from "vue";

/**
 * Turns an inventory event's `eventReferenceId` into the artifact a person recognises: the order it
 * came from, the operator who logged a variance, the name of the cycle count that produced it.
 *
 * The ledger row carries none of this. `ShopifyInventoryAdjustmentDetail` names a remote Shopify target
 * and a delta, and the reference is the SOURCE ROW'S natural key -- a receiptId, an itemIssuanceId, an
 * inventoryItemId plus a detail sequence. Which lookup resolves it therefore depends on the event type,
 * and there is no single endpoint that covers all of them. One resolver per family, dispatched on
 * eventTypeId, is the shape the data forces.
 *
 * Every path here was read from the live Swagger catalogs on this OMS
 * (rest/service.swagger/{oms,poorti,inventory-cycle-count}). Where a family has no path, it is recorded
 * as unresolved with the reason rather than left blank -- an operator asking "which order was that"
 * deserves "the OMS does not expose it" over silence.
 */

/** What a caller knows about one row before any lookup. */
export interface SourceLookup {
  eventTypeId: string;
  eventReferenceId: string;
  /** Parsed from decisionComment. Scopes the hard-scoped inventory-history mounts. */
  productId: string;
  /** The row's channel's member facilities, from cache. The same mounts need one of these too. */
  facilityIds: string[];
}

export interface ResolvedSource {
  /** The artifact, named. "Sales order SO-10042", "Weekly cycle count 42". */
  label: string;
  /** The person, where one is knowable. */
  actor?: string;
  /** One more fact worth a line: a reason, an outcome, a source system. */
  note?: string;
  /** Set instead of `label` when the OMS exposes no path. Explains why, never blank. */
  unresolved?: string;
}

/**
 * Results are keyed by type plus reference, not by ledger row: one receipt or one cycle count fans out
 * to a row per inventory item, and they all resolve to the same artifact. Keying on the row would make
 * the same call once per fan-out branch.
 */
function sourceKeyOf(eventTypeId: string, eventReferenceId: string): string {
  return `${eventTypeId}|${eventReferenceId}`;
}

const RECEIPT_TYPES = ["RECEIPT", "TRANSFER_RECEIPT", "RETURN_RESTOCK"];
const PHYSICAL_TYPES = ["PHYSICAL_INVENTORY", "CYCLE_COUNT"];

const sources = ref(new Map<string, ResolvedSource>());
/** Keys already requested, so a re-render or a cache sync cannot queue the same lookup twice. */
const requested = new Set<string>();
/** Names per userLoginId, resolved once. Several counts share an operator. */
const actors = new Map<string, string>();

async function get(url: string, params?: Record<string, unknown>): Promise<any> {
  const response: any = await api({ url, method: "get", params });
  if(commonUtil.hasError(response)) {throw response;}

  return response?.data;
}

/** Entity-list mounts on this OMS return a bare array, which is why the domain unwraps with a null key. */
function rows(data: unknown): any[] {
  return Array.isArray(data) ? data : [];
}

/** The order as a person cites it, falling back to the id when the header carries no name. */
function orderLabel(row: any): string {
  const name = String(row?.orderName ?? "").trim();
  const orderId = String(row?.orderId ?? "").trim();
  if(!name && !orderId) {return "";}
  const noun = row?.orderTypeId === "TRANSFER_ORDER" ? "Transfer order"
    : row?.orderTypeId === "PURCHASE_ORDER" ? "Purchase order"
      : "Sales order";

  return `${noun} ${name || orderId}`;
}

async function actorName(userLoginId: string): Promise<string> {
  const id = String(userLoginId ?? "").trim();
  if(!id) {return "";}
  if(actors.has(id)) {return actors.get(id) as string;}
  let name = id;
  try {
    const row = rows(await get("oms/users", { userLoginId: id, pageSize: 1 }))[0];
    const full = [row?.firstName, row?.lastName].filter(Boolean).join(" ").trim();
    name = full || String(row?.groupName ?? "").trim() || id;
  } catch (error) {
    logger.warn(`Could not resolve a name for user login ${id}`, error);
  }
  actors.set(id, name);

  return name;
}

/**
 * RESERVATION_CREATE / RESERVATION_RELEASE -- one call, no scan.
 *
 * The reference is `inventoryItemId:inventoryItemDetailSeqId`, which is exactly the path id plus the
 * filter this mount takes, so the row it describes is addressable directly. The only family where that
 * is true.
 */
async function resolveReservation(lookup: SourceLookup): Promise<ResolvedSource> {
  const [inventoryItemId, detailSeqId] = lookup.eventReferenceId.split(":");
  if(!inventoryItemId || !detailSeqId) {
    return { label: "", unresolved: "The reference is not an inventory item plus a detail sequence." };
  }
  const row = rows(await get(
    `oms/inventoryItem/${encodeURIComponent(inventoryItemId)}/detail`,
    { inventoryItemDetailSeqId: detailSeqId, pageSize: 1 }
  ))[0];
  const label = orderLabel(row);
  if(!label) {
    return { label: "", unresolved: "This reservation movement carries no order." };
  }

  return { label, note: row?.orderStatusId ? `Order status ${row.orderStatusId}` : undefined };
}

/**
 * PHYSICAL_INVENTORY / CYCLE_COUNT -- who, and which count.
 *
 * `varianceDecisions` is the one enrichment resource on this OMS that needs no path scope: it takes the
 * physicalInventoryId straight off the ledger reference. Its own contract describes it as bridging a
 * cycle-count variance to the decision that produced it, which is precisely the question here.
 *
 * A PHYSICAL_INVENTORY row is a MANUAL variance and has no count decision behind it, so an empty result
 * is the expected answer for half this family rather than a failure. The fallback -- the manual-variance
 * audit trail on inventoryItem/{id}/variances -- needs an inventoryItemId that only the decision would
 * have supplied, so a manual variance stops here and says so.
 */
async function resolvePhysical(lookup: SourceLookup): Promise<ResolvedSource> {
  const decision = rows(await get(
    "inventory-cycle-count/varianceDecisions",
    { physicalInventoryId: lookup.eventReferenceId, pageSize: 1 }
  ))[0];

  if(!decision) {
    return {
      label: "",
      unresolved: "No cycle count decision recorded, so this is a manual variance. Naming its operator " +
        "needs the inventory item, which only a count decision carries.",
    };
  }

  const countName = String(decision.workEffortName ?? "").trim();
  const actor = decision.decidedByUserLoginId ? await actorName(String(decision.decidedByUserLoginId)) : "";
  const counted = decision.countedQuantity;
  const system = decision.systemQuantity;
  const note = counted !== undefined && counted !== null && system !== undefined && system !== null
    ? `Counted ${counted} against a system quantity of ${system}`
    : String(decision.reasonEnumName ?? decision.outcomeEnumName ?? "").trim() || undefined;

  return {
    label: countName ? `Cycle count ${countName}` : `Cycle count ${decision.workEffortId ?? ""}`.trim(),
    actor: actor || undefined,
    note,
  };
}

/** EXTERNAL_RESET -- a direct read by primary key, the only family whose reference is a REST id. */
async function resolveExternalReset(lookup: SourceLookup): Promise<ResolvedSource> {
  const reset = await get(`poorti/externalInventoryResets/${encodeURIComponent(lookup.eventReferenceId)}`);
  if(!reset?.resetItemId) {
    return { label: "", unresolved: "The OMS has no external reset with this id." };
  }
  const source = String(reset.sourceSystemMessageRemoteId ?? "").trim();
  const external = String(reset.externalFacilityId ?? "").trim();

  return {
    label: `External reset ${reset.resetItemId}`,
    note: [source && `from ${source}`, external && `external facility ${external}`]
      .filter(Boolean).join(", ") || undefined,
  };
}

/**
 * RECEIPT / TRANSFER_RECEIPT / RETURN_RESTOCK / POS_ISSUANCE -- the families that need a scan.
 *
 * Both inventory-history mounts are scoped by path on purpose, so that "the InventoryItemDetail table
 * can never be scanned unfiltered". The consequence is that a receiptId alone cannot be looked up: it
 * takes a productId (which decisionComment gives) and a facilityId (which the ledger does not carry,
 * because the event is aggregate over a facility GROUP). So this walks the channel's member facilities
 * and stops at the first hit.
 *
 * That is affordable for one row a person opened and not for a whole list, which is why the caller has
 * to ask for it. See the enrichment map: a mount that accepts receiptId as its own scope would collapse
 * this to one call.
 */
async function resolveMovement(lookup: SourceLookup, filterField: string): Promise<ResolvedSource> {
  if(!lookup.productId) {
    return { label: "", unresolved: "No product on the calculation comment, so the scoped inventory-history mount cannot be called." };
  }
  if(!lookup.facilityIds.length) {
    return { label: "", unresolved: "The channel's facility group has no cached member facilities to search." };
  }

  for(const facilityId of lookup.facilityIds) {
    try {
      const row = rows(await get(
        `oms/products/${encodeURIComponent(lookup.productId)}/facilities/${encodeURIComponent(facilityId)}/inventoryDetail`,
        { [filterField]: lookup.eventReferenceId, pageSize: 1 },
      ))[0];
      if(!row) {continue;}
      const order = orderLabel(row);
      const returnId = String(row?.returnId ?? "").trim();
      const shipmentId = String(row?.shipmentId ?? "").trim();
      const label = order || (returnId && `Customer return ${returnId}`) ||
        (shipmentId && `Shipment ${shipmentId}`) || "";
      if(!label) {
        return { label: "", unresolved: "The movement row names no order, return or shipment." };
      }
      // Whichever of the three did not become the label, when it adds something.
      const note = [order && returnId && `return ${returnId}`, order && shipmentId && `shipment ${shipmentId}`]
        .filter(Boolean).join(", ");

      return { label, note: note || undefined };
    } catch (error) {
      // One unreachable facility must not end the walk: the movement may sit at the next one.
      logger.warn(`Inventory history lookup failed at facility ${facilityId}`, error);
    }
  }

  return { label: "", unresolved: "No movement row for this reference at any of the channel's facilities." };
}

function resolverFor(eventTypeId: string, fanOut: boolean) {
  if(eventTypeId.startsWith("RESERVATION_")) {return resolveReservation;}
  if(PHYSICAL_TYPES.includes(eventTypeId)) {return resolvePhysical;}
  if(eventTypeId === "EXTERNAL_RESET") {return resolveExternalReset;}
  if(RECEIPT_TYPES.includes(eventTypeId)) {
    return fanOut ? (l: SourceLookup) => resolveMovement(l, "receiptId") : null;
  }
  if(eventTypeId === "POS_ISSUANCE") {
    return fanOut ? (l: SourceLookup) => resolveMovement(l, "itemIssuanceId") : null;
  }

  // The configuration families name no document. Their references decode locally to ids the app already
  // holds, and the audit-keyed ones cannot be looked up at all -- entityAuditLogs filters on the changed
  // entity and its PK values, neither of which the ledger keeps. Neither case belongs here.
  return null;
}

/**
 * Resolve what is not already known. Safe to call on every render: it filters against `requested` first,
 * so a stable set of rows is one round of calls and a background cache sync is none.
 *
 * `fanOut` opts into the facility walk for the receipt and issuance families. Leave it off for lists.
 */
async function resolve(lookups: SourceLookup[], opts: { fanOut?: boolean } = {}): Promise<void> {
  const fanOut = !!opts.fanOut;
  const pending = new Map<string, SourceLookup>();
  for(const lookup of lookups) {
    const key = sourceKeyOf(lookup.eventTypeId, lookup.eventReferenceId);
    if(requested.has(key) || pending.has(key)) {continue;}
    if(!resolverFor(lookup.eventTypeId, fanOut)) {continue;}
    pending.set(key, lookup);
  }
  if(!pending.size) {return;}

  for(const [key, lookup] of pending) {
    requested.add(key);
    const resolver = resolverFor(lookup.eventTypeId, fanOut);
    if(!resolver) {continue;}
    try {
      const resolved = await resolver(lookup);
      sources.value = new Map(sources.value).set(key, resolved);
    } catch (error) {
      logger.warn(`Could not resolve the source artifact for ${key}`, error);
      // Let it be retried: a transient failure should not permanently mark the row unresolvable.
      requested.delete(key);
    }
  }
}

export function useEventSourceNames() {
  return { sources, resolve, sourceKeyOf };
}
