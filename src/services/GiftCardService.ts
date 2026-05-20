import api from "@/api";

export interface GiftCardIssueResult {
  name: string;
  code: string;
  status: "success" | "error";
  giftCardId?: string;
  maskedCode?: string;
  lastCharacters?: string;
  error?: string;
}

interface ShopifyGraphqlResponse {
  response?: any;
  data?: any;
  errors?: any[];
}

const SHOP_CURRENCY_QUERY = `
query ShopCurrencyCode {
  shop {
    currencyCode
  }
}
`;

const GIFT_CARD_CREATE_MUTATION = `
mutation GiftCardCreate($input: GiftCardCreateInput!) {
  giftCardCreate(input: $input) {
    giftCard {
      id
      maskedCode
      lastCharacters
      initialValue {
        amount
        currencyCode
      }
    }
    giftCardCode
    userErrors {
      field
      message
    }
  }
}
`;

async function callShopifyGraphql(systemMessageRemoteId: string, queryText: string, variables?: any) {
  const resp = await api({
    url: "shopify/graphql",
    method: "post",
    data: { systemMessageRemoteId, queryText, ...(variables ? { variables } : {}) }
  }) as any;

  const body: ShopifyGraphqlResponse = resp?.data || {};
  const payload = body.response || body.data || body;

  const topErrors = body.errors;
  const payloadErrors = payload?.errors;
  if ((Array.isArray(topErrors) && topErrors.length) || (Array.isArray(payloadErrors) && payloadErrors.length)) {
    const errs = (topErrors?.length ? topErrors : payloadErrors) as any[];
    const message = errs.map((e) => e?.message || JSON.stringify(e)).join(", ");
    throw new Error(message || "Shopify GraphQL request failed.");
  }

  return payload;
}

const fetchShopCurrencyCode = async (systemMessageRemoteId: string): Promise<string> => {
  const payload = await callShopifyGraphql(systemMessageRemoteId, SHOP_CURRENCY_QUERY);
  const code = payload?.shop?.currencyCode || payload?.data?.shop?.currencyCode;
  if (!code) throw new Error("Shopify shop currencyCode was not returned.");
  return code as string;
};

const issueGiftCard = async (params: {
  systemMessageRemoteId: string;
  name: string;
  code: string;
  initialValue: string;
  note?: string;
}): Promise<GiftCardIssueResult> => {
  try {
    const input: any = {
      code: params.code,
      initialValue: params.initialValue
    };
    if (params.note) input.note = params.note;

    const payload = await callShopifyGraphql(params.systemMessageRemoteId, GIFT_CARD_CREATE_MUTATION, { input });
    const result = payload?.giftCardCreate || payload?.data?.giftCardCreate;
    const userErrors = result?.userErrors || [];

    if (userErrors.length) {
      return {
        name: params.name,
        code: params.code,
        status: "error",
        error: userErrors.map((e: any) => `${(e.field || []).join(".")}: ${e.message}`.trim().replace(/^:\s*/, "")).join("; ")
      };
    }

    const giftCard = result?.giftCard;
    return {
      name: params.name,
      code: result?.giftCardCode || params.code,
      status: "success",
      giftCardId: giftCard?.id,
      maskedCode: giftCard?.maskedCode,
      lastCharacters: giftCard?.lastCharacters
    };
  } catch (error: any) {
    return {
      name: params.name,
      code: params.code,
      status: "error",
      error: error?.message || "Unknown error"
    };
  }
};

export const GiftCardService = {
  fetchShopCurrencyCode,
  issueGiftCard
};
