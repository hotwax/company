# OMS MCP setup guide

Verified September 11, 2026. Surface: Agents → MCP setup (`/mcp-setup`).

## OMS contract

The source inspected is [hotwax/moqui-ai at 68c2d8b](https://github.com/hotwax/moqui-ai/tree/68c2d8b56d0525bece21b75819224949a4b78e3a).

- [MoquiConf.xml](https://github.com/hotwax/moqui-ai/blob/68c2d8b56d0525bece21b75819224949a4b78e3a/MoquiConf.xml) mounts `mcp` on webroot. `mcp_enabled` defaults to `N`; installation alone does not enable the endpoint.
- [screen/Mcp.xml](https://github.com/hotwax/moqui-ai/blob/68c2d8b56d0525bece21b75819224949a4b78e3a/screen/Mcp.xml) accepts JSON-RPC POST at `/mcp/json`; GET returns 405. This URL is outside `/rest/s1/`.
- [McpMethodServices.xml](https://github.com/hotwax/moqui-ai/blob/68c2d8b56d0525bece21b75819224949a4b78e3a/service/ai/mcp/McpMethodServices.xml) allows anonymous discovery/initialization and tool listing.
- [ExecTool.groovy](https://github.com/hotwax/moqui-ai/blob/68c2d8b56d0525bece21b75819224949a4b78e3a/script/ai/mcp/ExecTool.groovy) requires a real user for execution, uses service authorization, and reports execution/auth failures with `result.isError`. HTTP 200 or a populated catalog is insufficient authentication proof. Calls are audited.
- Local `maarg-util/service/co/hotwax/auth/AuthServices.xml`, `generate#JwtToken`, accepts username, purpose, and expireDays (30 by default). Purpose is a token claim, not a permission scope. Users can generate their own token; generating for another username requires `SECURITY_ADMIN`.
- The live Rails OMS screen `/qapps/Oms/Settings/JwtTokens` confirmed Username, Purpose, Expires In (Days), and Generate Token. No credential was generated, read back, or copied for this task.
- Live Rails discovery returned 27 tools, including `list_ai_models` with `readOnlyHint: true` and no required arguments. A real call through the existing Rails MCP connection succeeded. That establishes one instance's current behavior, not compatibility of every deployment or client.

## Client-specific setup

| Client | Native setup used | Source |
| --- | --- | --- |
| Codex app | Settings → MCP servers → Add server; Streamable HTTP with an Authorization header. When header fields are unavailable, the fallback config uses `http_headers` with a local token placeholder. Save and restart MCP in the app. | [Desktop MCP setup and configuration](https://learn.chatgpt.com/docs/extend/mcp#configure-in-the-chatgpt-desktop-app), [Settings shortcuts](https://learn.chatgpt.com/docs/reference/settings) |
| Claude Code | Project `.mcp.json`; `type: http`, `url`, and `headers.Authorization` with environment expansion. | [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) |
| Claude Desktop/web | Organization custom web connector with the Request headers beta. `No sign-in` plus a required `authorization: Bearer …` header; organization-shared credential. Fall back to Claude Code when that beta is absent. | [Custom connector request headers](https://claude.com/docs/connectors/custom/remote-mcp#authenticating-with-request-headers), [authentication](https://claude.com/docs/connectors/building/authentication), [network requirements](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) |
| Antigravity | Native `mcpServers`, `serverUrl`, and `headers`; current global path `~/.gemini/config/mcp_config.json`. IDE users should open the file from Manage MCP Servers → View raw config. | [Google MCP documentation](https://antigravity.google/docs/mcp) |

Current Google documentation explicitly supports custom headers. Older local notes that describe Antigravity as unable to send bearer tokens do not describe the current documented schema. Client documentation is not an authenticated client-session test: no Codex, Claude, or Antigravity configuration was changed in this task.

The Codex instructions prioritize the desktop app and no longer require launching a CLI or exporting an environment variable. Official documentation verifies the app's Add server and Restart flow plus static HTTP headers in the shared configuration schema; direct inspection of the Codex settings UI was unavailable because computer use blocks that app. The guide therefore qualifies form-header availability and provides the documented config-file fallback. Config copies never include a generated token.

## Page behavior and boundaries

The page derives connection details from the signed-in Company backend at setup and on every Ionic view entry. It shows the resulting MCP server URL with a copy action; there is no instance URL input. Configuration copies contain placeholders or environment-variable references. Invalid schemes, credentials, query strings, and fragments disable configuration generation. A context path before `/rest/s1/` is preserved, and HTTP is accepted only for loopback development. If the backend cannot be determined, the page asks the user to sign in again.

The guide remains available on instances without MCP so users can find prerequisites. It does not present a connection status or infer MCP availability from Company login. Verification is explicitly a read-only tool call from the user's configured AI client. No automatic retry, installation, or connector provisioning is implemented.

## Inline JWT generation

The Generate token action requires the companion maarg-util route `POST /rest/s1/admin/user/jwtToken`, which calls the existing `co.hotwax.auth.AuthServices.generate#JwtToken` service. It sends a flat JSON body:

```json
{ "username": "SIGNED_IN_USERNAME", "purpose": "MCP", "expireDays": 30 }
```

The response contains `token` and `expirationTime` directly. The page offers 1, 7, 30, 90, 180, or 365 days, defaults to 30 days, and always uses the signed-in username. The existing service accepts an integer day count without a 30-day maximum. Its self-or-SECURITY_ADMIN check is unchanged. The request destination is derived again from the authenticated backend immediately before sending and must match the instance displayed by the page. An instance change during an in-flight request causes its response to be discarded.

The new `useMcpToken` composable owns transient credential state. It does not add tokens to Pinia, IndexedDB, browser storage, configuration templates, logs, or error messages. The token is masked initially, can be explicitly revealed/copied, and clears on leaving the Ionic view, signing out, changing user/instance, or disposing the scope. Those events also invalidate pending responses. Clearing the page does not revoke a token. Duplicate clicks are blocked while a request is pending or a token is displayed; the action does not retry automatically.

### Permission mismatch and required backend rollout

The initial implementation called the service through `/rpc/json`. The user then reported a permission denial in Company while generation worked in the OMS screen; the Company preview showed its 403 message. A read-only request through the existing Rails connection confirmed the same account (`aditya.patel`). The original failed response body was no longer available, and a live read of authorization failure entities was itself denied, so no exact failure record was recovered.

The source explains this route difference: `oms/data/SetupData.xml` grants the application groups inheritable authorization under `component://oms/screen/Oms.xml`; `ofbiz-oms-usl/data/SetupData.xml` grants the same groups inheritable authorization under `/admin`. `ServiceCallSyncImpl` separately authorizes the service unless it inherits authorization. The generic RPC entry point does not supply either application grant. `allow-remote="true"` exposes the service but does not grant permission. The earlier unauthenticated, missing-parameter probe only proved service resolution and validation, not authenticated authorization; it was insufficient acceptance evidence.

The companion maarg-util change adds only the authenticated admin route and reuses the original service. It adds no anonymous access, role grants, or authz bypass. It does make this existing screen operation available through the normal authenticated admin API. The previously proposed `admin/jwtTokens` onboarding API has a different contract and is not used.

**Roll out the companion backend route before using inline generation.** The OMS settings link appears only after a token-generation error, including the backend-update message on older instances. It is hidden initially, while retrying, and after success. Company does not fall back to generic RPC or automatically retry. No backend change was deployed and no token was minted by the agent during this investigation. Unit tests verify the REST request/response contract, errors, and transient credential lifecycle; authenticated issuance through the new route remains a deployment validation step.
