# Agent UX ↔ moqui-ai Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent UX from hotwax/company PR #154 (Composer + Workforce views) fully functional against the moqui-ai component deployed in asbeauty.

**Architecture:** Thin REST facade (`ai.rest.xml`) over existing moqui-ai services plus a small experience layer (workforce inbox aggregate, conversation detail, model list, instruction enhancement) and an AgentRunner fix to honor per-grant approval overrides. Client side: two Pinia stores calling `api()` from `@common`, a timeline refactor of ChatContainer, and full wiring of the two views with 10s polling for liveness.

**Tech Stack:** Moqui (XML services + Groovy, Spock tests) · Vue 3 + Ionic + Pinia + Vite · maarg REST conventions (`/rest/s1/ai/...`)

**Spec:** `docs/superpowers/specs/2026-06-11-agent-ux-wiring-design.md` (company repo)

**Repos & branches:**
- moqui-ai: `/Users/anilpatel/maarg-sd/asbeauty/runtime/component/moqui-ai`, branch `feat/pwa-rest-api` off `main`
- company PWA: `/Users/anilpatel/pwa-sd/company`, branch `feat/agent-ux-wiring` (already created off `origin/test/combine-pr-141-142`)

**Key facts the executor must know:**
- moqui-ai tests: run from asbeauty root `/Users/anilpatel/maarg-sd/asbeauty` with `./gradlew :runtime:component:moqui-ai:test`. The suite (`src/test/groovy/MoquiSuite.groovy`) boots Moqui against `runtime/conf/MoquiDevConf.xml` = **local MySQL `hcsd_asbeauty`** — MySQL must be running, the asbeauty Moqui **server must be stopped** while tests run. New test classes MUST be registered in `MoquiSuite.groovy` or they won't run.
- Test tools seeded by `data/AiTestToolData.xml`: `TL_ECHO` (`get_echo`, requiresApproval=N) and `TL_GATED` (`get_gated_echo`, requiresApproval=Y), both READ_ONLY.
- PWA has **no unit-test harness** (`scripts: dev/build/preview/lint`). Client verification = `npm run build` + `npm run lint` per task, full browser QA in Phase C.
- PWA `api({url, method, data, params})` from `@common` prefixes `<maarg>/rest/s1/`, sends Bearer token, axios has no default timeout (long-running agent calls are OK).
- The maarg fork's `/rest/s1` dispatch is strictly `.rest.xml`-based (`RestApi.run`); moqui-ai currently has NO rest file — that's why nothing is reachable today.

---

## Phase A — moqui-ai backend

### Task A1: Branch + baseline

**Files:** none (git only)

- [ ] **Step 1: Create branch off main**

```bash
cd /Users/anilpatel/maarg-sd/asbeauty/runtime/component/moqui-ai
git status --porcelain   # expect empty
git checkout main && git pull && git checkout -b feat/pwa-rest-api
```

- [ ] **Step 2: Baseline test run (server stopped, MySQL up)**

```bash
cd /Users/anilpatel/maarg-sd/asbeauty && ./gradlew :runtime:component:moqui-ai:test
```
Expected: BUILD SUCCESSFUL, all existing tests pass. If MySQL is down, start it first (`brew services start mysql` or however the local MySQL runs). If this fails at baseline, STOP and report — do not proceed on a broken baseline.

### Task A2: AgentRunner honors `requiresApprovalOverride` (TDD)

