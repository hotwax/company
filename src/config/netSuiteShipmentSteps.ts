export interface NetSuiteShipmentStep {
  label: string;
  meaning: string;
  isSharedByAllStores: boolean;
  lists: string[];
  listMeanings: Record<string, string>;
}

const FILES_FAILED = "Files this step made in the last 7 days with records the OMS could not save. Newest first.";
const FILES_STUCK = "Files this step made over 1 hour ago that the Data Manager has not finished. Newest first.";
const ORDERS_WAITING = "Orders sent to NetSuite over {hours} hours ago that still have an open item at a warehouse. Oldest first.";

export const NETSUITE_SHIPMENT_STEPS: Record<string, NetSuiteShipmentStep> = {
  harvest: {
    label: "Harvest",
    meaning: "Reads the shipments NetSuite marks shipped.",
    isSharedByAllStores: true,
    lists: ["failed", "stuck"],
    listMeanings: { failed: FILES_FAILED, stuck: FILES_STUCK },
  },
  sweep: {
    label: "Sweep",
    meaning: "Reads again the orders still open at a warehouse.",
    isSharedByAllStores: false,
    lists: ["failed", "stuck", "waiting"],
    listMeanings: { failed: FILES_FAILED, stuck: FILES_STUCK, waiting: ORDERS_WAITING },
  },
  boxes: {
    label: "Boxes",
    meaning: "Reads the boxes of each shipment.",
    isSharedByAllStores: true,
    lists: ["failed", "stuck", "waiting"],
    listMeanings: {
      failed: "Shipments the job read again and again, but NetSuite gave no boxes. Oldest first.",
      stuck: FILES_STUCK,
      waiting: "Shipments read over 1 hour ago that have no boxes yet. Oldest first.",
    },
  },
  shipments: {
    label: "Shipments",
    meaning: "Creates the OMS shipment, one package per box.",
    isSharedByAllStores: true,
    lists: ["failed", "stuck", "waiting"],
    listMeanings: {
      failed: "Shipments the OMS could not create. Oldest first.",
      stuck: FILES_STUCK,
      waiting: "Shipments with their boxes, read over 1 hour ago, not yet created in the OMS. Oldest first.",
    },
  },
  "closed-lines": {
    label: "Closed lines",
    meaning: "Cancels the items a warehouse closed without shipping.",
    isSharedByAllStores: false,
    lists: ["failed", "stuck", "waiting"],
    listMeanings: { failed: FILES_FAILED, stuck: FILES_STUCK, waiting: ORDERS_WAITING },
  },
};

export const NETSUITE_SHIPMENT_STEP_ORDER = ["harvest", "sweep", "boxes", "shipments", "closed-lines"];

export const NETSUITE_SHIPMENT_SWITCH_ON_ORDER = ["harvest", "boxes", "shipments", "sweep", "closed-lines"];

export const NETSUITE_SHIPMENT_LIST_LABELS: Record<string, string> = { failed: "Failed", stuck: "Stuck", waiting: "Waiting" };

export const DATA_MANAGER_STATUS_LABELS: Record<string, string> = {
  DmlsPending: "Pending", DmlsQueued: "Queued", DmlsRunning: "Running", DmlsFinished: "Finished", DmlsFailed: "Failed", DmlsCancelled: "Cancelled",
};
