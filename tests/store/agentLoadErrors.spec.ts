import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const api = vi.hoisted(() => vi.fn());

vi.mock("@common", () => ({
  api: (...args: any[]) => api(...args),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/utils", () => ({ hasError: (resp: any) => !!resp?.error }));
vi.mock("@/components/chat/ChatContainer.vue", () => ({ default: {} }));

import { useComposerStore } from "@/store/composer";
import { useWorkforceStore } from "@/store/workforce";

const forbidden = () => Object.assign(new Error("Request failed with status code 403"), { response: { status: 403 } });

/**
 * A 403 on the AI catalog/list reads used to be logged and swallowed, leaving the Composer model
 * selector, the tool dialog and the Workforce list blank with no explanation. The stores now record
 * why, so the views can say so.
 */
describe("agent store load errors", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    api.mockReset();
  });

  it("records a permission error for ai/models and ai/tools on 403", async () => {
    api.mockRejectedValue(forbidden());
    const composer = useComposerStore();

    await composer.fetchModelOptions();
    await composer.fetchToolCatalog();

    expect(composer.modelOptionsError).toBe("You do not have permission to view AI models.");
    expect(composer.toolCatalogError).toBe("You do not have permission to view AI tools.");
  });

  it("records a generic error for other failures and clears it after a successful reload", async () => {
    api.mockRejectedValueOnce(Object.assign(new Error("boom"), { response: { status: 500 } }));
    const composer = useComposerStore();

    await composer.fetchToolCatalog();
    expect(composer.toolCatalogError).toBe("Unable to load AI tools.");

    api.mockResolvedValueOnce({ data: { capabilityList: [{ toolId: "T1" }] } });
    await composer.fetchToolCatalog();
    expect(composer.toolCatalogError).toBe("");
    expect(composer.toolCatalog).toHaveLength(1);
  });

  it("records permission errors for ai/conversations and ai/agents on 403", async () => {
    api.mockRejectedValue(forbidden());
    const workforce = useWorkforceStore();

    await workforce.fetchConversations();
    await workforce.fetchActiveAgents();

    expect(workforce.conversationsError).toBe("You do not have permission to view agent conversations.");
    expect(workforce.activeAgentsError).toBe("You do not have permission to view active agents.");
  });

  it("treats an error response from ai/agents as a failure, not an empty agent list", async () => {
    api.mockResolvedValue({ error: true, data: { errors: "Server error" } });
    const workforce = useWorkforceStore();

    await workforce.fetchActiveAgents();

    expect(workforce.activeAgents).toEqual([]);
    expect(workforce.activeAgentsError).toBe("Unable to load active agents.");
  });
});
