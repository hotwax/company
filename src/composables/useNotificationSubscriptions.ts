import { api, commonUtil, logger } from "@common";
import { computed, reactive, ref } from "vue";
import { useFacilities } from "./useFacilities";

/**
 * Push-notification subscription reconciliation.
 *
 * WHAT THIS CAN AND CANNOT SEE, because the shape of the page depends entirely on it:
 *
 * The OMS stores notification interest and device registrations in two places that CANNOT be
 * joined:
 *   - `moqui.security.user.NotificationTopicUser`  keyed by (topic, userId)
 *   - `co.hotwax.firebase.UserLoginFirebaseClient` keyed by (userLoginId, deviceId, applicationId)
 * There is no topic column on the token table and no device column on the topic table. The two
 * key on different identifiers as well — `userId` versus `userLoginId` (the username) — so even
 * the transitive hop through a person is loose. The authoritative token-to-topic mapping lives
 * only inside Google's FCM servers and is not readable in bulk by any API; FCM can only answer
 * "which topics does THIS token belong to", one token at a time, via the Instance ID API.
 *
 * On top of that, `UserLoginFirebaseClient` is not exposed by any REST resource anywhere in the
 * platform, so device counts are unreachable from an app without new backend work.
 *
 * So this composable reports the ONE layer that is actually queryable today: who has asked to be
 * notified about what. That is the layer that answers "is this store user subscribed at all",
 * which is the first question in every notification investigation. The device layer and the FCM
 * confirmation layer are surfaced as explicitly unavailable rather than rendered as zero, because
 * showing 0 devices when the number is simply unknowable reads as a healthy empty state and sends
 * people looking in the wrong place.
 */

/** Applications that ship push notifications, and the enum type holding their event catalog. */
export const NOTIFICATION_APPS = [
  { applicationId: "BOPIS", enumTypeId: "NOTIF_BOPIS", label: "BOPIS" },
  { applicationId: "FULFILLMENT", enumTypeId: "NOTIF_FULFILLMENT", label: "Fulfillment" },
  { applicationId: "RECEIVING", enumTypeId: "NOTIF_RECEIVING", label: "Receiving" }
] as const;

export type NotificationApp = (typeof NOTIFICATION_APPS)[number];

export type SubscriptionRow = {
  topic: string;
  userId: string;
  receiveNotifications?: string;
  description?: string;
};

/** A topic broken back into the parts the client encoded into its name. */
export type ParsedTopic = {
  topic: string;
  omsInstance: string;
  facilityId: string;
  enumId: string;
  /** False when the name did not match a known event, so the split is a guess. */
  recognised: boolean;
};

export type TopicSummary = ParsedTopic & {
  eventName: string;
  /** Cached facility name when the id resolves, otherwise the raw id. */
  facilityName: string;
  userIds: string[];
  /** Resolved display names, index-aligned with userIds. */
  userNames: string[];
};

const state = reactive({
  applicationId: "BOPIS" as string,
  loading: false,
  /** Null means "not attempted yet"; an empty array means "asked, got nothing". */
  subscriptions: null as SubscriptionRow[] | null,
  events: [] as any[],
  error: null as string | null,
  /**
   * True when every row we got back belongs to the signed-in user. The endpoint is a plain entity
   * list, so whether an administrator sees the whole tenant or only themselves depends on server
   * authz we cannot inspect from here. Surfacing the ambiguity beats quietly reporting one user's
   * subscriptions as though they were the tenant's.
   */
  looksSelfScoped: false,
  /*
   * Filters are client side by design. Every subscription for the selected app is already in
   * memory from one request, so narrowing is a local predicate — no refetch, no server round
   * trip, and the counts stay consistent with what is on screen.
   */
  filters: {
    facilityId: "",
    userId: "",
    search: ""
  }
});

/**
 * Split `<omsInstance>-<facilityId>-<enumId>` back into its parts.
 *
 * Naive splitting on "-" is wrong: the OMS instance name routinely contains hyphens
 * ("lovers-uat"). Event ids never do, they use underscores, so matching a KNOWN event id as a
 * suffix is reliable. Only the facility boundary is then assumed, by taking the last remaining
 * segment, which holds for numeric facility ids.
 */