**Files:**
- Modify: `src/test/groovy/AiApprovalTests.groovy` (append two tests before the closing `}`)
- Modify: `src/main/groovy/org/moqui/ai/AgentRunner.groovy`
- Modify: `service/ai/ComposerServices.xml` (set#Guardrail comment)
- Modify: `service/ai/AgentServices.xml` (store#AiAgentTool param description)

- [ ] **Step 1: Write the two failing tests** — append inside `class AiApprovalTests` in `src/test/groovy/AiApprovalTests.groovy`, following the file's existing setup/cleanup idiom exactly:

```groovy
    def "a grant override N loosens a gated tool so the run completes without suspension"() {
        given:
        ec.artifactExecution.disableAuthz()
        org.moqui.ai.provider.MockProvider.reset()
        ec.transaction.runRequireNew(30, "ai test setup", {
            ec.entity.makeDataLoader().location("component://moqui-ai/data/AiStatusData.xml").load()
            ec.entity.makeDataLoader().location("component://moqui-ai/data/AiTestToolData.xml").load()
            ensureTestUser()
            ec.entity.makeValue("moqui.ai.AiAgent").setAll([agentId: "OvrAgentN", agentName: "OvrAgentN", providerName: "mock",
                modelName: "mock-1", systemPrompt: "x", maxIterations: 5, statusId: "AI_AGENT_ACTIVE"]).createOrUpdate()
            ec.entity.makeValue("moqui.ai.AiAgentTool").setAll([agentId: "OvrAgentN", toolId: "TL_GATED",
                requiresApprovalOverride: "N"]).createOrUpdate()
        })
        ai.refreshCatalog()
        ((org.moqui.impl.context.UserFacadeImpl) ec.user).internalLoginUser("AiTestUser")
        ec.message.clearErrors()
        MockProvider.enqueue([assistantText: null, finishReason: "tool_use",
            toolCalls: [[id: "c1", name: "get_gated_echo", arguments: [text: "hi"]]], tokensIn: 1L, tokensOut: 1L])
        MockProvider.enqueue([assistantText: "ran without approval", finishReason: "stop", toolCalls: [], tokensIn: 1L, tokensOut: 1L])
        when:
        Map out = ec.service.sync().name("ai.AgentServices.run#Agent").parameters([agentId: "OvrAgentN", userMessage: "go"]).call()
        then:
        out.statusId == "AI_RUN_COMPLETED"
        // never suspended: no approval request rows, and the gated tool executed
        ec.entity.find("moqui.ai.AiToolCallRequest").condition("agentRunId", out.agentRunId).list().isEmpty()
        ec.entity.find("moqui.ai.AiToolCall").condition("agentRunId", out.agentRunId).condition("toolCallId", "c1").one().success == "Y"
        cleanup:
        ec.entity.find("moqui.ai.AiAgentTool").condition("agentId", "OvrAgentN").deleteAll()
        ec.entity.find("moqui.ai.AiAgent").condition("agentId", "OvrAgentN").deleteAll()
        ec.artifactExecution.enableAuthz()
    }

    def "a grant override Y tightens a non-gated tool so the run suspends"() {
        given:
        ec.artifactExecution.disableAuthz()
        org.moqui.ai.provider.MockProvider.reset()
        ec.transaction.runRequireNew(30, "ai test setup", {
            ec.entity.makeDataLoader().location("component://moqui-ai/data/AiStatusData.xml").load()
            ec.entity.makeDataLoader().location("component://moqui-ai/data/AiTestToolData.xml").load()
            ensureTestUser()
            ec.entity.makeValue("moqui.ai.AiAgent").setAll([agentId: "OvrAgentY", agentName: "OvrAgentY", providerName: "mock",
                modelName: "mock-1", systemPrompt: "x", maxIterations: 5, statusId: "AI_AGENT_ACTIVE"]).createOrUpdate()
            ec.entity.makeValue("moqui.ai.AiAgentTool").setAll([agentId: "OvrAgentY", toolId: "TL_ECHO",
                requiresApprovalOverride: "Y"]).createOrUpdate()
        })
        ai.refreshCatalog()
        ((org.moqui.impl.context.UserFacadeImpl) ec.user).internalLoginUser("AiTestUser")
        ec.message.clearErrors()
        MockProvider.enqueue([assistantText: null, finishReason: "tool_use",
            toolCalls: [[id: "c1", name: "get_echo", arguments: [text: "hi"]]], tokensIn: 1L, tokensOut: 1L])
        MockProvider.enqueue([assistantText: "should not reach here", finishReason: "stop", toolCalls: [], tokensIn: 1L, tokensOut: 1L])
        when:
        Map out = ec.service.sync().name("ai.AgentServices.run#Agent").parameters([agentId: "OvrAgentY", userMessage: "go"]).call()
        then:
        out.statusId == "AI_RUN_SUSPENDED"
        out.awaitingApproval == true
        ec.entity.find("moqui.ai.AiToolCall").condition("agentRunId", out.agentRunId).list().isEmpty()
        ec.entity.find("moqui.ai.AiToolCallRequest").condition("agentRunId", out.agentRunId)
            .condition("statusId", "AI_TCREQ_PENDING").list().size() == 1
        cleanup:
        ec.entity.find("moqui.ai.AiToolCallRequest").condition("agentRunId", out.agentRunId).deleteAll()
        ec.entity.find("moqui.ai.AiAgentTool").condition("agentId", "OvrAgentY").deleteAll()
        ec.entity.find("moqui.ai.AiAgent").condition("agentId", "OvrAgentY").deleteAll()
        ec.artifactExecution.enableAuthz()
    }
```

- [ ] **Step 2: Run, verify both fail**

```bash
cd /Users/anilpatel/maarg-sd/asbeauty && ./gradlew :runtime:component:moqui-ai:test
```
Expected: FAIL — loosen test gets `AI_RUN_SUSPENDED` (override ignored), tighten test gets `AI_RUN_COMPLETED`.

- [ ] **Step 3: Implement in `AgentRunner.groovy`**

(a) Add a field right after `private boolean forceApprovalOnMutating = false` (~line 26):

```groovy
    /** Per-run approval overrides from AiAgentTool grants (toolName -> 'Y'/'N'), loaded with the
     *  tool schemas. Effective gating = the override when set (either direction — explicit
     *  per-grant trust), else the catalog tool default. */
    private Map<String, String> approvalOverrides = [:]
```

(b) In `loadToolSchemas(String agentId)` (~line 527): reset and populate the map. Replace the method body's loop with:

```groovy
    private List<Map> loadToolSchemas(String agentId) {
        List<Map> schemas = []
        approvalOverrides = [:]
        for (EntityValue grant in ec.entity.find("moqui.ai.AiAgentTool")
                .condition("agentId", agentId).useCache(false).list()) {   // fresh: the Composer grants tools to agents at runtime; a stale grant list would hide a just-granted capability
            Map td = ai.getToolById(grant.toolId as String)
            if (td == null) {
                logger.warn("Agent ${agentId} grants unknown/ineligible tool ${grant.toolId}; skipping")
                continue
            }
            if (grant.requiresApprovalOverride)
                approvalOverrides.put(td.toolName as String, grant.requiresApprovalOverride as String)
            schemas.add([name: td.toolName, description: td.description, parameters: td.schema])
        }
        return schemas
    }
```

(c) Add helper next to `loadToolSchemas`:

```groovy
    /** Effective approval gate for a tool in THIS run: per-grant override wins, else catalog default. */
    private boolean toolRequiresApproval(String toolName) {
        String ov = approvalOverrides.get(toolName)
        if (ov != null) return ov == "Y"
        return (ai.getToolByName(toolName)?.requiresApproval) as boolean
    }
```

(d) In `continueAgent` (~line 213), the `needApproval` filter — replace `if (td.requiresApproval) return true` with:

```groovy
                    if (toolRequiresApproval(tc.name as String)) return true
```

(e) In `resume` (~line 290), the `anyUndecided` closure — replace `if (!ai.getToolByName(tc.name as String)?.requiresApproval) return false` with:

```groovy
            if (!toolRequiresApproval(tc.name as String)) return false   // non-gated: no approval needed
```

Note: `resume()` already calls `loadToolSchemas(run.agentId)` (line ~272) BEFORE the `anyUndecided` check, so `approvalOverrides` is populated. Preview force-gating (the `forceApprovalOnMutating && AI_TOOL_MUTATING` branch) stays as a separate OR — mutating tools are always held in preview even with a loosening override.

- [ ] **Step 4: Update stale doc comments**
  - `service/ai/ComposerServices.xml` set#Guardrail comment: replace "an agent can be STRICTER than the tool default, never looser — a read-only tool stays runnable; only mutating gets gated" with "explicit per-grant trust in EITHER direction: an agent can be stricter than the tool default, or loosen a gated tool when the composer explicitly trusts it (preview still force-gates all mutating tools)".
  - `service/ai/AgentServices.xml` store#AiAgentTool `requiresApprovalOverride` description: change "Optional Y/N — stricter than the tool default." to "Optional Y/N — overrides the tool default in either direction."

- [ ] **Step 5: Run tests, verify pass** — same command. Expected: BUILD SUCCESSFUL including the two new tests and ALL pre-existing approval/preview tests (regression check: preview tests must still hold mutating calls).

- [ ] **Step 6: Commit**

```bash
cd /Users/anilpatel/maarg-sd/asbeauty/runtime/component/moqui-ai
git add -A && git commit -m "feat(runner): honor AiAgentTool.requiresApprovalOverride in both directions"
```

### Task A3: `get#AgentDetail`, `list#Model`, `find#Capability.requiresApproval` (TDD)

**Files:**
- Create: `src/test/groovy/AiPwaApiTests.groovy`
- Modify: `src/test/groovy/MoquiSuite.groovy` (register new class)
- Modify: `service/ai/AgentServices.xml` (two new services)
- Modify: `service/ai/ComposerServices.xml` (find#Capability select + alias)
- Modify: `src/main/groovy/org/moqui/ai/AiToolFactory.groovy` (`getProviderNames()`)

- [ ] **Step 1: Create `src/test/groovy/AiPwaApiTests.groovy`** (setup mirrors AiApprovalTests):

```groovy
import spock.lang.*
import org.moqui.context.ExecutionContext
import org.moqui.Moqui
import org.moqui.ai.AiToolFactory
import org.moqui.ai.provider.MockProvider

/** Services added for the company-app PWA REST facade: agent detail, model list,
 *  capability search approval flag, instruction enhancement, workforce inbox/detail. */
class AiPwaApiTests extends Specification {
    @Shared ExecutionContext ec
    @Shared AiToolFactory ai

    private void ensureTestUser() {
        ec.entity.makeValue("org.apache.ofbiz.party.party.Party").setAll([partyId: "AiTestUser", partyTypeId: "PERSON"]).createOrUpdate()
        ec.entity.makeValue("org.apache.ofbiz.party.party.Person").setAll([partyId: "AiTestUser", firstName: "AI", lastName: "Test User"]).createOrUpdate()
        ec.entity.makeValue("org.apache.ofbiz.security.login.UserLogin").setAll([userLoginId: "AiTestUser", partyId: "AiTestUser", enabled: "Y"]).createOrUpdate()
        ec.entity.makeValue("moqui.security.UserAccount").setAll([userId: "AiTestUser", username: "AiTestUser", userFullName: "AI Test User"]).createOrUpdate()
    }

    def setupSpec() {
        ec = Moqui.getExecutionContext()
        ai = ec.factory.getTool("AI", AiToolFactory.class)
        ec.artifactExecution.disableAuthz()
        ec.transaction.runRequireNew(30, "ai test setup", {
            ec.entity.makeDataLoader().location("component://moqui-ai/data/AiStatusData.xml").load()
            ec.entity.makeDataLoader().location("component://moqui-ai/data/AiTestToolData.xml").load()
            ensureTestUser()
        })
        ai.refreshCatalog()
        ((org.moqui.impl.context.UserFacadeImpl) ec.user).internalLoginUser("AiTestUser")
        ec.artifactExecution.enableAuthz()
    }
    def cleanupSpec() { if (ec != null) ec.destroy() }
    def setup() {
        ((org.moqui.impl.context.UserFacadeImpl) ec.user).internalLoginUser("AiTestUser")
        ec.message.clearErrors()
    }
    def cleanup() { MockProvider.reset() }

    def "get#AgentDetail returns agent fields plus grants with resolved approval flags"() {
        given:
        ec.artifactExecution.disableAuthz()
        ec.transaction.runRequireNew(30, "setup", {
            ec.entity.makeValue("moqui.ai.AiAgent").setAll([agentId: "PwaDetailAgent", agentName: "PwaDetailAgent",
                providerName: "mock", modelName: "mock-1", systemPrompt: "x", statusId: "AI_AGENT_DRAFT"]).createOrUpdate()
            ec.entity.makeValue("moqui.ai.AiAgentTool").setAll([agentId: "PwaDetailAgent", toolId: "TL_GATED",
                requiresApprovalOverride: "N"]).createOrUpdate()
            ec.entity.makeValue("moqui.ai.AiAgentTool").setAll([agentId: "PwaDetailAgent", toolId: "TL_ECHO"]).createOrUpdate()
        })
        when:
        Map out = ec.service.sync().name("ai.AgentServices.get#AgentDetail").parameters([agentId: "PwaDetailAgent"]).call()
        then:
        out.agent.agentName == "PwaDetailAgent"
        (out.toolList as List).size() == 2
        with((out.toolList as List).find { it.toolId == "TL_GATED" }) {
            requiresApproval == "Y"; requiresApprovalOverride == "N"; effectiveRequiresApproval == "N"
        }
        with((out.toolList as List).find { it.toolId == "TL_ECHO" }) {
            requiresApproval == "N"; requiresApprovalOverride == null; effectiveRequiresApproval == "N"
        }
        cleanup:
        ec.entity.find("moqui.ai.AiAgentTool").condition("agentId", "PwaDetailAgent").deleteAll()
        ec.entity.find("moqui.ai.AiAgent").condition("agentId", "PwaDetailAgent").deleteAll()
        ec.artifactExecution.enableAuthz()
    }

    def "list#Model returns options and reasoning efforts"() {
        when:
        Map out = ec.service.sync().name("ai.AgentServices.list#Model").parameters([:]).call()
        then:
        out.reasoningEffortList == ["none", "low", "medium", "high"]
        out.modelList instanceof List
        out.defaultModelName != null
    }

    def "find#Capability exposes the requiresApproval default"() {
        when:
        Map out = ec.service.sync().name("ai.ComposerServices.find#Capability").parameters([query: "gated"]).call()
        then:
        def gated = (out.capabilityList as List).find { it.toolId == "TL_GATED" }
        gated != null
        gated.requiresApproval == "Y"
    }
}
```

- [ ] **Step 2: Register in `MoquiSuite.groovy`** — add `AiPwaApiTests.class` to the `@SelectClasses` list (append `, AiPwaApiTests.class` before `])`).

- [ ] **Step 3: Run, verify the three tests fail** (services don't exist yet; find#Capability lacks the field).

- [ ] **Step 4: Implement.**

(a) `AiToolFactory.groovy` — add below `getProvider`:

```groovy
    Set<String> getProviderNames() { return providers.keySet() }
```

(b) `service/ai/ComposerServices.xml` find#Capability — change the select-field line to include the approval default:

```xml
                <select-field field-name="toolId,toolName,verb,noun,description,effectEnumId,exposable,requiresApproval,statusId"/>
```
(`m.requiresApproval` then flows through `t.getMap()` automatically — no other change.)

(c) `service/ai/AgentServices.xml` — append before `</services>`:

```xml
    <!-- PWA Composer/Workforce read: one agent + its grants with resolved approval flags. -->
    <service verb="get" noun="AgentDetail" authenticate="true">
        <in-parameters><parameter name="agentId" required="true"/></in-parameters>
        <out-parameters>
            <parameter name="agent" type="Map"/>
            <parameter name="toolList" type="List"><description>each: toolId, toolName, description, effectEnumId,
                requiresApproval (tool default Y/N), requiresApprovalOverride (Y/N/null), effectiveRequiresApproval (Y/N)</description></parameter>
        </out-parameters>
        <actions>
            <entity-find-one entity-name="moqui.ai.AiAgent" value-field="agentEv"/>
            <if condition="agentEv == null"><return error="true" message="Unknown agent ${agentId}"/></if>
            <script><![CDATA[
                agent = agentEv.getMap()
                toolList = []
                for (def g in ec.entity.find("moqui.ai.AiAgentTool").condition("agentId", agentId).list()) {
                    def t = ec.entity.find("moqui.ai.AiTool").condition("toolId", g.toolId).one()
                    if (t == null) continue
                    toolList.add([toolId: t.toolId, toolName: t.toolName, description: t.description,
                        effectEnumId: t.effectEnumId, requiresApproval: t.requiresApproval,
                        requiresApprovalOverride: g.requiresApprovalOverride,
                        effectiveRequiresApproval: (g.requiresApprovalOverride ?: t.requiresApproval ?: "N")])
                }
            ]]></script>
        </actions>
    </service>

    <!-- Model + reasoning options for the PWA Composer dropdowns: registered providers with their
         current AiModelPrice models plus the configured default. mock is offered only when it is
         the sole registered provider (dev without keys). -->
    <service verb="list" noun="Model" authenticate="true">
        <out-parameters>
            <parameter name="modelList" type="List"><description>each: providerName, modelName</description></parameter>
            <parameter name="defaultProviderName"/><parameter name="defaultModelName"/>
            <parameter name="reasoningEffortList" type="List"/>
        </out-parameters>
        <actions>
            <script><![CDATA[
                def ai = ec.factory.getTool("AI", org.moqui.ai.AiToolFactory.class)
                Set<String> providers = (ai.getProviderNames().findAll { it != "mock" }) as Set
                if (!providers) providers = ["mock"] as Set
                defaultProviderName = System.getProperty('ai_default_provider') ?: System.getenv('ai_default_provider') ?: 'openai'
                defaultModelName = System.getProperty('ai_default_model') ?: System.getenv('ai_default_model') ?: 'gpt-4o-mini'
                modelList = []
                def now = ec.user.nowTimestamp
                for (def p in ec.entity.find("moqui.ai.AiModelPrice").orderBy("providerName").orderBy("modelName").list()) {
                    if (!(p.providerName in providers)) continue
                    if (p.thruDate != null && p.thruDate < now) continue
                    if (!modelList.any { it.providerName == p.providerName && it.modelName == p.modelName })
                        modelList.add([providerName: p.providerName, modelName: p.modelName])
                }
                if (providers.contains(defaultProviderName) &&
                        !modelList.any { it.providerName == defaultProviderName && it.modelName == defaultModelName })
                    modelList.add([providerName: defaultProviderName, modelName: defaultModelName])
                if (!modelList) modelList.add([providerName: providers.first(), modelName: providers.first() == "mock" ? "mock-1" : defaultModelName])
                reasoningEffortList = ["none", "low", "medium", "high"]
            ]]></script>
        </actions>
    </service>
```

- [ ] **Step 5: Run tests, verify pass.** Also confirm the pre-existing `AiComposerTests` still pass (find#Capability shape change is additive).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(api): get#AgentDetail + list#Model + requiresApproval in find#Capability"`

### Task A4: `enhance#Instructions` (TDD)

**Files:**
- Modify: `src/test/groovy/AiPwaApiTests.groovy` (add test)
- Modify: `service/ai/ComposerServices.xml` (new service)

- [ ] **Step 1: Add failing test** to `AiPwaApiTests.groovy`:

```groovy
    def "enhance#Instructions rewrites via the provider and returns the text"() {
        given:
        MockProvider.reset()
        MockProvider.enqueue([assistantText: "ENHANCED PROMPT", finishReason: "stop", toolCalls: [], tokensIn: 1L, tokensOut: 1L])
        when:
        Map out = ec.service.sync().name("ai.ComposerServices.enhance#Instructions")
            .parameters([instructions: "help with orders", providerName: "mock", modelName: "mock-1"]).call()
        then:
        out.enhancedInstructions == "ENHANCED PROMPT"
    }
```

- [ ] **Step 2: Run, verify it fails** (service not found).

- [ ] **Step 3: Implement** — append to `service/ai/ComposerServices.xml` before `</services>`:

```xml
    <!-- PWA Composer "Enhance": rewrite rough instructions into a clear agent system prompt via the
         configured LLM. Stateless — returns the rewrite only, never persists. providerName/modelName
         overridable (tests pass mock); default resolved from configured keys like propose#Naming. -->
    <service verb="enhance" noun="Instructions" authenticate="true">
        <in-parameters>
            <parameter name="instructions" required="true"/>
            <parameter name="agentName"/>
            <parameter name="providerName"/><parameter name="modelName"/>
        </in-parameters>
        <out-parameters><parameter name="enhancedInstructions"/></out-parameters>
        <actions>
            <script><![CDATA[
                def ai = ec.factory.getTool("AI", org.moqui.ai.AiToolFactory.class)
                String pn = providerName ?: (
                    (System.getProperty("ai_openai_key") ?: System.getenv("ai_openai_key")) ? "openai" :
                    ((System.getProperty("ai_anthropic_key") ?: System.getenv("ai_anthropic_key")) ? "anthropic" : null))
                if (pn == null) { ec.message.addError("No LLM provider configured; cannot enhance instructions."); return }
                String mn = modelName ?: (pn == "openai" ? "gpt-4o-mini" : "claude-3-5-haiku-latest")
                def resp = ai.getProvider(pn).chat([model: mn,
                    systemContext: "You improve system prompts for business software agents. Rewrite the user's rough " +
                        "instructions as a clear, well-structured agent system prompt: keep ALL of their intent and " +
                        "constraints, add structure (role, scope, tone, when to use tools, when to ask), and invent " +
                        "nothing they did not imply. Reply with the rewritten prompt text only - no preamble, no " +
                        "markdown fences." + (agentName ? " The agent is named '${agentName}'." : ""),
                    messages: [[role: "user", content: instructions as String]]])
                enhancedInstructions = resp?.assistantText
                if (!enhancedInstructions) ec.message.addError("Provider returned no text; instructions left unchanged.")
            ]]></script>
        </actions>
    </service>
```

- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat(composer): enhance#Instructions LLM rewrite service"`

### Task A5: `ai.WorkforceServices` — inbox + thread detail (TDD)

**Files:**
- Modify: `src/test/groovy/AiPwaApiTests.groovy` (add tests)
- Create: `service/ai/WorkforceServices.xml`

- [ ] **Step 1: Add failing tests** to `AiPwaApiTests.groovy`. The fixture builds one conversation with a completed run + messages, and one with a suspended run + pending request:

```groovy
    def "workforce list and detail derive statuses and parse tool calls"() {
        given:
        ec.artifactExecution.disableAuthz()
        ec.transaction.runRequireNew(30, "setup", {
            ec.entity.makeDataLoader().location("component://moqui-ai/data/AiConversationStatusData.xml").load()
            ec.entity.makeValue("moqui.ai.AiAgent").setAll([agentId: "WfAgent", agentName: "WfAgent", providerName: "mock",
                modelName: "mock-1", systemPrompt: "x", statusId: "AI_AGENT_ACTIVE"]).createOrUpdate()
            // conversation 1: completed run, user+assistant messages
            ec.entity.makeValue("moqui.ai.AiConversation").setAll([conversationId: "WfConv1", agentId: "WfAgent",
                userId: "AiTestUser", title: "First", createdDate: ec.user.nowTimestamp, statusId: "AI_CONV_ACTIVE"]).createOrUpdate()
            ec.entity.makeValue("moqui.ai.AiAgentRun").setAll([agentRunId: "WfRun1", agentId: "WfAgent", agentName: "WfAgent",
                conversationId: "WfConv1", userId: "AiTestUser", startedDate: ec.user.nowTimestamp, statusId: "AI_RUN_COMPLETED"]).createOrUpdate()
            ec.entity.makeValue("moqui.ai.AiConversationMessage").setAll([conversationId: "WfConv1", messageSeqId: "01",
                role: "user", content: "hello", agentRunId: "WfRun1", createdDate: ec.user.nowTimestamp]).createOrUpdate()
            ec.entity.makeValue("moqui.ai.AiConversationMessage").setAll([conversationId: "WfConv1", messageSeqId: "02",
                role: "assistant", toolCalls: '[{"id":"c1","name":"get_echo","arguments":{"text":"hi"}}]',
                agentRunId: "WfRun1", createdDate: ec.user.nowTimestamp]).createOrUpdate()
            ec.entity.makeValue("moqui.ai.AiConversationMessage").setAll([conversationId: "WfConv1", messageSeqId: "03",
                role: "assistant", content: "done", agentRunId: "WfRun1", createdDate: ec.user.nowTimestamp]).createOrUpdate()
            // conversation 2: suspended run with one pending request
            ec.entity.makeValue("moqui.ai.AiConversation").setAll([conversationId: "WfConv2", agentId: "WfAgent",
                userId: "AiTestUser", title: "Second", createdDate: ec.user.nowTimestamp, statusId: "AI_CONV_ACTIVE"]).createOrUpdate()
            ec.entity.makeValue("moqui.ai.AiAgentRun").setAll([agentRunId: "WfRun2", agentId: "WfAgent", agentName: "WfAgent",
                conversationId: "WfConv2", userId: "AiTestUser", startedDate: ec.user.nowTimestamp, statusId: "AI_RUN_SUSPENDED"]).createOrUpdate()
            ec.entity.makeValue("moqui.ai.AiToolCallRequest").setAll([toolCallRequestId: "WfReq1", agentRunId: "WfRun2",
                stepSeqId: "1", toolCallId: "c9", toolName: "get_gated_echo", serviceName: "moqui.ai.test.TestServices.get#GatedEcho",
                arguments: '{"text":"x"}', statusId: "AI_TCREQ_PENDING", requestedByUserId: "AiTestUser",
                requestedDate: ec.user.nowTimestamp]).createOrUpdate()
        })
        when:
        Map listOut = ec.service.sync().name("ai.WorkforceServices.list#Conversation").parameters([:]).call()
        Map pendingOnly = ec.service.sync().name("ai.WorkforceServices.list#Conversation").parameters([derivedStatus: "pending"]).call()
        Map detail = ec.service.sync().name("ai.WorkforceServices.get#ConversationDetail").parameters([conversationId: "WfConv1"]).call()
        Map detail2 = ec.service.sync().name("ai.WorkforceServices.get#ConversationDetail").parameters([conversationId: "WfConv2"]).call()
        then:
        def row1 = (listOut.conversationList as List).find { it.conversationId == "WfConv1" }
        def row2 = (listOut.conversationList as List).find { it.conversationId == "WfConv2" }
        row1.derivedStatus == "idle"; row1.agentName == "WfAgent"
        row2.derivedStatus == "pending"; row2.pendingToolName == "get_gated_echo"
        (pendingOnly.conversationList as List).every { it.derivedStatus == "pending" }
        (detail.messageList as List).size() == 3
        (detail.messageList as List)[1].toolCalls[0].name == "get_echo"
        detail.latestRun.statusId == "AI_RUN_COMPLETED"
        (detail.pendingRequestList as List).isEmpty()
        (detail2.pendingRequestList as List)[0].toolCallRequestId == "WfReq1"
        cleanup:
        ec.entity.find("moqui.ai.AiToolCallRequest").condition("toolCallRequestId", "WfReq1").deleteAll()
        ec.entity.find("moqui.ai.AiConversationMessage").condition("conversationId", "in", ["WfConv1", "WfConv2"]).deleteAll()
        ec.entity.find("moqui.ai.AiAgentRun").condition("agentRunId", "in", ["WfRun1", "WfRun2"]).deleteAll()
        ec.entity.find("moqui.ai.AiConversation").condition("conversationId", "in", ["WfConv1", "WfConv2"]).deleteAll()
        ec.entity.find("moqui.ai.AiAgent").condition("agentId", "WfAgent").deleteAll()
        ec.artifactExecution.enableAuthz()
    }
```

- [ ] **Step 2: Run, verify fail** (services don't exist).

- [ ] **Step 3: Create `service/ai/WorkforceServices.xml`:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<services xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="http://moqui.org/xsd/service-definition-3.xsd">

    <!-- Experience layer for the company-app Workforce screen: purposeful aggregates so the PWA
         renders the inbox and a thread in one call each. Reads only; all mutations go through
         AgentServices / ToolCallRequestServices. Company-wide by design (decision 2026-06-11):
         conversations from ALL users are listed; AI_OPERATOR scoping is a follow-up. -->

    <service verb="list" noun="Conversation" authenticate="true">
        <description>Workforce inbox: all conversations, newest activity first, each with agentName,
            the owning user, and a status derived from the conversation's latest run:
            SUSPENDED -> pending (+ pendingToolName), RUNNING -> running,
            FAILED/ABORTED/TRUNCATED -> error, else idle.</description>
        <in-parameters>
            <parameter name="derivedStatus"><description>Optional filter: pending|running|error|idle</description></parameter>
            <parameter name="pageSize" type="Integer" default-value="50"/>
            <parameter name="pageIndex" type="Integer" default-value="0"/>
        </in-parameters>
        <out-parameters><parameter name="conversationList" type="List"/></out-parameters>
        <actions>
            <script><![CDATA[
                def convs = ec.entity.find("moqui.ai.AiConversationActivity")
                    .selectFields(["conversationId", "agentId", "userId", "title", "createdDate", "statusId", "lastActivityDate"])
                    .orderBy("-lastActivityDate").list()
                // batched enrichment: names + latest run per conversation + first pending request per suspended run
                def agentNames = [:]
                for (def a in ec.entity.find("moqui.ai.AiAgent").list()) agentNames[a.agentId] = a.agentName
                def userNames = [:]
                def userIds = convs.collect { it.userId }.findAll { it }.unique()
                if (userIds) for (def u in ec.entity.find("moqui.security.UserAccount").condition("userId", "in", userIds).list())
                    userNames[u.userId] = (u.userFullName ?: u.username)
                def latestRun = [:]
                def convIds = convs.collect { it.conversationId }
                if (convIds) for (def r in ec.entity.find("moqui.ai.AiAgentRun")
                        .condition("conversationId", "in", convIds).orderBy("-startedDate").list())
                    if (!latestRun.containsKey(r.conversationId)) latestRun[r.conversationId] = r
                def pendingByRun = [:]
                def suspendedRunIds = latestRun.values().findAll { it.statusId == "AI_RUN_SUSPENDED" }.collect { it.agentRunId }
                if (suspendedRunIds) for (def p in ec.entity.find("moqui.ai.AiToolCallRequest")
                        .condition("agentRunId", "in", suspendedRunIds).condition("statusId", "AI_TCREQ_PENDING")
                        .orderBy("requestedDate").list())
                    if (!pendingByRun.containsKey(p.agentRunId)) pendingByRun[p.agentRunId] = p
                conversationList = []
                for (def c in convs) {
                    def run = latestRun[c.conversationId]
                    String ds = "idle"; String pendingToolName = null
                    if (run != null) {
                        if (run.statusId == "AI_RUN_SUSPENDED") { ds = "pending"; pendingToolName = pendingByRun[run.agentRunId]?.toolName }
                        else if (run.statusId == "AI_RUN_RUNNING") ds = "running"
                        else if (run.statusId in ["AI_RUN_FAILED", "AI_RUN_ABORTED", "AI_RUN_TRUNCATED"]) ds = "error"
                    }
                    if (derivedStatus && ds != derivedStatus) continue
                    conversationList.add([conversationId: c.conversationId, agentId: c.agentId,
                        agentName: agentNames[c.agentId], title: c.title, userId: c.userId,
                        userFullName: userNames[c.userId], lastActivityDate: c.lastActivityDate ?: c.createdDate,
                        derivedStatus: ds, pendingToolName: pendingToolName])
                }
                int ps = (pageSize ?: 50) as int; int pi = (pageIndex ?: 0) as int
                int from = Math.min(pi * ps, conversationList.size())
                conversationList = conversationList.subList(from, Math.min(from + ps, conversationList.size()))
            ]]></script>
        </actions>
    </service>

    <service verb="get" noun="ConversationDetail" authenticate="true">
        <description>One thread: agent info, ordered messages (toolCalls JSON parsed), the latest
            run's status/error, and pending tool-call requests awaiting decision.</description>
        <in-parameters><parameter name="conversationId" required="true"/></in-parameters>
        <out-parameters>
            <parameter name="conversation" type="Map"/>
            <parameter name="agent" type="Map"/>
            <parameter name="messageList" type="List"><description>each: messageSeqId, role, content,
                toolCalls (List|null), toolCallId, agentRunId, createdDate</description></parameter>
            <parameter name="latestRun" type="Map"><description>agentRunId, statusId, errorText; null when no runs</description></parameter>
            <parameter name="pendingRequestList" type="List"><description>each: toolCallRequestId, toolName, serviceName, arguments</description></parameter>
        </out-parameters>
        <actions>
            <entity-find-one entity-name="moqui.ai.AiConversation" value-field="conv"/>
            <if condition="conv == null"><return error="true" message="Unknown conversation ${conversationId}"/></if>
            <script><![CDATA[
                conversation = conv.getMap()
                def ua = conv.userId ? ec.entity.find("moqui.security.UserAccount").condition("userId", conv.userId).one() : null
                conversation.userFullName = ua?.userFullName ?: ua?.username
                def agentEv = ec.entity.find("moqui.ai.AiAgent").condition("agentId", conv.agentId).one()
                agent = agentEv != null ? [agentId: agentEv.agentId, agentName: agentEv.agentName, statusId: agentEv.statusId] : null
                def slurper = new groovy.json.JsonSlurper()
                messageList = []
                for (def m in ec.entity.find("moqui.ai.AiConversationMessage")
                        .condition("conversationId", conversationId).orderBy("messageSeqId").list()) {
                    def toolCalls = null
                    if (m.toolCalls) { try { toolCalls = slurper.parseText(m.toolCalls as String) } catch (Exception e) { /* malformed JSON: render the message without cards */ } }
                    messageList.add([messageSeqId: m.messageSeqId, role: m.role, content: m.content,
                        toolCalls: toolCalls, toolCallId: m.toolCallId, agentRunId: m.agentRunId, createdDate: m.createdDate])
                }
                def runs = ec.entity.find("moqui.ai.AiAgentRun").condition("conversationId", conversationId)
                    .orderBy("-startedDate").limit(1).list()
                def run = runs ? runs[0] : null
                latestRun = run != null ? [agentRunId: run.agentRunId, statusId: run.statusId, errorText: run.errorText] : null
                pendingRequestList = []
                if (run != null && run.statusId == "AI_RUN_SUSPENDED")
                    for (def p in ec.entity.find("moqui.ai.AiToolCallRequest").condition("agentRunId", run.agentRunId)
                            .condition("statusId", "AI_TCREQ_PENDING").orderBy("requestedDate").list())
                        pendingRequestList.add([toolCallRequestId: p.toolCallRequestId, toolName: p.toolName,
                            serviceName: p.serviceName, arguments: p.arguments])
            ]]></script>
        </actions>
    </service>
</services>
```

- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat(workforce): inbox + conversation detail aggregates for the PWA"`

### Task A6: REST facade `ai.rest.xml` + authz

**Files:**
- Create: `service/ai.rest.xml`
- Modify: `data/AiSecurityData.xml`

- [ ] **Step 1: Create `service/ai.rest.xml`:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<resource xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://moqui.org/xsd/rest-api-3.xsd"
        name="ai" displayName="Moqui AI REST API" version="1.0.0"
        description="REST facade for the moqui-ai agent framework, consumed by the company-app PWA
            (Composer + Workforce). Thin mappings only; behavior lives in the ai.* services.">

    <resource name="agents">
        <method type="get"><entity name="moqui.ai.AiAgent" operation="list"/></method>
        <method type="post"><service name="ai.AgentServices.store#AiAgent"/></method>
        <id name="agentId">
            <method type="get"><service name="ai.AgentServices.get#AgentDetail"/></method>
            <method type="put"><service name="ai.AgentServices.store#AiAgent"/></method>
            <resource name="tools">
                <method type="post"><service name="ai.AgentServices.store#AiAgentTool"/></method>
                <id name="toolId">
                    <method type="delete"><entity name="moqui.ai.AiAgentTool" operation="delete"/></method>
                </id>
            </resource>
            <resource name="preview">
                <method type="post"><service name="ai.ComposerServices.preview#Agent"/></method>
            </resource>
            <resource name="activate">
                <method type="post"><service name="ai.ComposerServices.activate#Agent"/></method>
            </resource>
        </id>
    </resource>

    <resource name="tools">
        <method type="get"><service name="ai.ComposerServices.find#Capability"/></method>
    </resource>

    <resource name="models">
        <method type="get"><service name="ai.AgentServices.list#Model"/></method>
    </resource>

    <resource name="instructions">
        <resource name="enhance">
            <method type="post"><service name="ai.ComposerServices.enhance#Instructions"/></method>
        </resource>
    </resource>

    <resource name="conversations">
        <method type="get"><service name="ai.WorkforceServices.list#Conversation"/></method>
        <method type="post"><service name="ai.AgentServices.create#Conversation"/></method>
        <id name="conversationId">
            <method type="get"><service name="ai.WorkforceServices.get#ConversationDetail"/></method>
            <resource name="messages">
                <method type="post"><service name="ai.AgentServices.run#Conversation"/></method>
            </resource>
        </id>
    </resource>

    <resource name="toolCallRequests">
        <method type="get"><service name="ai.ToolCallRequestServices.get#PendingToolCallRequest"/></method>
        <id name="toolCallRequestId">
            <resource name="approve">
                <method type="post"><service name="ai.ToolCallRequestServices.approve#ToolCallRequest"/></method>
            </resource>
            <resource name="reject">
                <method type="post"><service name="ai.ToolCallRequestServices.reject#ToolCallRequest"/></method>
            </resource>
        </id>
    </resource>
</resource>
```

- [ ] **Step 2: Authorize the REST path** — in `data/AiSecurityData.xml`, after the last `AI_OPS_SCREENS` ArtifactGroupMember (the `notnaked\.OmsAiServices\..*` one), add:

```xml
    <!-- Service REST facade (service/ai.rest.xml): the /ai root resource itself must be authorized
         for the path check in RestApi.run; the services/entities it calls are members above. -->
    <moqui.security.ArtifactGroupMember artifactGroupId="AI_OPS_SCREENS"
        artifactName="/ai" artifactTypeEnumId="AT_REST_PATH" inheritAuthz="Y"/>
```

- [ ] **Step 3: Run the moqui-ai suite once more** (catches XML parse errors at load — the suite boots the full conf which parses all rest files). Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(rest): ai.rest.xml service REST facade + /ai path authz"`

### Task A7: Docs + audit + full suite

**Files:**
- Modify: `docs/explanation/decisions.md` (ADR note on override direction)
- Modify: `docs/reference/services.md` (new services), `docs/reference/configuration.md` only if it lists REST exposure

- [ ] **Step 1: ADR revision** — in `docs/explanation/decisions.md`, find the decision about per-grant approval strictness ("stricter, never looser") and append a dated revision paragraph:

```markdown
**Revision (2026-06-11):** `requiresApprovalOverride` is now honored in BOTH directions by
`AgentRunner` (it was previously not consulted at dispatch at all). A composer explicitly
granting a tool to an agent may mark it auto-approved (override `N`) even when the tool
default is `Y` — per-grant trust is an explicit human decision made at composition time.
Preview runs still force-gate every mutating tool regardless of override. Driven by the
company-app Composer UX (PR hotwax/company#154).
```

- [ ] **Step 2: Services reference** — add `get#AgentDetail`, `list#Model`, `enhance#Instructions`, `ai.WorkforceServices.list#Conversation`, `get#ConversationDetail`, and the REST facade to `docs/reference/services.md` following its existing table/entry format (read the file first; keep its style).

- [ ] **Step 3: Run the moqui-verification skill audit** on the component diff (Skill: `moqui-coding-assistant:moqui-verification`) and fix anything it flags.

- [ ] **Step 4: Full suite green; commit docs** — `git commit -am "docs: ADR revision (override both directions) + new service reference entries"`

---

## Phase B — company PWA client

All tasks: `cd /Users/anilpatel/pwa-sd/company` on branch `feat/agent-ux-wiring`. Verify each task with `npm run lint` and `npm run build` (expected: no new errors; build succeeds).

### Task B1: ChatContainer timeline refactor

**Files:**
- Modify: `src/components/chat/ChatContainer.vue` (replace content)

The mock renders fixed groups (`messages`, then `toolCalls`, then `permissions`, then `steps`); real threads interleave. Replace with an ordered timeline. Child components (`ChatMessage`, `ChatToolCall`, `ChatToolPermission`) are reused unchanged.

- [ ] **Step 1: Replace `src/components/chat/ChatContainer.vue` with:**

```vue
<template>
  <div class="chat-container">
    <div class="thread">
      <template v-for="item in items" :key="item.id">
        <chat-message v-if="item.type === 'message'" :user-name="item.userName" :content="item.content" />

        <div v-else-if="item.type === 'agentMessage'">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="terminalOutline" aria-hidden="true" />
            <ion-label class="overline">{{ agentName }}</ion-label>
          </ion-item>
          <ion-text class="ion-padding chat-container__agent-text">
            {{ item.content }}
          </ion-text>
        </div>

        <chat-tool-call v-else-if="item.type === 'toolCall'" :tool-name="item.toolName" :args="item.args" />

        <chat-tool-permission v-else-if="item.type === 'permission'" :name="agentName" :tool-name="item.toolName"
          @allow="$emit('allow-tool', item)" @deny="$emit('deny-tool', item)">
          {{ item.message }}
        </chat-tool-permission>
      </template>

      <ion-item v-if="busy" lines="none">
        <ion-spinner slot="start" name="dots" />
        <ion-label color="medium">{{ translate("Working") }}</ion-label>
      </ion-item>
    </div>
    <div class="next-message ion-padding">
      <ion-item lines="full">
        <ion-textarea
          v-model="messageText"
          :label="translate('Message')"
          label-placement="stacked"
          :placeholder="translate('Ask the agent')"
          :auto-grow="true"
          :rows="1"
          :disabled="busy"
        />

        <ion-button slot="end" fill="clear" :disabled="busy || !messageText.trim()" @click="sendMessage">
          <ion-icon slot="icon-only" :icon="sendOutline" />
        </ion-button>
      </ion-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonItem, IonLabel, IonSpinner, IonText, IonTextarea } from "@ionic/vue";
import { sendOutline, terminalOutline } from "ionicons/icons";
import { translate } from "@common";
import { PropType, ref } from "vue";
import ChatMessage from "@/components/chat/ChatMessage.vue";
import ChatToolCall from "@/components/chat/ChatToolCall.vue";
import ChatToolPermission from "@/components/chat/ChatToolPermission.vue";

/**
 * One entry in the chat timeline, rendered in order:
 * - message: a user turn (userName + content)
 * - agentMessage: an assistant text turn (content; header shows agentName)
 * - toolCall: a tool invocation card (toolName + args JSON string)
 * - permission: a pending approval card (permissionId + toolName + message)
 */
export type ChatItem = {
  id: string;
  type: "message" | "agentMessage" | "toolCall" | "permission";
  userName?: string;
  content?: string;
  toolName?: string;
  args?: string;
  permissionId?: string;
  message?: string;
};

defineProps({
  /** Agent display name for assistant turns and permission cards. */
  agentName: {
    type: String,
    default: ""
  },
  /** Ordered chat timeline. */
  items: {
    type: Array as PropType<ChatItem[]>,
    default: () => []
  },
  /** True while a send/decide is in flight; shows the working row and disables input. */
  busy: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["send-message", "allow-tool", "deny-tool"]);
const messageText = ref("");

function sendMessage() {
  const content = messageText.value.trim();
  if(!content) return;

  emit("send-message", content);
  messageText.value = "";
}
</script>

<style scoped>

.chat-container {
  display: grid;
  grid-template-rows: 1fr min-content;
  height: 100%;
}

.thread {
  overflow-y: auto;
}

.chat-container__agent-text {
  display: block;
  white-space: pre-wrap;
}

.next-message {
  border-top: 1px solid var(--ion-color-medium);
}

</style>
```

- [ ] **Step 2: `npm run lint` + `npm run build`** — expected: Composer.vue/Workforce.vue now fail the build/typecheck only if they reference the old `chat` prop; they are rewired in B3/B5. If the build fails ONLY in those two views for the old prop, proceed (they're next); commit after B3/B5 make the build green — otherwise fix here.
- [ ] **Step 3: Commit (with B3, or now if build is green)** — `git add src/components/chat/ChatContainer.vue && git commit -m "refactor(chat): ordered timeline model for ChatContainer"`

### Task B2: Composer Pinia store

**Files:**
- Create: `src/store/composer.ts`

- [ ] **Step 1: Create `src/store/composer.ts`:**

```typescript
import { defineStore } from 'pinia'
import { api, logger } from '@common'
import type { ChatItem } from '@/components/chat/ChatContainer.vue'

export type CatalogTool = {
  toolId: string;
  toolName: string;
  description: string;
  effectEnumId: string;
  requiresApproval: string; // tool default 'Y' | 'N'
}

export type SelectedTool = CatalogTool & { autoApprove: boolean }

export type ModelOption = { providerName: string; modelName: string }

const hasError = (resp: any) => !!(resp?.data?._ERROR_MESSAGE_ || resp?.data?._ERROR_MESSAGE_LIST_ || resp?.data?.errors)

export const useComposerStore = defineStore('composer', {
  state: () => ({
    agentId: '',
    agentName: '',
    instructions: '',
    providerName: '',
    modelName: '',
    reasoningEffort: 'none',
    statusId: '',
    selectedTools: [] as SelectedTool[],
    toolCatalog: [] as CatalogTool[],
    modelOptions: [] as ModelOption[],
    reasoningEffortOptions: ['none', 'low', 'medium', 'high'] as string[],
    previewItems: [] as ChatItem[],
    saving: false,
    previewing: false,
    enhancing: false
  }),

  getters: {
    isDraftSaved: (state) => !!state.agentId,
    canActivate: (state) => !!state.agentId && !!state.agentName.trim() && state.statusId === 'AI_AGENT_DRAFT'
  },

  actions: {
    async fetchModelOptions() {
      try {
        const resp = await api({ url: 'ai/models', method: 'get' }) as any
        if (hasError(resp)) throw resp.data
        this.modelOptions = resp?.data?.modelList || []
        this.reasoningEffortOptions = resp?.data?.reasoningEffortList || this.reasoningEffortOptions
        if (!this.modelName && this.modelOptions.length) {
          const dflt = this.modelOptions.find((option: ModelOption) =>
            option.providerName === resp?.data?.defaultProviderName && option.modelName === resp?.data?.defaultModelName)
          const pick = dflt || this.modelOptions[0]
          this.providerName = pick.providerName
          this.modelName = pick.modelName
        }
      } catch (error) {
        logger.error(error)
      }
    },

    async fetchToolCatalog() {
      try {
        const resp = await api({ url: 'ai/tools', method: 'get', params: { maxResults: 200 } }) as any
        if (hasError(resp)) throw resp.data
        this.toolCatalog = resp?.data?.capabilityList || []
      } catch (error) {
        logger.error(error)
      }
    },

    async saveDraft() {
      this.saving = true
      try {
        const data: any = {
          agentName: this.agentName.trim(),
          systemPrompt: this.instructions,
          providerName: this.providerName,
          modelName: this.modelName,
          reasoningEffort: this.reasoningEffort
        }
        let resp: any
        if (this.agentId) {
          resp = await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}`, method: 'put', data })
        } else {
          resp = await api({ url: 'ai/agents', method: 'post', data })
        }
        if (hasError(resp)) throw resp.data
        if (resp?.data?.agentId) this.agentId = resp.data.agentId
        if (!this.statusId) this.statusId = 'AI_AGENT_DRAFT'
        await this.syncGrants()
        return true
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.saving = false
      }
    },

    // Diff-sync grants against the server. Desired effective approval = autoApprove ? 'N' : 'Y';
    // an override is written only when that differs from the tool default. Clearing an override
    // recreates the grant (entity-auto store ignores null parameters).
    async syncGrants() {
      if (!this.agentId) return
      const resp = await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}`, method: 'get' }) as any
      if (hasError(resp)) throw resp.data
      const current: any[] = resp?.data?.toolList || []
      this.statusId = resp?.data?.agent?.statusId || this.statusId

      for (const cur of current) {
        if (!this.selectedTools.some((tool) => tool.toolId === cur.toolId)) {
          await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}/tools/${encodeURIComponent(cur.toolId)}`, method: 'delete' })
        }
      }
      for (const tool of this.selectedTools) {
        const cur = current.find((c: any) => c.toolId === tool.toolId)
        const desiredEffective = tool.autoApprove ? 'N' : 'Y'
        const override = desiredEffective === (tool.requiresApproval || 'N') ? null : desiredEffective
        const curOverride = cur ? (cur.requiresApprovalOverride || null) : undefined
        if (cur && curOverride !== override && override === null) {
          await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}/tools/${encodeURIComponent(tool.toolId)}`, method: 'delete' })
        }
        if (!cur || curOverride !== override) {
          const data: any = { toolId: tool.toolId }
          if (override) data.requiresApprovalOverride = override
          await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}/tools`, method: 'post', data })
        }
      }
    },

    async sendPreviewMessage(testMessage: string) {
      this.previewing = true
      try {
        await this.saveDraft()
        this.previewItems.push({ id: `user-${Date.now()}`, type: 'message', userName: 'You', content: testMessage })
        const resp = await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}/preview`, method: 'post', data: { testMessage } }) as any
        if (hasError(resp)) throw resp.data
        for (const [index, held] of (resp?.data?.heldCalls || []).entries()) {
          let args = held.arguments
          try { args = JSON.stringify(JSON.parse(held.arguments), null, 2) } catch { /* keep raw */ }
          this.previewItems.push({ id: `held-${Date.now()}-${index}`, type: 'toolCall', toolName: `${held.toolName} (held)`, args })
        }
        if (resp?.data?.assistantMessage) {
          this.previewItems.push({ id: `agent-${Date.now()}`, type: 'agentMessage', content: resp.data.assistantMessage })
        }
        return true
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.previewing = false
      }
    },

    async enhanceInstructions() {
      this.enhancing = true
      try {
        const resp = await api({ url: 'ai/instructions/enhance', method: 'post',
          data: { instructions: this.instructions, agentName: this.agentName || undefined } }) as any
        if (hasError(resp) || !resp?.data?.enhancedInstructions) throw resp?.data
        this.instructions = resp.data.enhancedInstructions
        return true
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.enhancing = false
      }
    },

    async activate() {
      const resp = await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}/activate`, method: 'post', data: {} }) as any
      if (hasError(resp)) throw resp.data
      this.statusId = 'AI_AGENT_ACTIVE'
      return true
    },

    clearComposerState() {
      this.$reset()
    }
  },

  persist: true
})
```

- [ ] **Step 2: `npm run lint && npm run build`** — expected: success (store not yet imported anywhere).
- [ ] **Step 3: Commit** — `git add src/store/composer.ts && git commit -m "feat(composer): pinia store wired to /rest/s1/ai"`

### Task B3: Composer view wiring

**Files:**
- Modify: `src/views/agent/Composer.vue` (replace `<script setup>` and adjust template bindings; keep layout/styles)
- Modify: `src/locales/en.json`

- [ ] **Step 1: Rewrite `src/views/agent/Composer.vue`.** Keep the existing template structure and styles, with these template changes (full bindings shown):

  - Name input: `<ion-input class="agent-name" fill="outline" v-model="composer.agentName" :label="translate('Give your agent a name')" label-placement="stacked" :placeholder="translate('Name')" :helper-text="translate('Your agent requires a name to start testing')" />`
  - Instructions: `<ion-textarea fill="outline" v-model="composer.instructions" :label="translate('Instructions')" label-placement="stacked" :placeholder="translate('Input text')" :rows="5" />`
  - Enhance button: `<ion-button fill="outline" color="primary" :disabled="composer.enhancing || !composer.instructions.trim()" @click="enhance"><ion-icon slot="start" :icon="sparklesOutline" />{{ translate("Enhance") }}</ion-button>`
  - Model select:
    ```html
    <ion-select fill="outline" :label="translate('Model')" interface="popover" :placeholder="translate('Select')" v-model="selectedModel">
      <ion-select-option v-for="model in composer.modelOptions" :key="`${model.providerName}::${model.modelName}`" :value="`${model.providerName}::${model.modelName}`">
        {{ model.modelName }} ({{ model.providerName }})
      </ion-select-option>
    </ion-select>
    ```
  - Reasoning select: `v-model="composer.reasoningEffort"`, options `v-for="effort in composer.reasoningEffortOptions"` with `:value="effort"` and label `{{ translate(effort) }}`.
  - Tools list: iterate `composer.selectedTools`; item label `<h2>{{ tool.toolName }}</h2><p>{{ tool.description }}</p>` (no translate on data); checkbox `:checked="tool.autoApprove" @ionChange="tool.autoApprove = $event.detail.checked"`; remove button calls `removeTool(tool.toolId)`.
  - Tools modal: searchbar `v-model="toolQueryString"`; items iterate `filteredTools` (now from `composer.toolCatalog`); item note `{{ tool.effectEnumId === 'AI_TOOL_MUTATING' ? translate('Mutating') : translate('Read only') }}`.
  - Preview pane:
    ```html
    <chat-container :agent-name="composer.agentName || translate('Agent')" :items="composer.previewItems" :busy="composer.previewing" @send-message="sendPreview" />
    ```
  - Buttons row (replace the single Save button):
    ```html
    <div class="actions">
      <ion-button size="large" fill="outline" :disabled="composer.saving || !composer.agentName.trim()" @click="save">
        {{ translate("Save") }}
        <ion-icon slot="end" :icon="saveOutline" />
      </ion-button>
      <ion-button size="large" :disabled="!composer.canActivate" @click="activate">
        {{ translate("Activate") }}
        <ion-icon slot="end" :icon="rocketOutline" />
      </ion-button>
    </div>
    ```

  New `<script setup lang="ts">` (replaces the mock data script entirely):

```typescript
import {
  IonButton, IonButtons, IonCard, IonCheckbox, IonContent, IonFab, IonFabButton, IonHeader, IonIcon,
  IonInput, IonItem, IonItemDivider, IonLabel, IonList, IonListHeader, IonMenuButton, IonModal, IonNote,
  IonPage, IonSearchbar, IonSelect, IonSelectOption, IonTextarea, IonTitle, IonToolbar, alertController
} from "@ionic/vue";
import { addOutline, checkmarkOutline, closeOutline, removeCircleOutline, rocketOutline, saveOutline, sparklesOutline } from "ionicons/icons";
import { translate, commonUtil } from "@common";
import { computed, ref } from "vue";
import { onIonViewWillEnter } from "@ionic/vue";
import ChatContainer from "@/components/chat/ChatContainer.vue";
import { useComposerStore } from "@/store/composer";

