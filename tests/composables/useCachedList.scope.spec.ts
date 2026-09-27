// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

vi.mock("@/services/appCacheBootstrap", () => ({ bootstrapState: { running: false } }));

import { useCachedList } from "@/composables/useCachedList";

describe("useCachedList with a reactive scope", () => {
  it("re-subscribes when the scope changes, never showing the old scope's rows", async () => {
    const unsubscribed: string[] = [];
    let emit: Record<string, (rows: any[]) => void> = {};
    const entity: any = {
      table: "ledger",
      all: vi.fn(async () => []),
      live: (options: any) => ({
        subscribe: ({ next }: any) => {
          const shopId = options.scope.value;
          emit = { ...emit, [shopId]: next };

          return { unsubscribe: () => unsubscribed.push(shopId) };
        },
      }),
    };
    const shopId = ref("A");
    let list: any;
    mount(defineComponent({ setup() { list = useCachedList(entity, () => ({ scope: { field: "shopId", value: shopId.value } })); return () => h("div"); } }));

    emit.A([{ raw: { shopId: "A" } }]);
    expect(list.records.value).toEqual([{ shopId: "A" }]);

    shopId.value = "B";
    await Promise.resolve();
    expect(unsubscribed).toEqual(["A"]);
    expect(list.records.value).toEqual([]);
    expect(list.hydrated.value).toBe(false);

    emit.B([{ raw: { shopId: "B" } }]);
    expect(list.records.value).toEqual([{ shopId: "B" }]);
    expect(list.hydrated.value).toBe(true);
  });
});
