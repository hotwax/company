<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="connectionDetailsHref" />
        </ion-buttons>
        <ion-title>{{ translate("Fulfillment sync") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="fulfillment-sync-page">
      <main class="fulfillment-sync-content">
        <section class="sync-summary">
          <ion-card class="jobs-summary" aria-label="Fulfillment sync jobs">
            <ion-card-header><ion-card-title>{{ translate('Sync jobs') }}</ion-card-title></ion-card-header>
            <ion-list>
              <ion-item v-if="!jobsHydrated"><ion-label><ion-skeleton-text animated /></ion-label></ion-item>
              <ion-item v-for="job in fulfillmentJobs" :key="job.jobName" button detail @click="selectedSyncJob = job">
                <ion-icon slot="start" :icon="timeOutline" />
                <ion-label class="ion-text-wrap"><h2>{{ translate(isRetryJob(job) ? 'Send queued fulfillments' : 'Find missed fulfillments') }}</h2><p>{{ job.jobName }}</p><p>{{ scheduleLabel({ cron: job.cronExpression }) }}</p><p v-if="job.paused !== 'Y' && job.cronExpression && job.nextExecutionDateTime">{{ translate('Next run') }}: {{ formatDateTime(job.nextExecutionDateTime) }}</p></ion-label>
                <ion-badge slot="end" :color="job.paused === 'Y' || !job.cronExpression ? 'warning' : 'success'">{{ translate(job.paused === 'Y' ? 'Paused' : job.cronExpression ? 'Scheduled' : 'Not scheduled') }}</ion-badge>
              </ion-item>
              <ion-item v-if="jobsHydrated && !fulfillmentJobs.length"><ion-label>{{ translate('No fulfillment sync jobs configured') }}</ion-label></ion-item>
            </ion-list>
          </ion-card>
          <ion-card class="recent-summary" aria-label="Fulfillment sync health">
            <ion-card-header><ion-card-title>{{ translate('Sync health') }}</ion-card-title><ion-card-subtitle>{{ translate('All shipments shipped in the last 24 hours for this shop') }}</ion-card-subtitle></ion-card-header>
            <ion-list lines="full" v-if="syncHealth?.state === 'ready'">
              <ion-item><ion-label>{{ translate('Shipments shipped') }}</ion-label><ion-label slot="end">{{ syncHealth.shippedCount }}</ion-label></ion-item>
              <ion-item><ion-label>{{ translate('Synced to Shopify') }}</ion-label><ion-label slot="end">{{ syncHealth.syncedCount }}</ion-label></ion-item>
              <ion-item><ion-label>{{ translate('Unsynced with errors') }}</ion-label><ion-label slot="end"><ion-text :color="syncHealth.unsyncedErrorCount ? 'warning' : undefined">{{ syncHealth.unsyncedErrorCount }}</ion-text></ion-label></ion-item>
              <ion-item><ion-label>{{ translate('Pending sync') }}<p>{{ translate('No sync error recorded; includes queued shipments') }}</p></ion-label><ion-label slot="end">{{ syncHealth.pendingCount }}</ion-label></ion-item>
              <ion-item-divider><ion-label>{{ translate('Recent throughput') }}</ion-label></ion-item-divider>
              <ion-item lines="none"><ion-label>{{ translate('Synced in the last hour') }}<p>{{ translate('Includes shipments shipped before the last 24 hours') }}</p></ion-label><ion-label slot="end">{{ syncHealth.syncedLastHourCount }}</ion-label></ion-item>
            </ion-list>
            <ion-item v-else-if="syncHealth?.state === 'error'"><ion-label>{{ translate('Sync health could not be loaded') }}</ion-label></ion-item>
            <ion-item v-else><ion-label><ion-skeleton-text animated /></ion-label></ion-item>
          </ion-card>
        </section>

        <FulfillmentOrderSearch :shop-id="String(props.id)" v-model="selectedOrders" />
        <ion-card v-if="selectedOrders.length">
          <ion-item><ion-label>{{ translate('Sync history for selected orders') }}<p>{{ translate('All recorded sync messages; no date limit') }}</p></ion-label><ion-button slot="end" fill="clear" @click="syncNow()">{{ translate('Refresh') }}</ion-button></ion-item>
          <ion-item v-if="orderHistory.error.value"><ion-label>{{ translate('Order sync history could not be loaded. Refresh to retry.') }}</ion-label></ion-item>
          <ion-item v-else-if="!orderHistory.ready.value"><ion-label><ion-skeleton-text animated /></ion-label></ion-item>
          <ion-accordion-group v-else>
            <ion-accordion v-for="(history, index) in orderHistory.histories.value" :key="history.historyKey" :value="history.orderId">
              <ion-item slot="header"><ion-label>{{ selectedOrders[index].orderName || history.orderId }}</ion-label><ion-note slot="end">{{ history.messages.length }} {{ translate('Sync messages') }}</ion-note></ion-item>
              <ion-list slot="content">
                <ion-item v-for="message in history.messages" :key="message.systemMessageId">
                  <ion-label class="ion-text-wrap"><h2>{{ message.systemMessageId }} / {{ parseFulfillmentMessageText(message.messageText).shipmentId }}</h2><p>{{ translate('Created') }}: {{ formatDateTime(message.initDate) }}</p><p v-if="message.lastAttemptDate">{{ translate('Last attempt') }}: {{ formatDateTime(message.lastAttemptDate) }}</p><p v-if="message.remoteMessageId">{{ translate('Fulfillment') }}: {{ message.remoteMessageId }}</p><p v-for="error in history.errors.filter((row: any) => row.systemMessageId === message.systemMessageId)" :key="`${error.systemMessageId}:${error.errorDate}`">{{ formatDateTime(error.errorDate) }}: {{ error.errorText }}</p></ion-label>
                  <ion-badge slot="end" :color="message.statusId === 'SmsgSent' ? 'success' : message.failCount ? 'warning' : 'medium'">{{ messageStatusLabel(message.statusId) }}</ion-badge>
                </ion-item>
                <ion-item v-if="!history.messages.length"><ion-label>{{ translate('No fulfillment sync messages recorded for this order.') }}</ion-label></ion-item>
              </ion-list>
            </ion-accordion>
          </ion-accordion-group>
        </ion-card>

        <ion-segment v-model="segment">
          <ion-segment-button value="pending">
            <ion-label>{{ translate("Pending") }} ({{ pendingCount }})</ion-label>
          </ion-segment-button>
          <ion-segment-button value="queued">
            <ion-label>{{ queuedSegmentLabel }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="synced">
            <ion-label>{{ syncedSegmentLabel }}</ion-label>
          </ion-segment-button>
        </ion-segment>

        <template v-if="segment === 'pending'">
          <ion-note class="segment-scope">{{ translate("Shipped shipments awaiting Shopify sync, without an active queued message.") }}</ion-note>
          <ion-card v-if="pendingStatus?.state === 'error'"><ion-card-content>{{ translate("Pending shipments could not be loaded.") }}</ion-card-content></ion-card>
          <ion-card v-else-if="!pendingReady"><ion-card-content><ion-skeleton-text animated /></ion-card-content></ion-card>
          <template v-else>
            <ion-note v-if="pendingStatus?.hasMore === 'Y'">{{ translate("Showing the oldest 200 outstanding shipments. More may be pending.") }}</ion-note>
            <FulfillmentShipmentCard v-for="card in displayedPendingCards" :key="card.key" :row="card.row" :show-items="false" :state="sendResultState(card.row.shipmentId) || { label: translate('Awaiting sync'), color: 'warning' }"><template #attention><FulfillmentSendResult :result="sendResults[card.row.shipmentId]" @view="viewSendDestination($event)" /><FulfillmentDiagnosis mode="pending" retry-label="Send now" :busy="!!retryingId || ['sending', 'success'].includes(sendResults[card.row.shipmentId]?.status)" @retry="requestPendingSend(card.row)" :items="card.row.items" :facility="card.row.facility" :shop-id="String(props.id)" :shipment-id="card.row.shipmentId" /></template></FulfillmentShipmentCard>
            <ion-card v-if="!displayedPendingCards.length"><ion-card-content>{{ translate("No pending shipments in this window.") }}</ion-card-content></ion-card>
          </template>
        </template>

        <!-- Queued is the message view: a CreateShopifyFulfillment message on this shop's remotes
             that has not reached SmsgSent. Its stored text and its error rows are the whole point. -->
        <template v-else-if="segment === 'queued'">
          <ion-note color="medium" class="segment-scope">
            {{ translate("Review failed syncs first, resolve the cause, then retry when appropriate.") }}
          </ion-note>
          <ion-card v-if="!queuedHydrated">
            <ion-item lines="none">
              <ion-label>
                <p><ion-skeleton-text animated style="width: 30%" /></p>
                <ion-skeleton-text animated style="width: 45%" />
              </ion-label>
            </ion-item>
            <ion-card-content>
              <ion-skeleton-text animated style="width: 70%" />
            </ion-card-content>
          </ion-card>
          <template v-else>
            <ion-segment v-model="queueFilter" scrollable aria-label="Filter sync attempts">
              <ion-segment-button v-for="filter in queueFilters" :key="filter.key" :value="filter.key"><ion-label>{{ translate(filter.label) }} ({{ filter.count }})</ion-label></ion-segment-button>
            </ion-segment>
            <FulfillmentShipmentCard
              v-for="card in displayedQueuedCards"
              :key="card.key"
              :row="card.row" :show-items="false"
              :state="sendResultState(card.row.shipmentId) || card.state"
            >
              <template #attention>
              <FulfillmentSendResult :result="sendResults[card.row.shipmentId]" @view="viewSendDestination($event)" />
              <ion-item v-if="card.message.statusId === 'SmsgSending'" lines="none">
                <ion-icon slot="start" :icon="card.message.statusId === 'SmsgError' ? alertCircleOutline : timeOutline" :color="card.state.color" />
                <ion-label class="ion-text-wrap"><p>{{ translate(retryState(card.message).detail) }}</p></ion-label>
              </ion-item>
              <FulfillmentDiagnosis mode="queued" :items="card.row.items" :facility="card.row.facility" :shop-id="String(props.id)" :shipment-id="card.row.shipmentId" :message-id="card.message.systemMessageId" :version="String(card.message.failCount) + card.message.statusId" retry-label="Send now" :busy="!!retryingId || ['sending', 'success'].includes(sendResults[card.row.shipmentId]?.status) || card.message.statusId === 'SmsgSending'" @retry="requestQueuedRecovery(card.message)" @diagnosed="rememberDiagnosis(card.message, $event)" />

              </template>
              <template #default>
              <ion-accordion-group @ionChange="onQueuedAccordionChange(card.message, $event)">
                <ion-accordion value="messageText">
                  <ion-item slot="header" lines="full">
                    <ion-label>{{ translate("Message text") }}</ion-label>
                    <ion-note slot="end">{{ card.message.systemMessageTypeId }}</ion-note>
                  </ion-item>
                  <div slot="content" class="accordion-content">
                    <pre><code>{{ prettyMessageText(card.message.messageText) }}</code></pre>
                  </div>
                </ion-accordion>

                <!-- Technical evidence remains available below the diagnosis. -->
                <ion-accordion value="errors">
                  <ion-item slot="header" lines="full">
                    <ion-label>{{ translate("System message errors") }}</ion-label>
                    <ion-note v-if="errorsFor(card.message.systemMessageId).length" slot="end">
                      {{ errorsFor(card.message.systemMessageId).length }}
                    </ion-note>
                  </ion-item>
                  <div slot="content">
                    <ion-item
                      v-for="(error, index) in errorsFor(card.message.systemMessageId)"
                      :key="index"
                      lines="full"
                    >
                      <ion-label class="ion-text-wrap">
                        <p>{{ formatDateTime(error.errorDate) }}</p>
                        {{ error.errorText }}
                      </ion-label>
                      <ion-note slot="end">{{ error.attemptedStatusId }}</ion-note>
                    </ion-item>
                    <ion-item v-if="loadingErrorIds.includes(card.message.systemMessageId)" lines="none">
                      <ion-label><ion-skeleton-text animated style="width: 60%" /></ion-label>
                    </ion-item>
                    <ion-item v-else-if="!errorsFor(card.message.systemMessageId).length" lines="none">
                      <ion-label>{{ translate("No errors recorded for this message.") }}</ion-label>
                    </ion-item>
                  </div>
                </ion-accordion>
              </ion-accordion-group>
              </template>
            </FulfillmentShipmentCard>
            <ion-card v-if="!displayedQueuedCards.length">
              <ion-card-content>{{ translate("No syncs in this category.") }}</ion-card-content>
            </ion-card>
          </template>
        </template>

        <!-- Synced is the fulfillment history feed. A history row holds no systemMessageId, so there
             is no message text or error list; what confirms a push is Shopify's own record of the
             fulfillment, fetched when a card is opened. displayStatus carries the lifecycle stage and
             status carries whether it still counts, so the badge shows the first coloured by the
             second — and no badge at all until Shopify has actually answered. -->
        <template v-else>
          <ion-note color="medium" class="segment-scope">
            {{ translate("Fulfillments recorded against this shop, newest first, read back from Shopify.") }}
          </ion-note>
          <ion-card v-if="!syncedHydrated">
            <ion-item lines="none">
              <ion-label>
                <p><ion-skeleton-text animated style="width: 30%" /></p>
                <ion-skeleton-text animated style="width: 45%" />
              </ion-label>
            </ion-item>
            <ion-card-content>
              <ion-skeleton-text animated style="width: 70%" />
            </ion-card-content>
          </ion-card>
          <!-- 404 from the probe, remembered by the worker: the OMS cannot answer, which must not
               render as "nothing has synced". -->
          <ion-card v-else-if="endpointMissing">
            <ion-card-header>
              <ion-card-title>{{ translate("Fulfillment history is not available on this OMS") }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              {{ translate("This OMS does not expose GET sob/shopify/fulfillmentHistories yet.") }}
              {{ translate("The endpoint ships with a pending connector change; this segment fills in once it is deployed.") }}
            </ion-card-content>
          </ion-card>
          <template v-else>
            <FulfillmentShipmentCard
              v-for="card in syncedCards"
              :key="card.key"
              v-lazy-fulfillment="card.source"
              :row="card.row" :show-items="false"
              :state="sendResultState(card.row.shipmentId) || card.state"
            >
              <template #attention><FulfillmentDiagnosis mode="synced" :items="card.row.items" :facility="card.row.facility" :shop-id="String(props.id)" :shipment-id="card.row.shipmentId" /></template>
              <template #default>
              <ion-item-divider>
                <ion-label>{{ translate("Shopify") }}</ion-label>
                <ion-button slot="end" fill="clear" :disabled="downloadingSnapshots.has(card.key)" @click="downloadShopifySnapshot(card.source)">
                  {{ translate(downloadingSnapshots.has(card.key) ? "Fetching Shopify JSON…" : "Download current JSON") }}
                </ion-button>
              </ion-item-divider>
              <template v-if="card.details">
                <div class="detail-facts">
                  <ion-item lines="none">
                    <ion-label class="ion-text-wrap">
                      <p>{{ translate("Fulfillment") }}</p>
                      {{ card.details.name }}
                      <p v-if="card.details.createdAt">{{ translate("Created") }}: {{ formatDateTime(card.details.createdAt) }}</p>
                    </ion-label>
                  </ion-item>
                  <ion-item lines="none">
                    <ion-label>
                      <p>{{ translate("status") }}</p>
                      {{ card.details.status }}
                    </ion-label>
                  </ion-item>
                  <ion-item v-if="card.details.locationName" lines="none">
                    <ion-label class="ion-text-wrap">
                      <p>{{ translate("Fulfilled from") }}</p>
                      {{ card.details.locationName }}
                    </ion-label>
                  </ion-item>
                  <ion-item lines="none">
                    <ion-label>
                      <p>{{ translate("Quantity") }}</p>
                      {{ card.details.totalQuantity }}
                    </ion-label>
                  </ion-item>
                  <ion-item v-if="card.details.inTransitAt" lines="none">
                    <ion-label>
                      <p>{{ translate("In transit") }}</p>
                      {{ formatDateTime(card.details.inTransitAt) }}
                    </ion-label>
                  </ion-item>
                  <ion-item v-if="card.details.estimatedDeliveryAt" lines="none">
                    <ion-label>
                      <p>{{ translate("Estimated delivery") }}</p>
                      {{ formatDateTime(card.details.estimatedDeliveryAt) }}
                    </ion-label>
                  </ion-item>
                  <ion-item v-if="card.details.deliveredAt" lines="none">
                    <ion-label>
                      <p>{{ translate("Delivered") }}</p>
                      {{ formatDateTime(card.details.deliveredAt) }}
                    </ion-label>
                  </ion-item>
                </div>

                <!-- The order-level view: whether anything is still owed, and what is blocking it. -->
                <template v-for="(order, index) in card.details.fulfillmentOrders.filter(order => order.fulfillBy || order.destination || order.holds.length)" :key="index">
                  <ion-item-divider>
                    <ion-label>{{ translate("Fulfillment order") }}</ion-label>
                  </ion-item-divider>
                  <div class="detail-facts">
                    <ion-item v-if="order.fulfillBy" lines="none">
                      <ion-label>
                        <p>{{ translate("Fulfill by") }}</p>
                        {{ formatDateTime(order.fulfillBy) }}
                      </ion-label>
                    </ion-item>
                    <ion-item v-if="order.destination" lines="none">
                      <ion-label class="ion-text-wrap">
                        <p>{{ translate("Destination") }}</p>
                        {{ order.destination }}
                      </ion-label>
                    </ion-item>
                  </div>
                  <ion-item v-if="order.holds.length" lines="none">
                    <ion-label class="ion-text-wrap">
                      <p>{{ translate("Holds") }}</p>
                      {{ order.holds.join(", ") }}
                    </ion-label>
                    <ion-badge slot="end" color="warning">{{ translate("On hold") }}</ion-badge>
                  </ion-item>
                </template>
              </template>
              <ion-item v-else-if="card.detail?.state === 'unavailable'" lines="none">
                <ion-label class="ion-text-wrap">
                  {{ translate("Shopify could not be reached for this fulfillment.") }}
                </ion-label>
              </ion-item>
              <ion-item v-else-if="card.detail?.state === 'loading'" lines="none">
                <ion-label><ion-skeleton-text animated style="width: 60%" /></ion-label>
              </ion-item>

              <ion-accordion-group @ionChange="onSyncedAccordionChange(card.source, $event)">
                  <ion-accordion v-if="card.details" value="deliveryEvents">
                    <ion-item slot="header"><ion-label>{{ translate("Delivery events") }}</ion-label><ion-note slot="end">{{ card.details.events.length }}</ion-note></ion-item>
                    <ion-list slot="content" lines="full">
                  <ion-item v-for="(event, index) in [...card.details.events].reverse()" :key="index">
                    <ion-label class="ion-text-wrap"><p>{{ formatDateTime(event.happenedAt) }}</p>{{ event.message || event.status }}</ion-label>
                    <ion-note slot="end">{{ event.status }}</ion-note>
                  </ion-item>
                  <ion-item v-if="!card.details.events.length"><ion-label>{{ translate("Shopify has recorded no delivery events yet.") }}</ion-label></ion-item>
                  <ion-item v-if="card.details.updatedAt && card.details.updatedAt !== card.details.createdAt">
                    <ion-label><p>{{ formatDateTime(card.details.updatedAt) }}</p>{{ translate("Fulfillment last updated in Shopify") }}</ion-label>
                  </ion-item>
                    </ion-list>
                  </ion-accordion>

                <ion-accordion value="tracking">
                  <ion-item slot="header" lines="full">
                    <ion-label>{{ translate("Tracking") }}</ion-label>
                    <ion-note v-if="card.details" slot="end">{{ card.details.trackingInfo.length }}</ion-note>
                  </ion-item>
                  <div slot="content">
                    <template v-if="card.details">
                      <ion-item v-for="(tracking, index) in card.details.trackingInfo" :key="index" lines="full">
                        <ion-label class="ion-text-wrap">
                          <p>{{ tracking.company }}</p>
                          {{ tracking.number }}
                        </ion-label>
                      </ion-item>
                      <ion-item v-if="!card.details.trackingInfo.length" lines="none">
                        <ion-label>{{ translate("Shopify holds no tracking for this fulfillment.") }}</ion-label>
                      </ion-item>
                    </template>
                  </div>
                </ion-accordion>

                <ion-accordion value="lineItems">
                  <ion-item slot="header" lines="full">
                    <ion-label>{{ translate("Items") }}</ion-label>
                    <ion-note v-if="card.details" slot="end">{{ card.details.lineItems.length }}</ion-note>
                  </ion-item>
                  <div slot="content">
                    <template v-if="card.details">
                      <ion-item v-for="(line, index) in card.details.lineItems" :key="index" lines="full">
                        <ion-label class="ion-text-wrap">
                          <p>{{ line.sku }}</p>
                          {{ line.name }}
                        </ion-label>
                        <ion-note slot="end">{{ line.quantity }}</ion-note>
                      </ion-item>
                    </template>
                  </div>
                </ion-accordion>
              </ion-accordion-group>
              </template>
            </FulfillmentShipmentCard>
            <ion-card v-if="!syncedCards.length">
              <ion-card-content>{{ translate("Nothing has synced yet.") }}</ion-card-content>
            </ion-card>
          </template>
        </template>

        <ServiceJobDetailsModal
          :is-open="!!selectedSyncJob"
          :job-name="selectedSyncJob?.jobName || ''"
          :title="translate('Sync job')"
          :parameter-description="translate('Configuration for this fulfillment sync job. Shared retry jobs affect other integrations too.')"
          :protected-parameter-names="['shopId', 'configId', 'systemMessageRemoteId', 'systemMessageTypeId', 'systemMessageTypeIds']"
          @updated="syncNow()"
          @close="selectedSyncJob = null"
        />
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate, useProducts } from "@common";
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons, IonCard,
  IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonText,
  IonItemDivider, IonLabel, IonList, IonNote, IonPage, IonSegment, IonSegmentButton, IonSkeletonText,
  IonTitle, IonToolbar, alertController, onIonViewDidLeave, onIonViewWillEnter,
} from "@ionic/vue";
import { alertCircleOutline, calendarOutline, refreshOutline, timeOutline } from "ionicons/icons";
import { computed, ref, watch, type Directive } from "vue";
import { retryState as messageRetryState } from "@/utils/fulfillmentRecovery";
import AnimatedNumber from "@/components/common/AnimatedNumber.vue";
import type {
  FulfillmentOrderItem, FulfillmentShipmentRow, FulfillmentShipmentState,
} from "@/components/shopify-fulfillment/FulfillmentShipmentCard.types";
import { sendPendingFulfillment, getFulfillmentSendOutcome } from "@/composables/useFulfillmentSend";
import cronstrue from "cronstrue";
import FulfillmentSendResult from "@/components/shopify-fulfillment/FulfillmentSendResult.vue";
import FulfillmentDiagnosis from "@/components/shopify-fulfillment/FulfillmentDiagnosis.vue";
import FulfillmentShipmentCard from "@/components/shopify-fulfillment/FulfillmentShipmentCard.vue";
import FulfillmentOrderSearch from "@/components/shopify-fulfillment/FulfillmentOrderSearch.vue";
import { useOrderSyncHistory } from "@/composables/useOrderSyncHistory";
import { parseFulfillmentMessageText } from "@/utils/shopifyFulfillment";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";
import { useFulfillmentSyncHealth } from "@/composables/useShopifyFulfillment";
import { useServiceJobs } from "@/composables/useServiceJobs";
import { useCacheSync } from "@/composables/useCacheSync";
import { useFacilities } from "@/composables/useFacilities";
import { useShopifySyncContext } from "@/composables/useShopify";
import {
  type OmsShipmentContext, type QueuedFulfillmentRow, type SyncedFulfillmentRow,
  useOmsShipmentContext, useQueuedFulfillments, useShopifyFulfillmentDetails,
  useSyncedFulfillments, usePendingFulfillments,
} from "@/composables/useShopifyFulfillment";
import { useSystemMessage, useSystemMessageErrors } from "@/composables/useSystemMessage";
import { downloadTextFile, formatDateTime } from "@/utils";
import {
  type ShopifyFulfillmentDetails, fulfillmentSyncDomains,
} from "@/utils/shopifyFulfillment";

const props = defineProps<{ id: string }>();

const connectionDetailsHref = computed(() => `/shopify-connection-details/${props.id}`);

const segment = ref<"pending" | "queued" | "synced">("pending");

const selectedOrders = ref<any[]>([]);
const selectedOrderIds = computed(() => selectedOrders.value.map(order => order.orderId));
const orderHistory = useOrderSyncHistory(() => String(props.id), () => selectedOrderIds.value);
function messageStatusLabel(status: string) {
  return translate(({ SmsgSent: 'Synced', SmsgProduced: 'Queued', SmsgSending: 'Sending', SmsgError: 'Error', SmsgCancelled: 'Canceled' } as Record<string, string>)[status] || status);
}
const syncContext = useShopifySyncContext(() => props.id);
const { rows: recentQueuedRows, hydrated: recentQueuedHydrated } = useQueuedFulfillments(() => props.id);
const { getShipmentContext } = useOmsShipmentContext();
const { rows: recentPendingCandidates, status: recentPendingStatus } = usePendingFulfillments(() => props.id);
const queuedRows = computed<QueuedFulfillmentRow[]>(() => selectedOrders.value.length ? orderHistory.queued.value : recentQueuedRows.value);
const queuedHydrated = computed(() => selectedOrders.value.length ? orderHistory.ready.value : recentQueuedHydrated.value);
const pendingCandidates = computed(() => selectedOrders.value.length ? orderHistory.pending.value : recentPendingCandidates.value);
const pendingStatus = computed(() => selectedOrders.value.length ? { state: orderHistory.error.value ? 'error' : orderHistory.ready.value ? 'ready' : 'loading', hasMore: 'N' } : recentPendingStatus.value);
const pendingRows = computed(() => {
  const queuedIds = new Set(queuedRows.value.map((row) => row.parsed.shipmentId));
  return pendingCandidates.value.filter((row: any) => !queuedIds.has(row.shipmentId));
});
const pendingReady = computed(() => pendingStatus.value?.state === "ready" && queuedHydrated.value);
const pendingCount = computed(() => pendingReady.value ? `${pendingRows.value.length}${pendingStatus.value?.hasMore === "Y" ? "+" : ""}` : "—");
const pendingCards = computed(() => pendingRows.value.map((row: any) => {
  const ctx = loadedShipmentContext(`pending:${row.shipmentId}`);
  return {
    key: row.pendingKey,
    row: {
      shipmentId: row.shipmentId,
      orderName: ctx?.orderName || row.orderName || row.orderId,
      facility: ctx?.facilityName || row.facilityName || row.originFacilityId,
      orderDate: ctx?.orderDate ?? row.orderDate,
      shippedDate: ctx?.shippedDate ?? row.statusDate,
      facts: [],
      items: shipmentItems(ctx?.items ?? []),
    },
  };
}));
const { rows: recentSyncedRows, hydrated: recentSyncedHydrated, endpointMissing } = useSyncedFulfillments(() => props.id);
const syncedRows = computed<SyncedFulfillmentRow[]>(() => selectedOrders.value.length ? orderHistory.synced.value : recentSyncedRows.value);
const syncedHydrated = computed(() => selectedOrders.value.length ? orderHistory.ready.value : recentSyncedHydrated.value);
const { getFulfillmentDetails } = useShopifyFulfillmentDetails();
const { products: resolvedProducts, resolve: resolveProductNames } = useProducts();
const {
  ensureSystemMessageErrors, fetchSystemMessageErrors, resendSystemMessage, resetSystemMessageError,
} = useSystemMessage();
// Unscoped on purpose: the cache only ever holds errors a card asked for (class C, on demand), and
// one subscription serves every card where a per-row scope cannot be created inside v-for.
const { errors: cachedMessageErrors } = useSystemMessageErrors();
const { records: cachedFacilities } = useFacilities();
/**
 * `syncNow` rather than `afterMutation` on purpose, and `afterMutation` is deliberately not taken.
 *
 * `afterMutation` re-reads ONE record through a domain's `refetchOne`, which only
 * `shopifyFulfillmentHistoryDomain` implements. The other three domains behind this screen —
 * pending, health, order-sync history — are per-shop snapshots with no record to address, so an
 * `afterMutation` call for them is a silent no-op. Sending one shipment also moves the figures on
 * every one of them at once: the shipment leaves Pending, a System Message appears in Queued, the
 * health counts shift, and on success a row lands in Synced. A forced cycle is what refreshes all
 * four; destructuring `afterMutation` here only suggested a targeted refresh that cannot work.
 */
const { start: startSyncDomains, stop: stopSyncDomains, syncNow } = useCacheSync();

// ---------------------------------------------------------------------------------------------
// Worker lifecycle — the same start/stop shape the inventory sync page uses.
// ---------------------------------------------------------------------------------------------

const isViewActive = ref(false);

function activeSyncDomains() {
  return [
    { name: "serviceJob" },
    { name: "shopifyFulfillmentHealth", args: { shopId: String(props.id) } },
    ...(selectedOrders.value.length ? [{ name: 'shopifyOrderSyncHistory', args: { shopId: String(props.id), orderIds: selectedOrderIds.value } }] : []),
    ...(!selectedOrders.value.length && syncContext.remoteIds.value.length ? fulfillmentSyncDomains({
      shopId: String(props.id ?? ""), messageTotal: 500,
      systemMessageRemoteIds: syncContext.remoteIds.value,
    }) : []),
  ];
}

// Wait for this shop's exact remotes; do not fetch a cross-shop message sample while resolving.
watch(() => `${props.id ?? ""}|${syncContext.remoteIds.value.join(",")}|${selectedOrderIds.value.join(",")}`, () => {
  if(isViewActive.value) {void startSyncDomains(activeSyncDomains());}
}, { immediate: true });

onIonViewWillEnter(() => {
  isViewActive.value = true;
  void startSyncDomains(activeSyncDomains());
});

onIonViewDidLeave(() => {
  isViewActive.value = false;
  stopSyncDomains();
});

// ---------------------------------------------------------------------------------------------
// KPIs and segment labels.
// ---------------------------------------------------------------------------------------------

const failedCount = computed(() => queuedRows.value.filter(row => row.failCount > 0 || row.statusId === "SmsgError").length);
const queueFilter = ref("all");
const queueFilters = computed(() => [
  { key: "all", label: "All", count: queuedRows.value.length },
  ...[{ key: "retry", label: "Awaiting retry" }, { key: "stopped", label: "Retries stopped" }, { key: "paused", label: "Retries paused" }, { key: "waiting", label: "Not attempted" }, { key: "sending", label: "Sending" }].map(filter => ({ ...filter, count: queuedRows.value.filter(row => retryState(row).key === filter.key).length })),
]);

const queuedSegmentLabel = computed(() =>
  queuedHydrated.value ? `${translate("Queued")} (${queuedRows.value.length})` : translate("Queued"));

// No count while the endpoint is missing: 0 would claim "nothing synced", which the OMS cannot say.
const syncedSegmentLabel = computed(() =>
  syncedHydrated.value && !endpointMissing.value
    ? `${translate("Synced")} (${syncedRows.value.length})`
    : translate("Synced"));

// ---------------------------------------------------------------------------------------------
// Queued — CreateShopifyFulfillment messages, straight off the cache.
// ---------------------------------------------------------------------------------------------

type ShipmentContextState =
  { state: "loading" } |
  { state: "loaded"; context?: OmsShipmentContext };

/** Per-queued-message order context, fetched once per message and held for the session. */
const shipmentContexts = ref(new Map<string, ShipmentContextState>());

interface ShipmentContextRequest { systemMessageId: string; orderId?: string; parsed: { shipmentId?: string; orderId?: string } }

function loadedShipmentContext(key: string) {
  const value = shipmentContexts.value.get(key);
  return value?.state === "loaded" ? value.context : undefined;
}

async function loadShipmentContext(message: ShipmentContextRequest) {
  const key = message.systemMessageId;
  if(shipmentContexts.value.has(key)) {return;}
  const loading = new Map(shipmentContexts.value);
  loading.set(key, { state: "loading" });
  shipmentContexts.value = loading;

  // A payload naming neither settles immediately with no context: the card keeps its message facts
  // only, and no spinner that will not end.
  const context = await getShipmentContext({
    shipmentId: message.parsed.shipmentId,
    orderId: message.parsed.orderId || message.orderId,
  });
  const settled = new Map(shipmentContexts.value);
  settled.set(key, { state: "loaded", context });
  shipmentContexts.value = settled;
}

/**
 * Eager, not lazy: the two dates are what an operator opens this page for, so hiding them behind a
 * disclosure would defeat the point. But eager over the whole list is a request burst — this shop
 * carries 54 queued messages — so the reads run a few at a time instead of all at once. Each is a
 * read-only PK query, cached for the session, so the queue drains once and never re-runs.
 */
const SHIPMENT_CONTEXT_CONCURRENCY = 6;

async function loadShipmentContexts(rows: ShipmentContextRequest[]) {
  const pending = rows.filter((row) => !shipmentContexts.value.has(row.systemMessageId));
  for(let start = 0; start < pending.length; start += SHIPMENT_CONTEXT_CONCURRENCY) {
    const batch = pending.slice(start, start + SHIPMENT_CONTEXT_CONCURRENCY);
    await Promise.all(batch.map((row) => loadShipmentContext(row)));
  }
}

watch(queuedRows, (rows) => {
  void loadShipmentContexts(rows);
}, { immediate: true });

watch(pendingRows, (rows) => {
  void loadShipmentContexts(rows.map((row: any) => ({
    systemMessageId: `pending:${row.shipmentId}`, orderId: row.orderId, parsed: { shipmentId: row.shipmentId },
  })));
}, { immediate: true });

watch(syncedRows, (rows) => {
  void loadShipmentContexts(rows.map((row) => ({
    systemMessageId: `synced:${row.fulfillmentKey}`, orderId: row.omsOrderId, parsed: { shipmentId: row.shipmentId },
  })));
}, { immediate: true });

watch(shipmentContexts, (contexts) => {
  const ids = [...contexts.values()].flatMap((value) => value.state === "loaded"
    ? (value.context?.items ?? []).map((item) => item.productId) : []);
  if(ids.length) {void resolveProductNames(ids);}
});

interface QueuedCardView {
  key: string;
  message: QueuedFulfillmentRow;
  row: FulfillmentShipmentRow;
  state: FulfillmentShipmentState;
}

/** An age ("3d 4h", "52m") rather than a stamp the operator has to subtract from now themselves. */
function formatWaiting(initDate: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - initDate) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if(days) {return hours ? `${days}d ${hours}h` : `${days}d`;}
  if(hours) {return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;}

  return `${minutes}m`;
}

function shipmentItems(items: any[]): FulfillmentOrderItem[] {
  return items.map((item, index) => {
    const product = resolvedProducts.value.get(item.productId);
    // `productFeatures` is NOT part of @common's ResolvedProduct: the shared resolver does not ask
    // Solr for that field, and it lives in hotwax/accxui, not this repo. Read it optionally so this
    // line starts working the moment the shared resolver requests the field, and fall back to the
    // variant's own name until then (what the `features ||` fallback below already does).
    const withFeatures = product as ({ productFeatures?: string[] } | undefined);
    const features = withFeatures?.productFeatures?.map((feature) => feature.substring(feature.indexOf("/") + 1)).join(" / ");
    return {
      orderItemSeqId: item.orderItemSeqId || item.shipmentItemSeqId || item.shopifyLineItemId || String(index),
      primary: product?.parentProductName || product?.productName || item.productName || item.productId,
      secondary: product?.sku || item.internalName || item.productId,
      imageUrl: product?.mainImageUrl || "",
      features: features || (product?.parentProductName ? product.productName : ""),
      quantity: item.quantity,
      orderedQuantity: item.orderedQuantity,
    };
  });
}

const selectedSyncJob = ref<any>(null);
const { jobs: serviceJobs, hydrated: jobsHydrated } = useServiceJobs();
const { health: syncHealth } = useFulfillmentSyncHealth(() => props.id);
function isRetryJob(job: any) { return job.serviceName === 'org.moqui.impl.SystemMessageServices.send#AllProducedSystemMessages'; }
const fulfillmentJobs = computed(() => serviceJobs.value.filter((job: any) => {
  if (isRetryJob(job)) {
    // Show general senders here; product-specific configuration belongs on Product sync.
    // The current framework ignores type filters, so retry-state detection below still accounts
    // for every job calling the shared sender, even those omitted from this configuration card.
    return !(job.serviceJobParameters || []).some((parameter: any) =>
      ['systemMessageTypeId', 'systemMessageTypeIds'].includes(parameter.parameterName) && parameter.parameterValue);
  }
  if (job.serviceName !== 'co.hotwax.sob.fulfillment.FulfillmentSweepServices.sweep#MissedShopifyFulfillments') { return false; }
  const shop = job.serviceJobParameters?.find((parameter: any) => parameter.parameterName === 'shopId')?.parameterValue;
  return !shop || String(shop) === String(props.id);
}));
const diagnosedRetries = ref<Record<string, { version: string; retry: any; checkedAt?: string }>>({});
function rememberDiagnosis(message: QueuedFulfillmentRow, diagnosis: any) {
  diagnosedRetries.value[message.systemMessageId] = { version: String(message.failCount) + message.statusId, retry: diagnosis.retry, checkedAt: diagnosis.checkedAt };
}
function scheduleLabel(job: any) {
  if (!job.cron) { return translate('No schedule configured'); }
  try { return cronstrue.toString(job.cron); } catch { return translate('Schedule could not be read'); }
}
function retryState(message: QueuedFulfillmentRow) {
  const observed = diagnosedRetries.value[message.systemMessageId];
  const jobs = jobsHydrated.value ? serviceJobs.value.filter(isRetryJob).map((job: any) => ({ enabled: job.paused !== 'Y' && !!job.cronExpression })) : observed?.version === String(message.failCount) + message.statusId ? observed.retry?.jobs : undefined;
  if(message.statusId === 'SmsgProduced' && message.failCount > 0 && jobs?.length && !jobs.some((job: any) => job.enabled)) {
    return { key: 'paused', label: 'Retries paused', color: 'warning', rank: 1, detail: 'The configured retry jobs are paused. Resolve the cause; ask your administrator to verify the retry schedule.' };
  }
  return messageRetryState(message);
}

const queuedCards = computed<QueuedCardView[]>(() => queuedRows.value.map((message) => {
  const ctxState = shipmentContexts.value.get(message.systemMessageId);
  const ctx = ctxState?.state === "loaded" ? ctxState.context : undefined;

  return {
    key: message.systemMessageId,
    message,
    state: { label: translate(retryState(message).label), color: retryState(message).color },
    row: {
      shipmentId: message.parsed.shipmentId,
      // The human-facing name from OrderHeader when enrichment found it; ids only as a fallback.
      orderName: ctx?.orderName || message.orderId || message.parsed.orderId,
      facility: ctx?.facilityName,
      orderDate: ctx?.orderDate,
      shippedDate: ctx?.shippedDate,
      facts: [
        ...(message.initDate ? [
          { icon: calendarOutline, label: translate("Queued at"), value: formatDateTime(message.initDate) },
        ] : []),
        ...(message.lastAttemptDate ? [
          { icon: refreshOutline, label: translate("Last attempt"), value: formatDateTime(message.lastAttemptDate) },
        ] : []),
        ...(message.initDate ? [
          { icon: timeOutline, label: translate("Waiting"), value: formatWaiting(message.initDate) },
        ] : []),
      ],
      items: shipmentItems(ctx?.items?.length ? ctx.items : message.parsed.items),
    },
  };
}));

// Solr is asked once per new product id; `resolve` filters ids already requested.
watch(queuedRows, (rows) => {
  const productIds = rows.flatMap((row) => row.parsed.items.map((item) => item.productId)).filter(Boolean);
  if(productIds.length) {void resolveProductNames(productIds);}
}, { immediate: true });

const visibleQueuedCards = computed(() => queuedCards.value.filter(card => queueFilter.value === "all" || retryState(card.message).key === queueFilter.value)
  .sort((a, b) => retryState(a.message).rank - retryState(b.message).rank));
function hasFailure(message: QueuedFulfillmentRow) { return message.failCount > 0 || message.statusId === "SmsgError"; }


/** The stored payload pretty-printed when it parses; verbatim when it does not — a malformed
 *  payload is precisely the row an operator most needs to read as stored. */
function prettyMessageText(messageText: string): string {
  try {
    return JSON.stringify(JSON.parse(messageText), null, 2);
  } catch {
    return messageText;
  }
}

// ---------------------------------------------------------------------------------------------
// Queued — delivery errors, fetched when a card's errors accordion first opens.
// ---------------------------------------------------------------------------------------------

const errorsByMessage = computed(() => {
  const byMessage = new Map<string, any[]>();
  for(const error of cachedMessageErrors.value) {
    const systemMessageId = String(error?.systemMessageId ?? "");
    if(!systemMessageId) {continue;}
    byMessage.set(systemMessageId, [...(byMessage.get(systemMessageId) ?? []), error]);
  }

  return byMessage;
});

function errorsFor(systemMessageId: string): any[] {
  return errorsByMessage.value.get(systemMessageId) ?? [];
}

const loadingErrorIds = ref<string[]>([]);

async function loadMessageErrors(systemMessageId: string, fresh = false) {
  if(loadingErrorIds.value.includes(systemMessageId)) {return;}
  loadingErrorIds.value = [...loadingErrorIds.value, systemMessageId];
  try {
    // Write-through: the rows land in systemMessageErrorCache, which `errorsFor` reads reactively.
    await (fresh ? fetchSystemMessageErrors(systemMessageId) : ensureSystemMessageErrors(systemMessageId));
  } catch(error) {
    logger.error("Could not load fulfillment failure details", error);
    void commonUtil.showToast(translate("Could not refresh failure details. Please try again."));
  } finally {
    loadingErrorIds.value = loadingErrorIds.value.filter((id) => id !== systemMessageId);
  }
}

// Refresh only when a failed attempt changes, with at most three requests in flight.
const inspectedAttempts = new Map<string, string>();
const errorQueue: string[] = [];
let activeErrorReads = 0;
function drainErrorQueue() {
  while(activeErrorReads < 3 && errorQueue.length) {
    const id = errorQueue.shift()!;
    activeErrorReads++;
    void loadMessageErrors(id, true).finally(() => { activeErrorReads--; drainErrorQueue(); });
  }
}
watch(() => queuedRows.value.map(row => `${row.systemMessageId}:${row.failCount}:${row.lastAttemptDate}:${row.statusId}`).join("|"), () => {
  for(const row of queuedRows.value.filter(hasFailure)) {
    const version = `${row.failCount}:${row.lastAttemptDate}:${row.statusId}`;
    if(inspectedAttempts.get(row.systemMessageId) === version) continue;
    inspectedAttempts.set(row.systemMessageId, version);
    errorQueue.push(row.systemMessageId);
  }
  drainErrorQueue();
}, { immediate: true });

function onQueuedAccordionChange(message: QueuedFulfillmentRow, event: CustomEvent) {
  const value = (event as any)?.detail?.value;
  const opened = Array.isArray(value) ? value : [value];
  if(opened.includes("errors")) {void loadMessageErrors(message.systemMessageId);}
}

// ---------------------------------------------------------------------------------------------
// Queued — recovery actions. Confirmed first because each one issues a real send.
// ---------------------------------------------------------------------------------------------

interface QueuedRecoveryPlan {
  /** What the confirm alert tells the operator will run, naming the endpoints it calls. */
  description: string;
  run: () => Promise<void>;
}

function recoveryPlanFor(message: QueuedFulfillmentRow): QueuedRecoveryPlan | undefined {
  const systemMessageId = message.systemMessageId;
  if(message.statusId === "SmsgError") {
    return {
      description: "Check Shopify for an existing fulfillment and resolve the reported issue first. This restarts delivery of the stored shipment to Shopify.",
      run: async () => {
        await resetSystemMessageError(systemMessageId);
        await resendSystemMessage(systemMessageId);
      },
    };
  }
  if(message.statusId === "SmsgProduced") {
    return {
      description: "Check Shopify for an existing fulfillment and resolve the reported issue first. This sends the stored shipment to Shopify now.",
      run: async () => {
        await resendSystemMessage(systemMessageId);
      },
    };
  }

  return undefined;
}

const sendResults = ref<Record<string, any>>({});
const retainedPending = ref<any[]>([]);
const retainedQueued = ref<any[]>([]);
function withRetained(cards: any[], retained: any[]) {
  const result = cards.filter(c => !retained.some(r => r.key === c.key));
  for (const card of [...retained].sort((a, b) => a.originalIndex - b.originalIndex)) { result.splice(Math.min(card.originalIndex, result.length), 0, cards.find(current => current.key === card.key) || card); }
  return result;
}
watch(selectedOrderIds, () => { retainedPending.value = []; retainedQueued.value = []; });
const displayedPendingCards = computed(() => withRetained(pendingCards.value, retainedPending.value));
const displayedQueuedCards = computed(() => withRetained(visibleQueuedCards.value, retainedQueued.value));
watch(segment, () => { retainedPending.value = []; retainedQueued.value = []; sendResults.value = {}; });
watch(() => props.id, () => { retainedPending.value = []; retainedQueued.value = []; sendResults.value = {}; });
function viewSendDestination(destination: 'queued' | 'synced') {
  retainedPending.value = []; retainedQueued.value = []; sendResults.value = {};
  segment.value = destination;
}
function sendResultState(shipmentId: string) {
  const result = sendResults.value[shipmentId];
  return result ? { label: translate(result.label), color: result.status === 'success' ? 'success' : result.status === 'sending' ? 'primary' : 'warning' } : undefined;
}
function retainResult(shipmentId: string, queued = false) {
  const cards: any[] = queued ? queuedCards.value : pendingCards.value;
  const retained = queued ? retainedQueued : retainedPending;
  const card = cards.find(c => c.row.shipmentId === shipmentId);
  if (card && !retained.value.some(c => c.key === card.key)) { retained.value.push({ ...card, originalIndex: cards.indexOf(card) }); }
  sendResults.value[shipmentId] = { status: 'sending', label: 'Sending…' };
}
async function finishSend(shipmentId: string, requestError?: any) {
  try {
    let result = await getFulfillmentSendOutcome(String(props.id), shipmentId);
    for (let attempt = 0; result?.statusId === 'SmsgSending' && attempt < 15; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      result = await getFulfillmentSendOutcome(String(props.id), shipmentId);
    }
    if (!result) { throw new Error('Send outcome could not be verified.'); }
    sendResults.value[shipmentId] = result.fulfillmentId ? { status: 'success', label: 'Synced to Shopify', destination: 'synced', messageId: result.systemMessageId } : { status: result.statusId === 'SmsgSending' ? 'sending' : 'error', label: result.statusId === 'SmsgSending' ? 'Sending…' : result.errorText ? 'Sync failed' : 'Queued for delivery', destination: result.systemMessageId ? 'queued' : undefined, messageId: result.systemMessageId, error: result.errorText || requestError?.message };
  } catch (error: any) { sendResults.value[shipmentId] = { status: 'unknown', label: 'Send outcome could not be verified', error: requestError?.message || error.message }; }
  await syncNow();
}

const retryingId = ref("");

/**
 * The confirmed branch, kept apart from the alert so its order of operations is directly
 * assertable — ion-alert cannot be driven from a jsdom test.
 */
async function runQueuedRecovery(message: QueuedFulfillmentRow) {
  const plan = recoveryPlanFor(message);
  if(!plan || retryingId.value) {return;}
  retryingId.value = message.systemMessageId;
  const shipmentId = message.parsed.shipmentId;
  retainResult(shipmentId, true);
  let requestError: any;
  try { await plan.run(); } catch (error: any) { requestError = error; }
  try { await finishSend(shipmentId, requestError); } finally { retryingId.value = ''; }

}

async function requestPendingSend(row: FulfillmentShipmentRow) {
  if (retryingId.value) { return; }
  const alert = await alertController.create({ header: translate('Send shipment to Shopify?'), message: translate('This attempts delivery now, even if reconciliation reports an issue. Shopify may reject the attempt.'), buttons: [{ text: translate('Cancel'), role: 'cancel' }, { text: translate('Send now'), role: 'confirm' }] });
  await alert.present();
  if ((await alert.onDidDismiss()).role !== 'confirm' || retryingId.value) { return; }
  retryingId.value = row.shipmentId;
  retainResult(row.shipmentId);
  let requestError: any;
  try { await sendPendingFulfillment(String(props.id), row.shipmentId); } catch (error: any) { requestError = error; }
  try { await finishSend(row.shipmentId, requestError); } finally { retryingId.value = ''; }

}

async function requestQueuedRecovery(message: QueuedFulfillmentRow) {
  const plan = recoveryPlanFor(message);
  if(!plan) {return;}
  const shipment = message.parsed.shipmentId || message.orderId || message.parsed.orderId ||
    message.systemMessageId;
  const alert = await alertController.create({
    header: `Send ${shipment} to Shopify?`,
    message: plan.description,
    buttons: [
      { text: "Cancel", role: "cancel" },
      { text: "Confirm", role: "confirm" },
    ],
  });
  await alert.present();
  if((await alert.onDidDismiss()).role !== "confirm") {return;}
  await runQueuedRecovery(message);
}

// ---------------------------------------------------------------------------------------------
// Synced — history rows immediately, Shopify's own record on first expand.
// ---------------------------------------------------------------------------------------------

type FulfillmentDetailState =
  { state: "loading" } |
  { state: "unavailable" } |
  { state: "loaded"; details: ShopifyFulfillmentDetails };

const fulfillmentDetails = ref(new Map<string, FulfillmentDetailState>());

interface SyncedCardView {
  key: string;
  source: SyncedFulfillmentRow;
  row: FulfillmentShipmentRow;
  state?: FulfillmentShipmentState;
  detail?: FulfillmentDetailState;
  details?: ShopifyFulfillmentDetails;
}

/**
 * FulfillmentStatus decides the colour of a synced card, while displayStatus supplies its words: a
 * CANCELLED fulfillment can still read DELIVERED, and the colour is what says it no longer counts.
 */
function fulfillmentStatusColor(status: string) {
  if(status === "SUCCESS") { return "success"; }
  if(status === "CANCELLED") { return "warning"; }

  return "danger";
}

const facilityNames = computed(() => {
  const names = new Map<string, string>();
  for(const facility of cachedFacilities.value) {
    const facilityId = String(facility?.facilityId ?? "");
    const facilityName = String(facility?.facilityName ?? "").trim();
    if(facilityId && facilityName) {names.set(facilityId, facilityName);}
  }

  return names;
});

const syncedCards = computed<SyncedCardView[]>(() => syncedRows.value.map((source) => {
  const ctx = loadedShipmentContext(`synced:${source.fulfillmentKey}`);
  const detail = fulfillmentDetails.value.get(source.fulfillmentKey);
  const details = detail?.state === "loaded" ? detail.details : undefined;

  return {
    key: source.fulfillmentKey,
    source,
    detail,
    details,
    state: details
      ? { label: details.displayStatus, color: fulfillmentStatusColor(details.status) }
      : undefined,
    row: {
      shipmentId: source.shipmentId,
      orderName: ctx?.orderName || source.omsOrderId || source.shopifyOrderId,
      facility: source.originFacilityId
        ? facilityNames.value.get(source.originFacilityId) ?? source.originFacilityId
        : undefined,
      orderDate: ctx?.orderDate ?? source.orderDate,
      shippedDate: ctx?.shippedDate ?? source.shippedDate,
      facts: [
        ...(source.lastUpdatedStamp ? [
          { icon: timeOutline, label: translate("Recorded"), value: formatDateTime(source.lastUpdatedStamp) },
        ] : []),
      ],
      items: shipmentItems(ctx?.items ?? []),
    },
  };
}));

const downloadingSnapshots = ref(new Set<string>());
async function downloadShopifySnapshot(source: SyncedFulfillmentRow) {
  if(downloadingSnapshots.value.has(source.fulfillmentKey)) {return;}
  downloadingSnapshots.value = new Set([...downloadingSnapshots.value, source.fulfillmentKey]);
  try {
    const result = await getFulfillmentDetails({ shopId: source.shopId, fulfillmentId: source.fulfillmentId, forceRefresh: true });
    if(result.unavailable || !result.rawFulfillment) {throw new Error("Shopify snapshot unavailable");}
    downloadTextFile(JSON.stringify({ shopId: source.shopId, fetchedAt: result.fetchedAt, fulfillment: result.rawFulfillment }, null, 2),
      `shopify-fulfillment-${source.fulfillmentId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
    const settled = new Map(fulfillmentDetails.value);
    settled.set(source.fulfillmentKey, { state: "loaded", details: result });
    fulfillmentDetails.value = settled;
  } catch(error) {
    logger.error("Failed to download current Shopify fulfillment", error);
    void commonUtil.showToast(translate("Could not download the current Shopify fulfillment. Please try again."));
  } finally {
    const remaining = new Set(downloadingSnapshots.value);
    remaining.delete(source.fulfillmentKey);
    downloadingSnapshots.value = remaining;
  }
}

// Near-viewport reads share a bounded queue; loaded and in-flight cards are deduplicated.
const detailQueue: SyncedFulfillmentRow[] = [];
const queuedDetailKeys = new Set<string>();
let activeDetailReads = 0;
function enqueueFulfillmentDetails(source: SyncedFulfillmentRow) {
  const current = fulfillmentDetails.value.get(source.fulfillmentKey);
  if(queuedDetailKeys.has(source.fulfillmentKey) || (current && current.state !== "unavailable")) {return;}
  queuedDetailKeys.add(source.fulfillmentKey);
  detailQueue.push(source);
  drainDetailQueue();
}
function drainDetailQueue() {
  while(activeDetailReads < 3 && detailQueue.length) {
    const source = detailQueue.shift()!;
    activeDetailReads++;
    void loadFulfillmentDetails(source).catch((error) => logger.error("Fulfillment detail read failed", error)).finally(() => {
      activeDetailReads--;
      queuedDetailKeys.delete(source.fulfillmentKey);
      drainDetailQueue();
    });
  }
}
const detailObservers = new WeakMap<Element, IntersectionObserver>();
const vLazyFulfillment: Directive<Element, SyncedFulfillmentRow> = {
  mounted(element, binding) {
    if(typeof IntersectionObserver === "undefined") {
      enqueueFulfillmentDetails(binding.value);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if(!entries.some((entry) => entry.isIntersecting)) {return;}
      observer.disconnect();
      detailObservers.delete(element);
      enqueueFulfillmentDetails(binding.value);
    }, { rootMargin: "200px" });
    detailObservers.set(element, observer);
    observer.observe(element);
  },
  unmounted(element) {
    detailObservers.get(element)?.disconnect();
    detailObservers.delete(element);
  },
};

async function loadFulfillmentDetails(source: SyncedFulfillmentRow) {
  const current = fulfillmentDetails.value.get(source.fulfillmentKey);
  // "unavailable" deliberately stays retryable — the composable never caches failures, so the next
  // expand heals a Shopify blip instead of pinning the card to "unreachable" all session.
  if(current && current.state !== "unavailable") {return;}
  const loading = new Map(fulfillmentDetails.value);
  loading.set(source.fulfillmentKey, { state: "loading" });
  fulfillmentDetails.value = loading;

  const result = await getFulfillmentDetails({
    shopId: source.shopId,
    fulfillmentId: source.fulfillmentId,
  });

  const settled = new Map(fulfillmentDetails.value);
  settled.set(source.fulfillmentKey, result.unavailable
    ? { state: "unavailable" }
    : { state: "loaded", details: result });
  fulfillmentDetails.value = settled;
}

function onSyncedAccordionChange(source: SyncedFulfillmentRow, event: CustomEvent) {
  const value = (event as any)?.detail?.value;
  const opened = Array.isArray(value) ? value.length > 0 : Boolean(value);
  // Expansion retries failed reads; visibility handles the initial read.
  if(opened) {enqueueFulfillmentDetails(source);}
}
</script>

<style scoped>
/* Matches the inventory job run history's own main padding, so the stat row's internal gap and the
   gap between sections are the same measure. */
.fulfillment-sync-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacer-base);
  padding: var(--spacer-base);
}

.fulfillment-sync-content > ion-card {
  margin-block: 0;
  margin-inline: 0;
}

.sync-summary {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(400px, 100%), 1fr));
  align-items: flex-start;
}
.jobs-summary { grid-column: 1 / 2; }
.recent-summary { grid-column: -1 / -2; }


.segment-scope {
  display: block;
  padding-inline: var(--spacer-2xs);
}

.accordion-content {
  padding: var(--spacer-sm);
}

.accordion-content pre {
  overflow: auto;
  white-space: pre-wrap;
  margin: 0;
}

/* The Shopify record's own facts, laid out like the card's shipment facts so the two halves of a
   synced card read as one thing rather than two conventions. */
.detail-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--spacer-sm);
  padding-block-start: var(--spacer-sm);
}

.detail-facts ion-item {
  --padding-start: 0;
  --inner-padding-end: 0;
}
</style>
