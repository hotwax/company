export interface NetSuiteStepRecord {
  recordId: string;
  recordName?: string;
  recordDetail?: string;
  recordDate?: unknown;
  systemMessageId?: string;
  batchInitDate?: unknown;
  claimedDate?: unknown;
  errorMessage?: string;
  attemptCount?: number;
  attemptLimit?: number;
  nextTryDate?: unknown;
}

export interface NetSuiteOrderStep {
  step: string;
  label: string;
  urlBase: string;
  stepParams: Record<string, unknown>;
  recordsKey: string;
  recordCountKey: string;
  releaseIdsKey: string;
  toRecord: (row: any) => NetSuiteStepRecord;
  recordDateLabel: string;
  recordKindLabel: string;
  failedTitle: string;
  failedTitleOne: string;
  noFailures: string;
  listTitle: string;
  listTitleOne: string;
  noRecords: string;
  sendOneQuestion?: string;
  sendManyQuestion?: string;
  sentOneMessage?: string;
  sentManyMessage?: string;
  listMeanings: Record<string, string>;
  isSharedByAllStores?: boolean;
  stepLists?: string[];
  isResentByJob?: boolean;
  failureReason?: string;
}

const STUCK_MEANING = "Sent in a batch more than one day ago. NetSuite has not answered. Oldest batch first.";

const PAYMENT_STEP: NetSuiteOrderStep = {
  step: "payment",
  label: "Payment",
  urlBase: "netsuite/payments",
  stepParams: {},
  recordsKey: "payments",
  recordCountKey: "paymentCount",
  releaseIdsKey: "orderPaymentPreferenceIds",
  toRecord: (row) => ({
    recordId: row.orderPaymentPreferenceId,
    recordName: row.orderName || row.orderId,
    recordDetail: [row.paymentMethod, row.maxAmount].filter((part) => part != null).join(" · "),
    recordDate: row.paymentDate,
    systemMessageId: row.systemMessageId,
    batchInitDate: row.batchInitDate,
    claimedDate: row.claimedDate,
    errorMessage: row.errorMessage,
  }),
  recordDateLabel: "Payment date",
  recordKindLabel: "Payment",
  failedTitle: "{count} payments failed to sync",
  failedTitleOne: "1 payment failed to sync",
  noFailures: "No payments failed to sync",
  listTitle: "{count} payments",
  listTitleOne: "1 payment",
  noRecords: "No payments",
  sendOneQuestion: "Send this payment again? It goes to NetSuite in the next run.",
  sendManyQuestion: "Send {count} payments again? They go to NetSuite in the next run.",
  sentOneMessage: "The payment will be sent again in the next run.",
  sentManyMessage: "{count} payments will be sent again in the next run.",
  listMeanings: {
    stuck: STUCK_MEANING,
    pending: "Picked by the store's deposit rules and paid more than one day ago, but not sent yet. Oldest payment first.",
    "not-picked": "On an order placed after the go-live date, but no deposit rule of the store picks them. They never go to NetSuite. Oldest payment first.",
  },
};

const EXCHANGE_PAYMENT_STEP: NetSuiteOrderStep = {
  ...PAYMENT_STEP,
  step: "exchange-payment",
  label: "Exchange payment",
  stepParams: { exchangePayments: true },
  listMeanings: {
    stuck: STUCK_MEANING,
    pending: "Exchange payments picked by the store's deposit rules, whose credit memo is in NetSuite, paid more than one day ago, but not sent yet. Oldest payment first.",
    "not-picked": "Exchange payments on an order placed after the go-live date, but no deposit rule of the store picks them. They never go to NetSuite. Oldest payment first.",
  },
};

const REFUND_STEP: NetSuiteOrderStep = {
  ...PAYMENT_STEP,
  step: "refund",
  label: "Refund",
  urlBase: "netsuite/refunds",
  recordsKey: "refunds",
  recordCountKey: "refundCount",
  toRecord: (row) => ({ ...PAYMENT_STEP.toRecord(row), recordDate: row.refundDate }),
  recordDateLabel: "Refund date",
  recordKindLabel: "Refund",
  failedTitle: "{count} refunds failed to sync",
  failedTitleOne: "1 refund failed to sync",
  noFailures: "No refunds failed to sync",
  listTitle: "{count} refunds",
  listTitleOne: "1 refund",
  noRecords: "No refunds",
  sendOneQuestion: "Send this refund again? It goes to NetSuite in the next run.",
  sendManyQuestion: "Send {count} refunds again? They go to NetSuite in the next run.",
  sentOneMessage: "The refund will be sent again in the next run.",
  sentManyMessage: "{count} refunds will be sent again in the next run.",
  listMeanings: {
    stuck: STUCK_MEANING,
    pending: "Picked by the store's deposit rules and refunded more than one day ago, but not sent yet. Oldest refund first.",
    "not-picked": "On an order placed after the go-live date, but no deposit rule of the store picks them. They never go to NetSuite. Oldest refund first.",
  },
};