const composer = useComposerStore();

const showToolsModal = ref(false);
const toolQueryString = ref("");
const draftToolIds = ref([] as string[]);

const selectedModel = computed({
  get: () => composer.modelName ? `${composer.providerName}::${composer.modelName}` : "",
  set: (value: string) => {
    const [providerName, modelName] = value.split("::");
    composer.providerName = providerName;
    composer.modelName = modelName;
  }
});

const filteredTools = computed(() => {
  const query = toolQueryString.value.trim().toLowerCase();
  if(!query) return composer.toolCatalog;
  return composer.toolCatalog.filter((tool) =>
    [tool.toolName, tool.description, tool.toolId].some((value) => (value || "").toLowerCase().includes(query)));
});

onIonViewWillEnter(async () => {
  await Promise.all([composer.fetchModelOptions(), composer.fetchToolCatalog()]);
});

function openToolsModal() {
  draftToolIds.value = composer.selectedTools.map((tool) => tool.toolId);
  toolQueryString.value = "";
  showToolsModal.value = true;
}

function closeToolsModal() {
  showToolsModal.value = false;
}

function isToolSelected(toolId: string) {
  return draftToolIds.value.includes(toolId);
}

function toggleToolSelection(toolId: string) {
  if(isToolSelected(toolId)) {
    draftToolIds.value = draftToolIds.value.filter((draftToolId) => draftToolId !== toolId);
  } else {
    draftToolIds.value.push(toolId);
  }
}

