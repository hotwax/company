import { describe, expect, it } from "vitest";
import { getMcpConfig, getMcpConnection } from "@/utils/mcpSetup";

describe("MCP connection templates", () => {
  it.each([
    ["https://example.hotwax.io/rest/s1/", "https://example.hotwax.io/mcp/json"],
    ["https://example.hotwax.io/", "https://example.hotwax.io/mcp/json"],
    ["https://example.hotwax.io/moqui/rest/s1/", "https://example.hotwax.io/moqui/mcp/json"],
    ["https://example.hotwax.io/mcp/json", "https://example.hotwax.io/mcp/json"],
    ["http://localhost:8080/rest/s1/", "http://localhost:8080/mcp/json"],
  ])("derives the MCP endpoint from %s", (input, expected) => {
    expect(getMcpConnection(input)?.endpoint).toBe(expected);
  });

  it.each(["", "rails-oms", "javascript:alert(1)", "http://example.com", "https://user:secret@example.com", "https://example.com?token=secret", "https://example.com/#secret"])("rejects unsafe or incomplete instance URLs: %s", (input) => {
    expect(getMcpConnection(input)).toBeNull();
  });

  it("keeps token settings on the selected instance and context root", () => {
    expect(getMcpConnection("https://example.com/moqui/rest/s1/")?.tokenSettings).toBe("https://example.com/moqui/qapps/Oms/Settings/JwtTokens");
  });

  it("uses native client URL fields and credential placeholders", () => {
    const endpoint = "https://example.com/mcp/json";
    const claude = JSON.parse(getMcpConfig("claude", endpoint)).mcpServers["hotwax-oms"];
    expect(claude).toEqual({ type: "http", url: endpoint, headers: { Authorization: "Bearer ${HOTWAX_OMS_MCP_TOKEN}" } });
    const antigravity = JSON.parse(getMcpConfig("antigravity", endpoint)).mcpServers["hotwax-oms"];
    expect(antigravity).toEqual({ serverUrl: endpoint, headers: { Authorization: "Bearer REPLACE_WITH_YOUR_OMS_TOKEN" } });
    const codex = getMcpConfig("codex", endpoint);
    expect(codex).toContain(`url = "${endpoint}"`);
    expect(codex).toContain('http_headers = { Authorization = "Bearer REPLACE_WITH_YOUR_OMS_TOKEN" }');
    expect(codex).not.toContain("bearer_token_env_var");
  });
});