const STORE_SHIPMENT_STEP: NetSuiteOrderStep = {
  step: "store-shipment",
  label: "Store shipment",
  urlBase: "netsuite/storeFulfillments",
  stepParams: {},
  recordsKey: "fulfillments",
  recordCountKey: "fulfillmentCount",
  releaseIdsKey: "externalIds",
  toRecord: (row) => ({
    recordId: row.externalId,
    recordName: row.orderName || row.orderId,
    recordDetail: [row.facilityName || row.facilityId, row.lineCount === 1 ? "1 line" : `${row.lineCount} lines`].join(" · "),
    recordDate: row.completedDate,
    systemMessageId: row.systemMessageId,
    batchInitDate: row.batchInitDate,
    claimedDate: row.claimedDate,
    errorMessage: row.errorMessage,
    attemptCount: row.attemptCount,
    attemptLimit: row.attemptLimit,
    nextTryDate: row.nextTryDate,
  }),
  recordDateLabel: "Completed at the store",
  recordKindLabel: "Fulfillment",
  failedTitle: "{count} store shipments failed to sync",
  failedTitleOne: "1 store shipment failed to sync",
  noFailures: "No store shipments failed to sync",
  listTitle: "{count} store shipments",
  listTitleOne: "1 store shipment",
  noRecords: "No store shipments",
  sendOneQuestion: "Send this store shipment again? It goes to NetSuite in the next run.",
  sendManyQuestion: "Send {count} store shipments again? They go to NetSuite in the next run.",
  sentOneMessage: "The store shipment will be sent again in the next run.",
  sentManyMessage: "{count} store shipments will be sent again in the next run.",
  listMeanings: {
    stuck: STUCK_MEANING,
    pending: "Completed at the store more than one day ago and picked by the store's rules, but not sent yet. Oldest order first.",
    "not-picked": "Completed at the store, on an order placed after the go-live date, but no rule of the store picks them. They never go to NetSuite. Oldest order first.",
  },
};

const describeLineCount = (lineCount: number | undefined) => lineCount == null ? undefined : lineCount === 1 ? "1 line" : `${lineCount} lines`;

const LINE_CLOSE_STEP: NetSuiteOrderStep = {
  step: "line-close",
  label: "Cancelled line",
  urlBase: "netsuite/lineCloses",
  stepParams: {},
  recordsKey: "orders",
  recordCountKey: "orderCount",
  releaseIdsKey: "orderIds",
  toRecord: (row) => ({
    recordId: row.orderId,
    recordName: row.orderName || row.orderId,
    recordDetail: describeLineCount(row.lineCount),
    recordDate: row.cancelledDate,
    systemMessageId: row.systemMessageId,
    batchInitDate: row.batchInitDate,
    claimedDate: row.claimedDate,
    errorMessage: row.errorMessage,
  }),
  recordDateLabel: "Cancelled",
  recordKindLabel: "Order",
  failedTitle: "{count} orders have cancelled lines NetSuite did not close",
  failedTitleOne: "1 order has cancelled lines NetSuite did not close",
  noFailures: "No cancelled lines failed to sync",
  listTitle: "{count} orders",
  listTitleOne: "1 order",
  noRecords: "No orders",
  sendOneQuestion: "Send the cancelled lines of this order again? They go to NetSuite in the next run.",
  sendManyQuestion: "Send the cancelled lines of {count} orders again? They go to NetSuite in the next run.",
  sentOneMessage: "The cancelled lines will be sent again in the next run.",
  sentManyMessage: "The cancelled lines of {count} orders will be sent again in the next run.",
  listMeanings: {
    stuck: STUCK_MEANING,
    pending: "Lines cancelled more than one day ago, still open in NetSuite and not sent yet. Oldest order first.",
  },
  isSharedByAllStores: true,
  stepLists: ["failed", "stuck", "pending"],
};