function saveTools() {
  composer.selectedTools = draftToolIds.value.map((toolId) => {
    const existing = composer.selectedTools.find((tool) => tool.toolId === toolId);
    if(existing) return existing;
    const catalogTool = composer.toolCatalog.find((tool) => tool.toolId === toolId) as any;
    // default the checkbox to the tool's actual default: read-only tools are auto-approved already
    return { ...catalogTool, autoApprove: (catalogTool.requiresApproval || "N") === "N" };
  });
  closeToolsModal();
}

function removeTool(toolId: string) {
  composer.selectedTools = composer.selectedTools.filter((tool) => tool.toolId !== toolId);
}

async function save() {
  try {
    await composer.saveDraft();
    commonUtil.showToast(translate("Draft saved"));
  } catch {
    commonUtil.showToast(translate("Failed to save agent"));
  }
}

async function activate() {
  try {
    await composer.saveDraft();
    await composer.activate();
    commonUtil.showToast(translate("Agent activated. Find it in the Workforce."));
    composer.clearComposerState();
  } catch {
    commonUtil.showToast(translate("Failed to activate agent"));
  }
}

async function enhance() {
  const alert = await alertController.create({
    header: translate("Enhance instructions"),
    message: translate("Replace your instructions with an improved version written by the model?"),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Enhance"), role: "confirm" }
    ]
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  if(role !== "confirm") return;
  try {
    await composer.enhanceInstructions();
    commonUtil.showToast(translate("Instructions enhanced"));
  } catch {
    commonUtil.showToast(translate("Failed to enhance instructions"));
  }
}

async function sendPreview(content: string) {
  if(!composer.agentName.trim()) {
    commonUtil.showToast(translate("Your agent requires a name to start testing"));
    return;
  }
  try {
    await composer.sendPreviewMessage(content);
  } catch {
    commonUtil.showToast(translate("Preview failed"));
  }
}
```

  Add to the scoped styles: `.actions { display: flex; gap: var(--spacer-sm); margin-block-start: var(--spacer-base); }`

  Note: check `commonUtil.showToast` is exported from `@common` (it is used as `commonUtil.showToast()` elsewhere in this app, e.g. via `import { commonUtil } from '@common'` — follow the exact import the QuickBox/Shopify views use).

- [ ] **Step 2: Add the new i18n keys** to `src/locales/en.json` (alphabetical order, identity values): `"Activate"`, `"Agent"`, `"Agent activated. Find it in the Workforce."`, `"Cancel"`, `"Draft saved"`, `"Enhance instructions"`, `"Failed to activate agent"`, `"Failed to enhance instructions"`, `"Failed to save agent"`, `"Instructions enhanced"`, `"Mutating"`, `"Preview failed"`, `"Read only"`, `"Replace your instructions with an improved version written by the model?"`, `"Working"`, `"none"`, `"low"`, `"medium"`, `"high"`. Then grep every `translate("...")` literal in the two agent views + chat components and add any key still missing.

- [ ] **Step 3: `npm run lint && npm run build`** — expected: success (Workforce.vue still uses old ChatContainer props — if the build fails there, that's B5's known state; confirm Composer compiles by the error list shrinking to Workforce only, then finish B5 before committing the build-green state).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(composer): wire Composer view to moqui-ai (draft, grants, preview, enhance, activate)"`

### Task B4: Workforce Pinia store

**Files:**
- Create: `src/store/workforce.ts`

- [ ] **Step 1: Create `src/store/workforce.ts`:**

```typescript
import { defineStore } from 'pinia'
import { api, logger } from '@common'
import type { ChatItem } from '@/components/chat/ChatContainer.vue'

export type WorkforceConversation = {
  conversationId: string;
  agentId: string;
  agentName: string;
  title: string;
  userId: string;
  userFullName?: string;
  lastActivityDate?: number;
  derivedStatus: 'pending' | 'running' | 'error' | 'idle';
  pendingToolName?: string;
}

const hasError = (resp: any) => !!(resp?.data?._ERROR_MESSAGE_ || resp?.data?._ERROR_MESSAGE_LIST_ || resp?.data?.errors)

function toChatItems(detail: any): ChatItem[] {
  const items: ChatItem[] = []
  const userName = detail?.conversation?.userFullName || detail?.conversation?.userId || 'User'
  for (const msg of detail?.messageList || []) {
    if (msg.role === 'user') {
      items.push({ id: `msg-${msg.messageSeqId}`, type: 'message', userName, content: msg.content })
    } else if (msg.role === 'assistant') {
      if (msg.toolCalls?.length) {
        for (const toolCall of msg.toolCalls) {
          items.push({ id: `tc-${msg.messageSeqId}-${toolCall.id}`, type: 'toolCall', toolName: toolCall.name,
            args: JSON.stringify(toolCall.arguments ?? {}, null, 2) })
        }
      }
      if (msg.content) {
        items.push({ id: `agent-${msg.messageSeqId}`, type: 'agentMessage', content: msg.content })
      }
    }
    // role 'tool' results are not rendered as bubbles; the tool-call card carries the action
  }
  for (const req of detail?.pendingRequestList || []) {
    let args = req.arguments
    try { args = JSON.stringify(JSON.parse(req.arguments), null, 2) } catch { /* keep raw */ }
    items.push({ id: `perm-${req.toolCallRequestId}`, type: 'permission', permissionId: req.toolCallRequestId,
      toolName: req.toolName, message: `${req.toolName}\n${args}` })
  }
  if (detail?.latestRun?.errorText && ['AI_RUN_FAILED', 'AI_RUN_ABORTED', 'AI_RUN_TRUNCATED'].includes(detail?.latestRun?.statusId)) {
    items.push({ id: `err-${detail.latestRun.agentRunId}`, type: 'agentMessage', content: detail.latestRun.errorText })
  }
  return items
}

export const useWorkforceStore = defineStore('workforce', {
  state: () => ({
    conversations: [] as WorkforceConversation[],
    selectedConversationId: '',
    detail: null as any,
    chatItems: [] as ChatItem[],
    activeAgents: [] as any[],
    sending: false,
    deciding: false
  }),

  getters: {
    selectedConversation: (state) =>
      state.conversations.find((conversation) => conversation.conversationId === state.selectedConversationId)
  },

  actions: {
    async fetchConversations() {
      try {
        const resp = await api({ url: 'ai/conversations', method: 'get', params: { pageSize: 100 } }) as any
        if (hasError(resp)) throw resp.data
        this.conversations = resp?.data?.conversationList || []
      } catch (error) {
        logger.error(error)
      }
    },

    async fetchConversationDetail(conversationId?: string) {
      const id = conversationId || this.selectedConversationId
      if (!id || this.sending || this.deciding) return
      try {
        const resp = await api({ url: `ai/conversations/${encodeURIComponent(id)}`, method: 'get' }) as any
        if (hasError(resp)) throw resp.data
        this.detail = resp.data
        this.chatItems = toChatItems(resp.data)
      } catch (error) {
        logger.error(error)
      }
    },

    async selectConversation(conversationId: string) {
      this.selectedConversationId = conversationId
      this.detail = null
      this.chatItems = []
      await this.fetchConversationDetail(conversationId)
    },

    async sendMessage(content: string) {
      if (!this.selectedConversationId) return
      this.sending = true
      const userName = this.detail?.conversation?.userFullName || 'You'
      this.chatItems.push({ id: `optimistic-${Date.now()}`, type: 'message', userName, content })
      try {
        const resp = await api({ url: `ai/conversations/${encodeURIComponent(this.selectedConversationId)}/messages`,
          method: 'post', data: { userMessage: content } }) as any
        if (hasError(resp)) throw resp.data
        return resp.data
      } finally {
        this.sending = false
        await this.fetchConversationDetail()
        await this.fetchConversations()
      }
    },

    async decideToolCall(toolCallRequestId: string, approved: boolean) {
      this.deciding = true
      try {
        const action = approved ? 'approve' : 'reject'
        const resp = await api({ url: `ai/toolCallRequests/${encodeURIComponent(toolCallRequestId)}/${action}`,
          method: 'post', data: {} }) as any
        if (hasError(resp)) throw resp.data
        return resp.data
      } finally {
        this.deciding = false
        await this.fetchConversationDetail()
        await this.fetchConversations()
      }
    },

    async fetchActiveAgents() {
      try {
        const resp = await api({ url: 'ai/agents', method: 'get', params: { statusId: 'AI_AGENT_ACTIVE', pageSize: 100 } }) as any
        if (hasError(resp)) throw resp.data
        this.activeAgents = resp?.data || []
      } catch (error) {
        logger.error(error)
      }
    },

    async startConversation(agentId: string) {
      const resp = await api({ url: 'ai/conversations', method: 'post', data: { agentId } }) as any
      if (hasError(resp) || !resp?.data?.conversationId) throw resp?.data
      await this.fetchConversations()
      await this.selectConversation(resp.data.conversationId)
      return resp.data.conversationId
    },

    clearWorkforceState() {
      this.$reset()
    }
  }
})
```

  Note on `fetchActiveAgents`: the entity-list REST method returns the list directly as the JSON body (an array). Verify the actual shape on first run (Phase C) — if it's `{ ... }` wrapped, adjust to the wrapped key.

- [ ] **Step 2: `npm run lint && npm run build`** — success expected.
- [ ] **Step 3: Commit** — `git add src/store/workforce.ts && git commit -m "feat(workforce): pinia store for inbox, thread, decisions"`

### Task B5: Workforce view wiring

**Files:**
- Modify: `src/views/agent/Workforce.vue` (replace content)
- Modify: `src/locales/en.json` (new keys)
- Modify: `src/store/user.ts` (logout resets)

- [ ] **Step 1: Replace `src/views/agent/Workforce.vue` with:**

```vue
<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Workforce") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openNewConversationModal">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="workforce">
        <!-- Conversation list pane -->
        <aside class="workforce__list">
          <div class="workforce__filters">
            <ion-chip
              v-for="filter in filters"
              :key="filter.value"
              :outline="activeFilter !== filter.value"
              @click="activeFilter = filter.value"
            >
              <ion-icon v-if="filter.color" :icon="ellipse" :color="filter.color" />
              <ion-label>{{ translate(filter.label) }}</ion-label>
            </ion-chip>
          </div>

          <ion-list lines="full">
            <conversation-item
              v-for="conversation in filteredConversations"
              :key="conversation.conversationId"
              :agent-name="conversation.agentName"
              :conversation-name="conversation.title || translate('New conversation')"
              :pending-request="statusCaption(conversation)"
              :badge="conversation.derivedStatus === 'pending' || conversation.derivedStatus === 'error'"
              :badge-color="conversation.derivedStatus === 'error' ? 'danger' : 'primary'"
              :class="{ 'workforce__conversation--active': conversation.conversationId === workforce.selectedConversationId }"
              @click="workforce.selectConversation(conversation.conversationId)"
            />
          </ion-list>
        </aside>

        <!-- Conversation thread pane -->
        <section class="workforce__thread">
          <chat-container
            v-if="workforce.selectedConversationId"
            :agent-name="workforce.detail?.agent?.agentName || ''"
            :items="workforce.chatItems"
            :busy="workforce.sending || workforce.deciding"
            @send-message="onSendMessage"
            @allow-tool="onAllowTool"
            @deny-tool="onDenyTool"
          />
          <div v-else class="workforce__empty">
            <ion-text color="medium">{{ translate("Select a conversation to view the thread") }}</ion-text>
          </div>
        </section>
      </div>

      <ion-modal :is-open="showNewConversationModal" @didDismiss="showNewConversationModal = false">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="showNewConversationModal = false">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Start a conversation") }}</ion-title>
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <ion-list>
            <ion-item v-if="!workforce.activeAgents.length">
              <ion-label>{{ translate("No active agents found. Compose and activate one first.") }}</ion-label>
            </ion-item>
            <ion-item v-for="agent in workforce.activeAgents" :key="agent.agentId" button @click="startConversation(agent.agentId)">
              <ion-label>
                <h2>{{ agent.agentName }}</h2>
                <p>{{ agent.description }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList,
  IonMenuButton, IonModal, IonPage, IonText, IonTitle, IonToolbar, onIonViewWillEnter, onIonViewWillLeave
} from "@ionic/vue";
import { addOutline, closeOutline, ellipse } from "ionicons/icons";
import { translate, commonUtil } from "@common";
import { computed, ref } from "vue";
import ChatContainer from "@/components/chat/ChatContainer.vue";
import ConversationItem from "@/components/chat/ConversationItem.vue";
import { useWorkforceStore, WorkforceConversation } from "@/store/workforce";

const workforce = useWorkforceStore();

const filters = [
  { value: "all", label: "All", color: "" },
  { value: "pending", label: "Pending", color: "primary" },
  { value: "running", label: "Running", color: "medium" },
  { value: "error", label: "Error", color: "danger" }
] as const;

const activeFilter = ref<string>("all");
const showNewConversationModal = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const filteredConversations = computed(() =>
  activeFilter.value === "all"
    ? workforce.conversations
    : workforce.conversations.filter((conversation) => conversation.derivedStatus === activeFilter.value)
);

function statusCaption(conversation: WorkforceConversation): string {
  switch (conversation.derivedStatus) {
    case "pending":
      return `${translate("Pending request")} ${conversation.pendingToolName ?? ""}`.trim();
    case "running":
      return translate("Running");
    case "error":
      return translate("Tool call error");
    default:
      return "";
  }
}

async function refresh() {
  await workforce.fetchConversations();
  if(workforce.selectedConversationId) await workforce.fetchConversationDetail();
}

onIonViewWillEnter(async () => {
  await refresh();
  pollTimer = setInterval(refresh, 10000);
});

onIonViewWillLeave(() => {
  if(pollTimer) clearInterval(pollTimer);
  pollTimer = null;
});

async function onSendMessage(content: string) {
  try {
    await workforce.sendMessage(content);
  } catch {
    commonUtil.showToast(translate("Failed to send message"));
  }
}

async function onAllowTool(item: any) {
  try {
    await workforce.decideToolCall(item.permissionId, true);
  } catch {
    commonUtil.showToast(translate("Failed to record decision"));
  }
}

async function onDenyTool(item: any) {
  try {
    await workforce.decideToolCall(item.permissionId, false);
  } catch {
    commonUtil.showToast(translate("Failed to record decision"));
  }
}

async function openNewConversationModal() {
  await workforce.fetchActiveAgents();
  showNewConversationModal.value = true;
}

async function startConversation(agentId: string) {
  try {
    await workforce.startConversation(agentId);
    showNewConversationModal.value = false;
  } catch {
    commonUtil.showToast(translate("Failed to start conversation"));
  }
}
</script>

<style scoped>
.workforce {
  display: flex;
  height: 100%;
}

.workforce__list {
  display: flex;
  flex-direction: column;
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--ion-color-step-150, #d7d8da);
  overflow-y: auto;
}

.workforce__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
}

.workforce__conversation--active {
  --background: var(--ion-color-light, #f4f5f8);
}

.workforce__thread {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}

.workforce__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 16px;
  text-align: center;
}

/* Stack to a single pane on small screens */
@media (max-width: 768px) {
  .workforce {
    flex-direction: column;
  }

  .workforce__list {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--ion-color-step-150, #d7d8da);
  }
}
</style>
```

- [ ] **Step 2: i18n keys** — add: `"Failed to record decision"`, `"Failed to send message"`, `"Failed to start conversation"`, `"New conversation"`, `"No active agents found. Compose and activate one first."`, `"Pending request"`, `"Running"`, `"Select a conversation to view the thread"`, `"Start a conversation"`, `"Tool call error"`, `"All"`, `"Pending"`, `"Error"` (skip any that already exist).

- [ ] **Step 3: Register logout resets** — in `src/store/user.ts` `postLogout()`, after the existing `useKlaviyoStore().clear()` block, add (matching the file's dynamic-import style):

```typescript
      const { useComposerStore } = await import('./composer')
      const { useWorkforceStore } = await import('./workforce')
      useComposerStore().clearComposerState()
      useWorkforceStore().clearWorkforceState()
```

- [ ] **Step 4: `npm run lint && npm run build`** — expected: clean build of the whole app now.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(workforce): wire inbox/thread to moqui-ai with polling, decisions, new-conversation"`

---

## Phase C — End-to-end verification (asbeauty)

### Task C1: Server up with REST + keys

- [ ] **Step 1: Copy LLM keys (git-ignored)**

```bash
cp /Users/anilpatel/maarg-sd/notnaked/runtime/component/moqui-ai/dev.env \
   /Users/anilpatel/maarg-sd/asbeauty/runtime/component/moqui-ai/dev.env
git -C /Users/anilpatel/maarg-sd/asbeauty/runtime/component/moqui-ai check-ignore dev.env  # must print dev.env
```

- [ ] **Step 2: Load the new security data into the asbeauty DB** (server stopped, MySQL up):

```bash
cd /Users/anilpatel/maarg-sd/asbeauty
java -Dmoqui.conf=conf/MoquiDevConf.xml -Dmoqui.runtime=runtime -jar moqui.war \
  load location=component://moqui-ai/data/AiSecurityData.xml
```
Expected: loads ~15 records (create-or-update; existing rows untouched). If `moqui.war` is stale/missing, run `./gradlew addRuntime` equivalent the project uses — or simply `./gradlew load -Ptypes=` is NOT suitable (would reload everything); keep the targeted `location=` form.

- [ ] **Step 3: Start the server with keys in env**

```bash
cd /Users/anilpatel/maarg-sd/asbeauty
set -a && source runtime/component/moqui-ai/dev.env && set +a
nohup ./gradlew run > /tmp/asbeauty-run.log 2>&1 &
```
Wait for boot (`grep -m1 'Moqui Framework .* started' /tmp/asbeauty-run.log` or poll `curl -s http://localhost:8080/status`). Check the log for `AI: registered OpenAI provider` / `AI: registered Anthropic provider`.

- [ ] **Step 4: REST smoke test** — needs a dev login. **Ask Anil for asbeauty dev credentials** (username/password) if not already known, then:

```bash
TOKEN=$(curl -s -X POST 'http://localhost:8080/rest/s1/admin/login' -H 'Content-Type: application/json' \
  -d '{"username":"<USER>","password":"<PASS>"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -H "Authorization: Bearer $TOKEN" 'http://localhost:8080/rest/s1/ai/models' | python3 -m json.tool
curl -s -H "Authorization: Bearer $TOKEN" 'http://localhost:8080/rest/s1/ai/tools' | python3 -m json.tool | head -30
curl -s -H "Authorization: Bearer $TOKEN" 'http://localhost:8080/rest/s1/ai/conversations' | python3 -m json.tool
```
Expected: 200s with JSON bodies (modelList, capabilityList, conversationList). 401/403 → recheck token / security data load. (Verify the login response token key — maarg `login#User` may return `token` or `api_key`; adjust extraction.)

### Task C2: PWA against asbeauty + browser QA

- [ ] **Step 1: Start the PWA dev server**

```bash
cd /Users/anilpatel/pwa-sd/company && npm install && npm run dev   # serves on http://localhost:8100
```

- [ ] **Step 2: Browser QA with the `/browse` skill** (per user's global CLAUDE.md, use gstack `/browse`, NOT chrome MCP tools). Flow to verify:
  1. Login at `http://localhost:8100` — maarg instance `http://localhost:8080`, the dev credentials.
  2. **Composer**: name an agent, write rough instructions, click Enhance (text improves), pick model + reasoning effort, add a read-only tool + a mutating tool (if any mutating tools exist in the asbeauty catalog; otherwise grant `get_gated_echo`-class tool), check Auto approve on one, Save → toast; preview message → assistant reply renders, held mutating call renders as a "(held)" tool card; Activate → toast.
  3. **Workforce**: "+" → pick the activated agent → conversation created; send a message → reply renders; if a gated tool is proposed, the permission card appears → Allow → run resumes and the final answer renders; check the inbox row shows pending status while suspended; filters work; second browser session (or the AiOps screen at `http://localhost:8080/apps/AiOps`) cross-checks the same data.
  4. Regression: existing app pages (Product Store list) still load.
- [ ] **Step 3: Fix what QA surfaces** (shape mismatches, parsing, status mapping), re-run lint/build, commit fixes.

### Task C3: Push branches + PRs

- [ ] **Step 1: moqui-ai PR**

```bash
cd /Users/anilpatel/maarg-sd/asbeauty/runtime/component/moqui-ai
git push -u origin feat/pwa-rest-api
gh pr create --repo hotwax/moqui-ai --base main --title "feat: REST facade + workforce/composer services for company-app PWA" \
  --body "<summary: ai.rest.xml, WorkforceServices, get#AgentDetail, list#Model, enhance#Instructions, runner honors requiresApprovalOverride (ADR revised), /ai REST path authz. Note: deployed envs need AiSecurityData re-load (no upgrade/ machinery in this component yet).>"
```

- [ ] **Step 2: company PR**

```bash
cd /Users/anilpatel/pwa-sd/company
git push -u origin feat/agent-ux-wiring
gh pr create --repo hotwax/company --base test/combine-pr-141-142 --title "feat: wire agent Composer + Workforce to moqui-ai" \
  --body "<summary: composer/workforce pinia stores, ChatContainer timeline, full wiring per spec docs/superpowers/specs/2026-06-11-agent-ux-wiring-design.md; depends on hotwax/moqui-ai#<PR>>"
```
(Base = the PR #154 branch so the diff shows only the wiring; retarget later if #154 merges.)

---

## Self-review notes (already applied)

- Spec §1–§8 each map to tasks: REST surface → A6; new services → A3/A4/A5; override fix → A2; stores → B2/B4; Composer wiring → B3; Workforce wiring + timeline + "+" button → B1/B5; error handling → store `hasError` + toasts; testing → A-task TDD + C2 QA. Out-of-scope items have no tasks (correct).
- Type consistency: `ChatItem` defined once in ChatContainer.vue, imported by both stores; `toolRequiresApproval` used at both gating sites; `clearComposerState`/`clearWorkforceState` names match the user.ts registration.
- Known checkpoints needing live verification (flagged inline): maarg login token key name, entity-list REST response shape for `GET /agents`, `commonUtil.showToast` import form, persist-plugin behavior on the composer store.
