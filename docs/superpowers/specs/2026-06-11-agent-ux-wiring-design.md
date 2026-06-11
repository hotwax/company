# Agent UX ↔ moqui-ai Wiring — Design

**Date:** 2026-06-11
**Repos:** `hotwax/company` (PWA client) + `hotwax/moqui-ai` (backend, deployed in asbeauty)
**Reference UX:** [hotwax/company PR #154](https://github.com/hotwax/company/pull/154) (branch `test/combine-pr-141-142`)

## Goal

Make the agent UX in PR #154 functional end-to-end against the moqui-ai component:

- **Composer** (`src/views/agent/Composer.vue`) — form-based agent builder: name, instructions
  (+ Enhance), model + reasoning effort, tool grants with per-tool auto-approve, live preview
  chat, Save (draft) and Activate.
- **Workforce** (`src/views/agent/Workforce.vue`) — conversation inbox across all users with
  Pending/Running/Error filters, thread view with messages, tool calls, and Allow/Deny
  permission cards, message sending, and starting new conversations.

Today the UX is a pure mockup (hardcoded data, zero API calls) and moqui-ai has **no REST
exposure at all** — no `ai.rest.xml` exists, so `/rest/s1/ai/...` 404s. The PWA's `api()`
helper (from `@common`) targets `<maarg>/rest/s1/<url>`, so the integration point is a new
service REST file in moqui-ai plus a small "experience layer" of services, and a full client
wiring layer (Pinia stores) in the PWA.

## Decisions (confirmed with Anil, 2026-06-11)

1. **Save = draft; Activate is separate.** Save persists `AI_AGENT_DRAFT`; an explicit
   Activate action (new button) calls `activate#Agent` which re-validates grants.
2. **Workforce shows ALL users' conversations** (company-wide ops console), not just the
   signed-in user's. Acceptable under today's `ALL_USERS` authz; `AI_OPERATOR` scoping is a
   follow-up.
3. **Enhance button** gets a real LLM-backed service (`enhance#Instructions`), not deferred,
   not `propose#Naming`.
4. **Per-grant approval override may loosen.** Effective gating = `requiresApprovalOverride
   ?? tool default`, both directions. This revises moqui-ai's "stricter only" ADR — a human
   composing the agent explicitly grants per-tool trust. The runner currently ignores the
   override entirely (bug); it will honor it in both `run()` and `resume()`. Preview mode
   still force-gates every mutating tool regardless of override.
5. **Branches:** company `feat/agent-ux-wiring` (off `test/combine-pr-141-142`, so PR #154's
   UX is included; separate PR). moqui-ai `feat/pwa-rest-api` (off `main`, PR to
   hotwax/moqui-ai). PR #154 itself stays untouched as the UX reference.
6. **Environment:** asbeauty runs against local MySQL (`hcsd_asbeauty`); LLM keys come from
   a git-ignored `dev.env` (copy from a sibling project's moqui-ai checkout; both
   `ai_anthropic_key` and `ai_openai_key` exist there). Mock provider remains available for
   tests.

## Architecture

Thin REST facade over existing moqui-ai services (maarg house style — mirrors
`admin.rest.xml` / `oms.rest.xml`), plus new services only where the UX needs aggregation
that doesn't exist. Client follows the app's existing pattern: Pinia store actions calling
`api()` directly, views driven by store state, polling for liveness (no streaming in v1).

### 1. Server — REST surface (`moqui-ai/service/ai.rest.xml`, base `/rest/s1/ai`)

| Method + path | Maps to |
|---|---|
| `GET /agents` | agent list (filter by `statusId`) |
| `POST /agents` | `ai.AgentServices.store#AiAgent` (create draft) |
| `GET /agents/{agentId}` | new `ai.AgentServices.get#AgentDetail` |
| `PUT /agents/{agentId}` | `ai.AgentServices.store#AiAgent` (update) |
| `POST /agents/{agentId}/tools` | `ai.AgentServices.store#AiAgentTool` (grant incl. `requiresApprovalOverride`) |
| `DELETE /agents/{agentId}/tools/{toolId}` | delete grant (`moqui.ai.AiAgentTool`) |
| `POST /agents/{agentId}/preview` | `ai.ComposerServices.preview#Agent` |
| `POST /agents/{agentId}/activate` | `ai.ComposerServices.activate#Agent` |
| `GET /tools` | `ai.ComposerServices.find#Capability` |
| `GET /models` | new `ai.AgentServices.list#Model` |
| `POST /instructions/enhance` | new `ai.ComposerServices.enhance#Instructions` |
| `GET /conversations` | new `ai.WorkforceServices.list#Conversation` |
| `POST /conversations` | `ai.AgentServices.create#Conversation` |
| `GET /conversations/{conversationId}` | new `ai.WorkforceServices.get#ConversationDetail` |
| `POST /conversations/{conversationId}/messages` | `ai.AgentServices.run#Conversation` (synchronous) |
| `POST /toolCallRequests/{toolCallRequestId}/approve` | `ai.ToolCallRequestServices.approve#ToolCallRequest` |
| `POST /toolCallRequests/{toolCallRequestId}/reject` | `ai.ToolCallRequestServices.reject#ToolCallRequest` |

Security data: `AT_REST_PATH` artifact `"/ai"` in an artifact group granted to `ALL_USERS`
(`inheritAuthz="Y"`), exactly mirroring the `oms` component's `SetupData.xml`. The
underlying `ai.*` services and `moqui.ai.*` entities are already authorized via
`AI_OPS_SCREENS`. Because this is new install-type data in `data/`, deployed environments
need a matching `upgrade/<release>/UpgradeData.xml` step (per maarg data-load rules).

### 2. Server — new services (moqui-ai)

**`ai.WorkforceServices.list#Conversation`** — the inbox aggregate. All conversations,
newest activity first (via `AiConversationActivity`), each row: `conversationId`, `agentId`,
`agentName`, `title`, `userId`, `lastActivityDate`, `derivedStatus`, `pendingToolName`.
Derived status from the conversation's **latest run**:
`AI_RUN_SUSPENDED` (with pending requests) → `pending`; `AI_RUN_RUNNING` → `running`;
`AI_RUN_FAILED|ABORTED|TRUNCATED` → `error`; otherwise → `idle`.
Implementation: batched queries (conversations page → runs for those conversationIds →
pending requests for suspended runs), no per-row lookups. Supports `statusFilter` and
pagination params.

**`ai.WorkforceServices.get#ConversationDetail`** — one thread: conversation + agent info,
ordered messages (`role`, `content`, `toolCalls` parsed from JSON, `toolCallId`,
`agentRunId`, `createdDate`), pending `AiToolCallRequest` rows for the suspended run
(`toolCallRequestId`, `toolName`, `arguments`), latest run `statusId`/`errorText`.

**`ai.AgentServices.get#AgentDetail`** — agent fields + granted tools, each with
`requiresApproval` (tool default), `requiresApprovalOverride`, and the resolved effective
value.

**`ai.AgentServices.list#Model`** — model options for the Composer dropdowns: registered
providers (from `AiToolFactory`) + distinct `AiModelPrice` provider/model rows + the
configured defaults (`ai_default_provider`/`ai_default_model`); plus the reasoning-effort
enumeration (`none|low|medium|high`).

**`ai.ComposerServices.enhance#Instructions`** — in: `instructions` (+ optional `agentName`
for context); out: `enhancedInstructions`. Calls the default provider with a fixed
system prompt ("rewrite as a precise, well-structured agent system prompt; preserve intent;
no invention"). Guarded like `propose#Naming`'s LLM path: provider failure returns an error
message and leaves the draft untouched.

### 3. Server — honor `requiresApprovalOverride`

One shared resolution helper used by both gating sites in `AgentRunner`
(`run()`'s `needApproval` filter and `resume()`'s `anyUndecided` check):
`effectiveRequiresApproval(toolName) = grant.requiresApprovalOverride != null ?
override == 'Y' : catalog default`. The per-run grant map is loaded once per run/resume.
Preview (`forceApprovalOnMutating`) is unchanged: mutating tools are always gated in
preview. Doc comments on `set#Guardrail` / `store#AiAgentTool` updated to "explicit
per-grant trust (either direction)"; `docs/explanation/decisions.md` gets the ADR revision.
Approval test specs extended: loosened mutating tool executes without suspension; tightened
read-only tool suspends.

### 4. Client — stores (company PWA)

Two Pinia stores, actions calling `api()` directly (house pattern, cf. `store/quickbox.ts`):

- **`src/store/composer.ts`** — draft agent (`agentId`, form fields), tool catalog, selected
  grants with auto-approve flags, preview transcript, model options. Persists only the draft
  `agentId` (resume after refresh).
- **`src/store/workforce.ts`** — conversation list, active filter, selected conversation
  detail, polling timer state, in-flight send/decide flags. Not persisted.

### 5. Client — Composer wiring

- **Save** → `POST /agents` (create) or `PUT /agents/{id}`, then diff-sync grants:
  added tools → `POST .../tools` (auto-approve checked → `requiresApprovalOverride: 'N'`,
  unchecked → no override), removed tools → `DELETE`, changed checkbox → re-`POST` (store is
  idempotent).
- **Activate** (new button next to Save) → `POST /agents/{id}/activate`; enabled once the
  draft is saved and named; success toast links to Workforce.
- **Tools modal** → `GET /tools` once on open; client-side filtering (catalog is small).
- **Preview panel** → auto-saves the draft, then each send is one stateless
  `POST /agents/{id}/preview` with `testMessage`; renders `assistantMessage` and `heldCalls`
  as tool-call cards marked "held — would require approval". Client keeps the visual
  transcript; the backend preview itself is single-turn.
- **Enhance** → `POST /instructions/enhance`; replaces textarea content after a
  confirmation; failure toast leaves text untouched.
- **Model / reasoning dropdowns** → `GET /models` (replaces the hardcoded `5.0/5.5/6.0`
  mock values).

### 6. Client — Workforce wiring

- Inbox: fetch on `onIonViewWillEnter` + poll every 10s while the view is active
  (cleared on leave). Filter chips map to `derivedStatus`; `idle` rows appear under "All".
- Thread: select → `GET /conversations/{id}`. **ChatContainer is restructured from fixed
  groups (`messages`, then `toolCalls`, then `permissions`) to an ordered timeline**
  (`items: [{type: 'message'|'toolCall'|'permission', ...}]`) because real threads
  interleave turns. The child components (`ChatMessage`, `ChatToolCall`,
  `ChatToolPermission`) are reused unchanged; Composer's preview adopts the same shape.
- Send → `POST /conversations/{id}/messages` with a long per-call timeout (~120s; the run is
  synchronous server-side). Optimistic user bubble + running indicator; on response, refresh
  the thread (response carries `assistantMessage`, `awaitingApproval`,
  `toolCallRequestIds`).
- Allow/Deny → `POST /toolCallRequests/{id}/approve|reject` (server resumes the run before
  responding — also a long timeout), then refresh thread + inbox row.
- **New conversation** (small UX addition, not in the mockup): "+" button in the list pane →
  agent picker (active agents from `GET /agents?statusId=AI_AGENT_ACTIVE`) →
  `POST /conversations` → select the new thread. Title: backend auto-title if produced,
  else "New conversation".

### 7. Error handling

House style throughout: inspect `response?.data` for Moqui error shapes, `showToast` +
`logger.error`. Status-derivation never throws on missing runs (new conversation with no
runs = `idle`). A failed send keeps the optimistic bubble with a retry affordance removed
and an error toast (thread refresh restores server truth).

### 8. Testing & verification

- **moqui-ai (Spock):** `WorkforceServicesSpec` (list/detail against seeded conversations,
  derived statuses incl. suspended-with-pending), override honoring in the approval specs
  (loosen + tighten), `enhance#Instructions` with the mock provider, REST smoke via service
  facade.
- **End-to-end:** start asbeauty (`./gradlew run` with MySQL + dev.env keys), run the PWA
  dev server, then `/browse`-driven QA: compose agent → preview (held mutation) → activate →
  start conversation → send message → approve a gated tool call → verify resume + final
  answer; verify inbox filters and polling.

### 9. Out of scope (follow-ups)

Streaming responses; the conversational Composer agent; editing already-ACTIVE agents in the
Composer (v1 composes new agents); capability-request / knowledge / glossary / cost UIs;
`AI_OPERATOR` role scoping; push/webhook-based liveness (v1 polls).
