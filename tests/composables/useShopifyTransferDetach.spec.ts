import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@common", () => ({ api: state.api, commonUtil: { hasError: (response: any) => Boolean(response?.error) } }));
import { useShopifyTransferDetach } from "@/composables/useShopifyTransferDetach";

describe("detaching a transfer from native sync", () => {
  beforeEach(() => {vi.clearAllMocks();});

  it("detaches in one server call that carries the owner and the publish choice", async () => {
    state.api.mockResolvedValue({ data: { shopId: "UK", deletedLineCount: 1, replayedEventCount: 2, createdDetailCount: 3, existingDetailCount: 1 } });

    const result = await useShopifyTransferDetach().detach("UK", "TO1", true);

    expect(state.api).toHaveBeenCalledTimes(1);
    expect(state.api).toHaveBeenCalledWith({ url: "sob/shopify/transferSync/detach", method: "post", data: { orderId: "TO1", shopId: "UK", publishEvents: true } });
    expect(result).toEqual({ deletedLineCount: 1, replayedEventCount: 2, createdDetailCount: 3, existingDetailCount: 1 });
  });

  it("never calls the removed owner delete or per-event endpoints", async () => {
    state.api.mockResolvedValue({ data: { deletedLineCount: 0 } });

    await useShopifyTransferDetach().detach("UK", "TO1", false);

    const urls = state.api.mock.calls.map(([request]: any) => request.url);
    expect(urls).toEqual(["sob/shopify/transferSync/detach"]);
    expect(state.api.mock.calls[0][0].data.publishEvents).toBe(false);
  });

  it("shows the server's refusal instead of a generic failure", async () => {
    const refusal = "Transfer order [TO1] cannot be detached from shop [UK]: it has Shopify transfer [73]. Cancel it in Shopify instead.";
    state.api.mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), { response: { status: 400, data: { errors: refusal } } }));

    await expect(useShopifyTransferDetach().detach("UK", "TO1", false)).rejects.toThrow(refusal);
  });
});
