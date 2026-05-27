import { reactive, toRefs } from "vue";
import api from "@/api";
import logger from "@/logger";
import { translate } from "@/i18n";

const state = reactive({
  productUpdateHistories: [] as any[],
  loading: false
});

function parseJson(value: any, defaultValue: any) {
  if (!value) return defaultValue;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    logger.error("Failed to parse product update history JSON", err);
    return defaultValue;
  }
}

function formatShopifyGid(value: string): string {
  const gidParts = value.split("/");
  const id = gidParts.pop();
  const resource = gidParts.pop();
  if (resource && id) return `${resource} ${id}`;
  return value;
}

function formatValue(value: any): string {
  if (value === null || value === undefined || value === "") return translate("Blank");
  if (typeof value === "boolean") return value ? translate("Yes") : translate("No");
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") {
    if (value.name || value.value) return [value.name, value.value].filter(Boolean).join(": ");
    if (value.id) return value.id;
    return JSON.stringify(value);
  }
  const stringValue = String(value);
  if (stringValue.startsWith("gid://shopify/")) return formatShopifyGid(stringValue);
  if (stringValue === "true") return translate("Yes");
  if (stringValue === "false") return translate("No");
  return stringValue;
}

function addScalarDetail(details: any[], diffs: any, key: string, label: string) {
  if (diffs[key] !== undefined && diffs[key] !== null && diffs[key] !== "") {
    details.push({
      type: "added",
      label: translate(label),
      value: formatValue(diffs[key]),
      items: []
    });
  }
}

function addCollectionDetails(details: any[], collection: any, label: string, formatter = (item: any) => ({ label: "", value: formatValue(item) })) {
  if (!collection) return;
  if (collection.added?.length) {
    const items = collection.added.map(formatter);
    details.push({
      type: "added",
      label: translate(label),
      value: items.map((item: any) => [item.label, item.value].filter(Boolean).join(": ")).join(", "),
      items
    });
  }
  if (collection.removed?.length) {
    const items = collection.removed.map(formatter);
    details.push({
      type: "removed",
      label: translate(label),
      value: items.map((item: any) => [item.label, item.value].filter(Boolean).join(": ")).join(", "),
      items
    });
  }
}

const processHistories = (histories: any[]) => {
  return histories.map((history: any) => {
    const diffs = parseJson(history.differenceMap, {});
    const details = [] as any[];

    addScalarDetail(details, diffs, "title", "Title");
    addScalarDetail(details, diffs, "handle", "Handle");
    addScalarDetail(details, diffs, "vendor", "Vendor");
    addScalarDetail(details, diffs, "price", "Price");
    addScalarDetail(details, diffs, "sku", "SKU");
    addScalarDetail(details, diffs, "requiresShipping", "Requires shipping");
    addScalarDetail(details, diffs, "requiresComponents", "Requires components");
    addScalarDetail(details, diffs, "hasVariantsThatRequireComponents", "Variant components");
    addScalarDetail(details, diffs, "hasVariantsThatRequiresComponents", "Variant components");
    addScalarDetail(details, diffs, "isGiftCard", "Gift card");
    addScalarDetail(details, diffs, "weightValue", "Weight");
    addScalarDetail(details, diffs, "inventoryItemId", "Inventory item");

    addCollectionDetails(details, diffs.tags, "Tags");
    addCollectionDetails(details, diffs.features, "Features", (feature: any) => {
      return {
        label: formatValue(feature.name),
        value: formatValue(feature.value)
      };
    });
    addCollectionDetails(details, diffs.assocs, "Variants", (assoc: any) => ({
      label: assoc.type ? formatValue(assoc.type) : "",
      value: assoc.id ? formatValue(assoc.id) : formatValue(assoc)
    }));

    const identifications = parseJson(history.identifications, diffs.identifications || {});
    if (Object.keys(identifications || {}).length) {
      details.push({
        type: "added",
        label: translate("Identifiers"),
        value: formatValue(identifications),
        items: Object.entries(identifications).map(([label, value]) => ({
          label: formatValue(label),
          value: formatValue(value)
        }))
      });
    }

    return {
      ...history,
      diffs,
      details,
      changes: details.map((detail) => `${detail.type === "added" ? "+" : "-"} ${detail.label}: ${detail.value}`)
    };
  });
};

function getProductUpdateHistoryPayload(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.productUpdateHistory)) return data.productUpdateHistory;
  if (Array.isArray(data?.productUpdateHistories)) return data.productUpdateHistories;
  return [];
}

export function useProductUpdateHistory() {
  const setProductUpdateHistory = (histories: any) => {
    state.productUpdateHistories = processHistories(getProductUpdateHistoryPayload(histories));
    return state.productUpdateHistories;
  };

  const fetchProductUpdateHistory = async (params: any) => {
    state.loading = true;
    try {
      const response = await api({
        url: "oms/products/productUpdateHistories",
        method: "GET",
        params: {
          ...params,
          orderByField: "-lastUpdatedStamp"
        }
      }) as any;

      return setProductUpdateHistory(response?.data);
    } catch (err) {
      logger.error("Failed to fetch product update history", err);
      state.productUpdateHistories = [];
      throw err;
    } finally {
      state.loading = false;
    }
  };

  return {
    ...toRefs(state),
    setProductUpdateHistory,
    fetchProductUpdateHistory
  };
}