const ORDER_CHANGE_STEP: NetSuiteOrderStep = {
  step: "order-change",
  label: "Order change",
  urlBase: "netsuite/salesOrderUpdates",
  stepParams: {},
  recordsKey: "orders",
  recordCountKey: "orderCount",
  releaseIdsKey: "orderIds",
  toRecord: (row) => ({
    recordId: row.orderId,
    recordName: row.orderName || row.orderId,
    recordDate: row.orderDate,
    systemMessageId: row.systemMessageId,
    batchInitDate: row.batchInitDate,
    claimedDate: row.claimedDate,
    errorMessage: row.errorMessage,
  }),
  recordDateLabel: "Order date",
  recordKindLabel: "Order",
  failedTitle: "{count} order changes failed to sync",
  failedTitleOne: "1 order change failed to sync",
  noFailures: "No order changes failed to sync",
  listTitle: "{count} orders",
  listTitleOne: "1 order",
  noRecords: "No orders",
  sendOneQuestion: "Send this order change again? It goes to NetSuite in the next run.",
  sendManyQuestion: "Send {count} order changes again? They go to NetSuite in the next run.",
  sentOneMessage: "The order change will be sent again in the next run.",
  sentManyMessage: "{count} order changes will be sent again in the next run.",
  listMeanings: {
    stuck: STUCK_MEANING,
    pending: "Orders NetSuite has that are due a change, placed more than one day ago, but not sent yet. Oldest order first.",
  },
  isSharedByAllStores: true,
  stepLists: ["failed", "stuck", "pending"],
};

const ORDER_MOVED_STEP: NetSuiteOrderStep = {
  step: "order-moved",
  label: "Order moved",
  urlBase: "netsuite/brokeredOrders",
  stepParams: {},
  recordsKey: "orders",
  recordCountKey: "orderCount",
  releaseIdsKey: "orderIds",
  toRecord: (row) => ({
    recordId: row.orderId,
    recordName: row.orderName || row.orderId,
    recordDetail: describeLineCount(row.lineCount),
    recordDate: row.movedDate,
  }),
  recordDateLabel: "Moved",
  recordKindLabel: "Order",
  failedTitle: "{count} orders have moved lines NetSuite refused",
  failedTitleOne: "1 order has moved lines NetSuite refused",
  noFailures: "No moved lines failed to sync",
  listTitle: "{count} orders",
  listTitleOne: "1 order",
  noRecords: "No orders",
  listMeanings: {
    pending: "Lines moved to another facility more than one day ago, but their new location is not sent yet. A line moved when its facility last changed, or when the order came in. Oldest move first.",
  },
  isSharedByAllStores: true,
  stepLists: ["failed", "pending"],
  isResentByJob: true,
  failureReason: "NetSuite refused the new location",
};