export function parseTopicName(topic: string, knownEnumIds: string[]): ParsedTopic {
  const enumId = knownEnumIds.find((candidate) => topic.endsWith(`-${candidate}`));

  if (!enumId) {
    const parts = topic.split("-");
    return {
      topic,
      enumId: parts.length ? parts[parts.length - 1] : topic,
      facilityId: parts.length > 1 ? parts[parts.length - 2] : "",
      omsInstance: parts.slice(0, -2).join("-"),
      recognised: false
    };
  }

  const prefix = topic.slice(0, topic.length - enumId.length - 1);
  const boundary = prefix.lastIndexOf("-");

  return {
    topic,
    enumId,
    facilityId: boundary === -1 ? "" : prefix.slice(boundary + 1),
    omsInstance: boundary === -1 ? prefix : prefix.slice(0, boundary),
    recognised: true
  };
}

async function loadEvents(enumTypeId: string) {
  try {
    const resp: any = await api({
      url: "admin/enums",
      method: "get",
      params: { enumTypeId, pageSize: 200 }
    });
    if (commonUtil.hasError(resp)) throw resp.data;
    state.events = Array.isArray(resp.data) ? resp.data : [];
  } catch (error) {
    // The event catalog only supplies friendly labels and the suffix list used for parsing.
    // Losing it degrades naming, it must not take the page down.
    logger.error(error);
    state.events = [];
  }
}

async function loadSubscriptions(applicationId: string, currentUserId?: string) {
  try {
    const resp: any = await api({
      url: "firebase/user/notificationtopic",
      method: "get",
      params: { topicTypeId: applicationId, pageSize: 500 }
    });
    if (commonUtil.hasError(resp)) throw resp.data;

    const rows: SubscriptionRow[] = Array.isArray(resp.data) ? resp.data : [];
    state.subscriptions = rows;
    state.looksSelfScoped =
      !!currentUserId && rows.length > 0 && rows.every((row) => row.userId === currentUserId);
  } catch (error: any) {
    logger.error(error);
    // Distinguished from an empty result on purpose: the page renders "unavailable", not "none".
    state.subscriptions = null;
    state.error = error?.message || "Subscriptions could not be read";
  }
}

/**
 * Resolve display names for the ids on subscriptions.
 *
 * NOTE: subscriptions carry `userId`, while `oms/users` filters on `userLoginId` (the username).
 * On instances where those differ, a lookup simply misses and the raw id is shown rather than a
 * wrong name. Matching the established bulk pattern in `useShopifyTransferSyncEnrichment`.
 */
async function fetchUserNames(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  try {
    const resp: any = await api({
      url: "oms/users",
      method: "GET",
      params: {
        userLoginId: ids,
        userLoginId_op: "in",
        fieldsToSelect: ["userLoginId", "firstName", "middleName", "lastName", "groupName"],
        pageSize: ids.length
      }
    });
    if (commonUtil.hasError(resp)) throw resp.data;

    const rows: any[] = Array.isArray(resp.data) ? resp.data : [];
    return rows.reduce((names: Record<string, string>, row: any) => {
      const full = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
      const label = full || String(row.groupName ?? "").trim();
      if (row.userLoginId && label) names[row.userLoginId] = label;
      return names;
    }, {});
  } catch (error) {
    // Names are decoration: a failed lookup must leave the ids readable, not blank the page.
    logger.error(error);
    return {};
  }
}

