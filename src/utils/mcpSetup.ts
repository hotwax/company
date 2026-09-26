/** The Company REST base and MCP endpoint share the Moqui web application root. */
export function getMcpConnection(value: string) {
  try {
    const url = new URL(value.trim());
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    if (url.username || url.password || url.search || url.hash) return null;

    const root = url.pathname.replace(/\/+$/, "").replace(/\/(?:rest\/s1|mcp\/json)$/, "");
    return {
      endpoint: `${url.origin}${root}/mcp/json`,
      tokenSettings: `${url.origin}${root}/qapps/Oms/Settings/JwtTokens`,
    };
  } catch {
    return null;
  }
}

export type McpClient = "codex" | "claude" | "antigravity";

export function getMcpConfig(client: McpClient, endpoint: string) {
  if (client === "codex") {
    return `[mcp_servers.hotwax-oms]\nurl = ${JSON.stringify(endpoint)}\nhttp_headers = { Authorization = "Bearer REPLACE_WITH_YOUR_OMS_TOKEN" }`;
  }

  return JSON.stringify({
    mcpServers: {
      "hotwax-oms": client === "claude" ? {
        type: "http",
        url: endpoint,
        headers: { Authorization: "Bearer ${HOTWAX_OMS_MCP_TOKEN}" },
      } : {
        serverUrl: endpoint,
        headers: { Authorization: "Bearer REPLACE_WITH_YOUR_OMS_TOKEN" },
      },
    },
  }, null, 2);
}

// A hidden prompt keeps the token out of shell history. Works in bash and zsh.
export const tokenEnvironmentCommand = `printf 'OMS MCP token: '\nread -r -s HOTWAX_OMS_MCP_TOKEN\nprintf '\\n'\nexport HOTWAX_OMS_MCP_TOKEN`;

export const verificationPrompt = "Use the hotwax-oms MCP server to call list_ai_models with no arguments. Report whether the call succeeded. Do not change any OMS data.";