export const NETSUITE_ORDER_STEPS: Record<string, NetSuiteOrderStep> = {
  customer: {
    step: "customer",
    label: "Customer",
    urlBase: "netsuite/customers",
    stepParams: {},
    recordsKey: "customers",
    recordCountKey: "customerCount",
    releaseIdsKey: "partyIds",
    toRecord: (row) => ({
      recordId: row.partyId,
      recordName: row.customerName,
      recordDate: row.partyCreatedDate,
      systemMessageId: row.systemMessageId,
      batchInitDate: row.batchInitDate,
      claimedDate: row.claimedDate,
      errorMessage: row.errorMessage,
    }),
    recordDateLabel: "Customer since",
    recordKindLabel: "Customer",
    failedTitle: "{count} customers failed to sync",
    failedTitleOne: "1 customer failed to sync",
    noFailures: "No customers failed to sync",
    listTitle: "{count} customers",
    listTitleOne: "1 customer",
    noRecords: "No customers",
    sendOneQuestion: "Send this customer again? It goes to NetSuite in the next run.",
    sendManyQuestion: "Send {count} customers again? They go to NetSuite in the next run.",
    sentOneMessage: "The customer will be sent again in the next run.",
    sentManyMessage: "{count} customers will be sent again in the next run.",
    listMeanings: {
      stuck: STUCK_MEANING,
      pending: "Picked by the store's customer rules, with an order placed more than one day ago, but not sent yet. Oldest customer first.",
      "not-picked": "Have an order placed after the go-live date, but no customer rule of the store picks them. Their orders wait for them. Oldest customer first.",
    },
  },
  payment: PAYMENT_STEP,
  "exchange-payment": EXCHANGE_PAYMENT_STEP,
  refund: REFUND_STEP,
  "store-shipment": STORE_SHIPMENT_STEP,
  "line-close": LINE_CLOSE_STEP,
  "order-change": ORDER_CHANGE_STEP,
  "order-moved": ORDER_MOVED_STEP,
  "sales-order": {
    step: "sales-order",
    label: "Sales order",
    urlBase: "netsuite/salesOrders",
    stepParams: {},
    recordsKey: "orders",
    recordCountKey: "orderCount",
    releaseIdsKey: "orderIds",
    toRecord: (row) => ({
      recordId: row.orderId,
      recordName: row.orderName,
      recordDate: row.orderDate,
      systemMessageId: row.systemMessageId,
      batchInitDate: row.batchInitDate,
      claimedDate: row.claimedDate,
      errorMessage: row.errorMessage,
    }),
    recordDateLabel: "Order date",
    recordKindLabel: "Order",
    failedTitle: "{count} orders failed to sync",
    failedTitleOne: "1 order failed to sync",
    noFailures: "No orders failed to sync",
    listTitle: "{count} orders",
    listTitleOne: "1 order",
    noRecords: "No orders",
    sendOneQuestion: "Send this order again? It goes to NetSuite in the next run.",
    sendManyQuestion: "Send {count} orders again? They go to NetSuite in the next run.",
    sentOneMessage: "The order will be sent again in the next run.",
    sentManyMessage: "{count} orders will be sent again in the next run.",
    listMeanings: {
      stuck: STUCK_MEANING,
      pending: "Picked by the store's rules and placed more than one day ago, but not sent yet. Oldest order first.",
      "not-picked": "Placed after the go-live date, but no rule of the store picks them. They never go to NetSuite. Oldest order first.",
    },
  },
};

export const NETSUITE_ORDER_STEP_ORDER = ["customer", "sales-order", "payment", "exchange-payment", "store-shipment", "refund", "line-close", "order-change", "order-moved"];

export interface NetSuiteStepOpenBatches {
  systemMessageTypeId: string;
  isCountedAcrossStores: boolean;
  isLimitFixed: boolean;
  sharedWithStep?: string;
}

export const NETSUITE_STEP_OPEN_BATCHES: Record<string, NetSuiteStepOpenBatches> = {
  customer: { systemMessageTypeId: "NetSuiteCustomerScriptBatch", isCountedAcrossStores: false, isLimitFixed: true },
  "sales-order": { systemMessageTypeId: "NetSuiteSalesOrderBatch", isCountedAcrossStores: false, isLimitFixed: false },
  payment: { systemMessageTypeId: "NetSuiteCustomerDepositBatch", isCountedAcrossStores: false, isLimitFixed: false, sharedWithStep: "exchange-payment" },
  "exchange-payment": { systemMessageTypeId: "NetSuiteCustomerDepositBatch", isCountedAcrossStores: false, isLimitFixed: false, sharedWithStep: "payment" },
  "store-shipment": { systemMessageTypeId: "NetSuiteStoreFulfillmentBatch", isCountedAcrossStores: false, isLimitFixed: false },
  refund: { systemMessageTypeId: "NetSuiteCustomerRefundBatch", isCountedAcrossStores: false, isLimitFixed: false },
  "line-close": { systemMessageTypeId: "NetSuiteSalesOrderCancelBatch", isCountedAcrossStores: true, isLimitFixed: false },
  "order-change": { systemMessageTypeId: "NetSuiteSalesOrderUpdateBatch", isCountedAcrossStores: true, isLimitFixed: true },
  "order-moved": { systemMessageTypeId: "NetSuiteBrokeredOrderBatch", isCountedAcrossStores: true, isLimitFixed: true },
};

export const NETSUITE_ORDERS_SWITCH_ON_ORDER = ["customer", "sales-order", "payment", "refund", "exchange-payment", "store-shipment", "line-close", "order-change", "order-moved"];

export const NETSUITE_STEP_LISTS = ["failed", "stuck", "pending", "not-picked"];

export const NETSUITE_STEP_LIST_PATHS: Record<string, string> = {
  stuck: "stuck",
  pending: "pending",
  "not-picked": "notPicked",
};