export function useNotificationSubscriptions() {
  const { facilities } = useFacilities();
  const userNames = ref<Record<string, string>>({});

  const facilityNameById = computed(() =>
    facilities.value.reduce((names: Record<string, string>, facility: any) => {
      if (facility?.facilityId) names[facility.facilityId] = facility.facilityName || facility.facilityId;
      return names;
    }, {})
  );
  const knownEnumIds = computed(() => state.events.map((event: any) => event.enumId));

  const eventNameById = computed(() =>
    state.events.reduce((names: Record<string, string>, event: any) => {
      names[event.enumId] = event.description || event.enumName || event.enumId;
      return names;
    }, {})
  );

  /** One row per topic, with the users subscribed to it. */
  const topics = computed<TopicSummary[]>(() => {
    if (!state.subscriptions) return [];

    const byTopic = new Map<string, TopicSummary>();
    for (const row of state.subscriptions) {
      if (!row?.topic) continue;

      let summary = byTopic.get(row.topic);
      if (!summary) {
        const parsed = parseTopicName(row.topic, knownEnumIds.value);
        summary = {
          ...parsed,
          eventName: eventNameById.value[parsed.enumId] || parsed.enumId,
          facilityName: facilityNameById.value[parsed.facilityId] || parsed.facilityId,
          userIds: [],
          userNames: []
        };
        byTopic.set(row.topic, summary);
      }
      if (row.userId && !summary.userIds.includes(row.userId)) {
        summary.userIds.push(row.userId);
        summary.userNames.push(userNames.value[row.userId] || row.userId);
      }
    }

    return [...byTopic.values()].sort(
      (a, b) => a.facilityId.localeCompare(b.facilityId) || a.enumId.localeCompare(b.enumId)
    );
  });

  /** Everything matching the current filters. The summary counts are computed over this. */
  const filteredTopics = computed<TopicSummary[]>(() => {
    const { facilityId, userId, search } = state.filters;
    const needle = search.trim().toLowerCase();

    return topics.value.filter((topic) => {
      if (facilityId && topic.facilityId !== facilityId) return false;
      if (userId && !topic.userIds.includes(userId)) return false;
      if (!needle) return true;
      // Search spans what a person would actually type: topic, event, facility, and any subscriber.
      return [topic.topic, topic.eventName, topic.enumId, topic.facilityId, topic.facilityName, ...topic.userNames, ...topic.userIds]
        .some((value) => String(value ?? "").toLowerCase().includes(needle));
    });
  });

  /** Facilities present in the data, so the picker can never select an empty result. */
  const facilityOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const topic of topics.value) {
      if (topic.facilityId && !seen.has(topic.facilityId)) seen.set(topic.facilityId, topic.facilityName);
    }
    return [...seen.entries()]
      .map(([facilityId, facilityName]) => ({ facilityId, facilityName }))
      .sort((a, b) => a.facilityName.localeCompare(b.facilityName));
  });

  const userOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const topic of topics.value) {
      topic.userIds.forEach((id, index) => {
        if (!seen.has(id)) seen.set(id, topic.userNames[index] || id);
      });
    }
    return [...seen.entries()]
      .map(([userId, userName]) => ({ userId, userName }))
      .sort((a, b) => a.userName.localeCompare(b.userName));
  });

  const hasActiveFilters = computed(
    () => !!(state.filters.facilityId || state.filters.userId || state.filters.search.trim())
  );

  function clearFilters() {
    state.filters.facilityId = "";
    state.filters.userId = "";
    state.filters.search = "";
  }

  const facilityCount = computed(() => new Set(filteredTopics.value.map((topic) => topic.facilityId)).size);

  const userCount = computed(
    () => new Set(filteredTopics.value.flatMap((topic) => topic.userIds)).size
  );

  /** Events defined for the app that nobody anywhere has subscribed to. */
  const unsubscribedEvents = computed(() => {
    const subscribed = new Set(topics.value.map((topic) => topic.enumId));
    return state.events.filter((event: any) => !subscribed.has(event.enumId));
  });

  async function load(applicationId: string, currentUserId?: string) {
    const app = NOTIFICATION_APPS.find((entry) => entry.applicationId === applicationId);
    if (!app) return;

    state.applicationId = applicationId;
    state.loading = true;
    state.error = null;
    state.subscriptions = null;

    // Events first: topic parsing needs the known event ids to split names reliably.
    await loadEvents(app.enumTypeId);
    await loadSubscriptions(applicationId, currentUserId);

    // Annotated explicitly: `reactive()` widens the nullable array and `?? []` would otherwise
    // infer `never[]`, losing the row type.
    const rows: SubscriptionRow[] = state.subscriptions ?? [];
    const ids = [...new Set(rows.map((row) => row.userId).filter(Boolean))];
    userNames.value = await fetchUserNames(ids);

    state.loading = false;
  }

  return {
    state,
    userNames,
    topics,
    filteredTopics,
    facilityOptions,
    userOptions,
    hasActiveFilters,
    clearFilters,
    facilityCount,
    userCount,
    unsubscribedEvents,
    load
  };
}
