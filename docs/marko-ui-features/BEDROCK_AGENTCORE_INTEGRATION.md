# Enterprise Integration Plan — Marko + Hermes ↔ Amazon Bedrock AgentCore

**Audience:** engineering + platform architecture for a large regulated enterprise
(e.g. J&J / life-sciences). **Status:** plan only — no implementation yet.
**Repo baseline:** Hermes already speaks **Bedrock foundation models**
(Converse + AnthropicBedrock). It does **not** yet speak **AgentCore**
(Harness, Runtime, Gateway, Memory, Identity, Observability).

Primary references:
- [AgentCore overview](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html)
- [AgentCore Harness](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness.html)
- [InvokeHarness / CreateHarness](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-get-started.html)
- [aws-samples/sample-strands-agent-with-agentcore](https://github.com/aws-samples/sample-strands-agent-with-agentcore)
- Peer patterns: Sanofi Concierge → AgentCore, AstraZeneca Development Assistant (Bedrock Agents), Genentech gRED Research Agent, J&J CLOUDx Agentic AI (Bedrock + HITL + governance)

---

## 0. What this plan is solving

| Today (this repo) | What a J&J-scale enterprise needs |
|---|---|
| Hermes owns the agent loop; calls Bedrock **models** via Converse / AnthropicBedrock | Enterprise wants **AgentCore Harness + Runtime** to own isolation, identity, memory, tool gateway, observability |
| Marko UI → `POST /agui` → in-process `AIAgent` | Marko stays the **experience shell**; agent execution moves (or dual-runs) behind AgentCore |
| Session state in SQLite (`SessionDB`) | Short-term chat can stay local; long-term / cross-agent memory → AgentCore Memory; audit → CloudWatch OTEL |
| Hermes tools + A2UI | Enterprise tools via **AgentCore Gateway (MCP)** + policy; Marko A2UI for interactive forms stays |
| IAM for `InvokeModel` only | IAM for `InvokeHarness` / `InvokeAgentRuntime`, VPC, PrivateLink, Okta/Entra inbound auth |

**Non-goal of v1:** replace Marko or rewrite Hermes into Strands. Goal is a **paved path** so Marko can drive AgentCore the way Sanofi’s Concierge drives an agent hub, while keeping Hermes as the optional local/dev runtime.

---

## 1. Industry pattern — what peers actually ship

Large enterprises (especially life-sciences) converge on the same shape:

```
┌─────────────────────────────────────────────────────────────┐
│  Experience layer (chat UI / companion)                      │
│  Sanofi Concierge · AZ Development Assistant · Marko (us)    │
└───────────────────────────┬─────────────────────────────────┘
                            │ SSE / WebSocket / AG-UI
┌───────────────────────────▼─────────────────────────────────┐
│  Orchestration / agent hub                                   │
│  Supervisor + specialized sub-agents (AZ, Genentech)         │
│  OR managed Harness (AgentCore GA)                           │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  AgentCore platform                                          │
│  Runtime (isolated microVM) · Memory · Gateway (MCP) ·       │
│  Identity (Okta/Entra) · Browser · Code Interpreter ·        │
│  Observability (OTEL→CloudWatch) · Policy · Evaluations      │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Enterprise systems                                          │
│  Ticketing · CMDB · Service catalog · Knowledge bases ·      │
│  ERP / Salesforce · Internal APIs (VPC / PrivateLink)        │
└─────────────────────────────────────────────────────────────┘
```

| Company | What they did | What we copy |
|---|---|---|
| **Sanofi** | Concierge UI + agent hub on Bedrock; expanding to **AgentCore** for scale | Marko = Concierge; AgentCore = hub backend |
| **AstraZeneca** | Multi-agent Bedrock Agents (supervisor → clinical / regulatory / safety / DB) | Specialized harnesses per domain + Marko router |
| **Genentech** | Research agent + cited retrieval; plan for specialized sub-agents | Knowledge + citation events in AG-UI |
| **J&J CLOUDx (public job posting)** | Bedrock agents for cloud ops: tickets, fulfillment, self-service; **HITL, audit, secure-by-design** | First vertical = ops/cloud workflows, not patient data |
| **AWS procurement SPA** | Strands + AgentCore Runtime + MCP tools + streaming | Reference for Gateway + Runtime packaging |
| **AgentCore Harness GA** | Config-first agent (`CreateHarness` / `InvokeHarness`); export to Strands when needed | **Default path for v1** — no container until custom orchestration is required |

**Enterprise non-negotiables (J&J-class):**
1. Session isolation (AgentCore microVM per session).
2. Corporate IdP (Okta / Entra) inbound; no long-lived user AWS keys in the browser.
3. VPC / PrivateLink for tool access to internal systems.
4. Policy on every tool call (AgentCore Policy + Gateway).
5. Full OTEL traces in CloudWatch (and SIEM export).
6. Human-in-the-loop for write actions (Marko approvals already exist — keep them).
7. Evaluations / A/B before promoting harness versions.
8. Data residency + model allow-list (Bedrock region + approved model IDs only).

---

## 2. Current Hermes / Marko baseline (facts)

### Already present
- `agent/bedrock_adapter.py` — Converse + discovery + Guardrails (Converse path).
- `agent/anthropic_adapter.py` — AnthropicBedrock for Claude.
- `hermes_cli/runtime_provider.py` — dual-path Bedrock routing.
- Marko AG-UI: `POST /agui` SSE (`RUN_*`, `TEXT_*`, `TOOL_CALL_*`, `CUSTOM a2ui.message`, `hermes.title`, `hermes.context`).
- Harness perf work already shipped in-repo (loop-native SSE, delta coalescing, client C2) — keep for Marko↔proxy latency.

### Missing (AgentCore)
- Zero references to `bedrock-agentcore`, `InvokeHarness`, `InvokeAgentRuntime`, Gateway, AgentCore Memory/Identity.
- Marko providers enum is only `{native, agui-remote, hermes-python}` — no `bedrock-agentcore`.
- No mapping from AgentCore stream events → AG-UI events.
- Guardrails not applied on AnthropicBedrock path; no AgentCore Policy.

---

## 3. Target architecture (recommended)

**Two backends behind one Marko UI**, selected per profile:

```
Browser Marko SPA
   │  REST /api/*  +  POST /agui (SSE)   ← unchanged wire contract
   ▼
Hermes FastAPI (edge / BFF for Marko)
   │
   ├─ mode=hermes-local     → AIAgent (today) — dev / offline / air-gapped
   │
   └─ mode=agentcore        → AgentCoreBackend
         │
         ├─ InvokeHarness (config agents)           ← default enterprise path
         └─ InvokeAgentRuntime (custom containers)  ← when Strands/custom needed
                │
                ▼
         AgentCore: Memory · Gateway(MCP) · Identity · Browser ·
                    CodeInterpreter · Observability · Policy · Registry
```

### Why Hermes stays in the middle
- Marko already authenticates to Hermes and speaks AG-UI; rewriting the browser for AgentCore APIs would break the one-hop Marko contract.
- Hermes becomes the **enterprise adapter**: IdP token exchange → AgentCore inbound auth, stream translation, HITL gating, SQLite session index for the sidebar.
- Same pattern Sanofi uses: companion UI → agent hub → AgentCore/Bedrock.

### Mode selection (profile config)

```yaml
# ~/.hermes/profiles/<p>/config.yaml
model:
  provider: agentcore          # new
agentcore:
  mode: harness                # harness | runtime
  region: us-east-1
  harness_arn: arn:aws:bedrock-agentcore:...:harness/MarkoOps-...
  # OR for custom:
  # agent_runtime_arn: arn:aws:bedrock-agentcore:...:runtime/...
  runtime_session_prefix: marko
  memory_id: ...               # optional AgentCore Memory
  gateway_url: https://...     # MCP gateway endpoint
  authorizer: cognito|okta|entra
```

Marko Profiles API gains provider `agentcore` alongside existing enums.

---

## 4. Event mapping — AgentCore stream → AG-UI

`InvokeHarness` returns a stream. Map to existing Marko events so the UI needs **zero protocol change**:

| AgentCore stream event (approx.) | AG-UI emit |
|---|---|
| session / invoke start | `RUN_STARTED` (already early-emitted by our async handler) |
| `contentBlockDelta.delta.text` | coalesce → `TEXT_MESSAGE_CONTENT` (reuse `_DeltaCoalescer`) |
| tool use start / args / result | `TOOL_CALL_START` / `ARGS` / `RESULT` / `END` |
| memory recall / citation | `CUSTOM hermes.citation` (new) or fold into text |
| policy deny / guardrail | `CUSTOM hermes.policy` + optional `RUN_ERROR` |
| browser / code-interpreter step | `STEP_STARTED` / `STEP_FINISHED` (Marko run chips) |
| final / stop | `RUN_FINISHED` |
| `runtimeClientError` | `RUN_ERROR` |

**New file:** `hermes_cli/agentcore_backend.py`
- `AgentCoreBackend.run(input, emit, cancel)` — mirror `_run_agent_sync` signature.
- boto3 clients: `bedrock-agentcore` (invoke), `bedrock-agentcore-control` (admin only in ops jobs).
- `runtimeSessionId` = deterministic from Marko `threadId` (pad ≥ 33 chars — AgentCore requirement).

**Change:** `agui_endpoint.py` — branch on `provider == agentcore` before constructing `AIAgent`.

---

## 5. Feature parity matrix — Hermes harness features vs AgentCore

| Feature | Hermes today | AgentCore | Integration action |
|---|---|---|---|
| Agent loop / tool calling | `AIAgent` + tools | **Harness** (managed loop) or Runtime (custom) | Prefer Harness for v1 |
| Interactive forms (A2UI) | `a2ui_render` + Marko widgets | Not native | Keep Hermes/Marko A2UI; agent returns structured “need form” → Marko renders; submit via `a2uiAction` follow-up that resumes harness session |
| Session titles | heuristic + LLM | n/a | Keep Marko title path on first user turn |
| Working/done chrome | Marko C2/C1 | n/a | Keep; TTFE still from our SSE bridge |
| Memory | SessionDB + plugins | **AgentCore Memory** | Dual-write: short transcript in SQLite for sidebar; long-term preferences/facts in AgentCore Memory |
| MCP tools | Hermes MCP registry | **AgentCore Gateway** | Enterprise tools register in Gateway; Hermes MCP for local/dev only |
| Skills | Hermes skills_registry | AgentCore Registry + harness `skills[]` | Publish approved skills to Registry; harness references ARNs |
| Code execution | Hermes tools | **Code Interpreter** | Prefer AgentCore sandbox in enterprise mode |
| Browser automation | optional | **AgentCore Browser** | Prefer AgentCore; live-view URL → Marko panel |
| Auth | Hermes session token | **AgentCore Identity** (Okta/Entra/Cognito) | Hermes exchanges enterprise JWT → AgentCore inbound; never expose AWS keys to browser |
| Guardrails / policy | Bedrock Guardrails (Converse only) | **AgentCore Policy** + Gateway intercept | Policy required for production write tools |
| Observability | Hermes logs | **OTEL → CloudWatch** | Emit trace IDs on `CUSTOM hermes.trace`; Marko footer link to CloudWatch |
| Eval / optimize | none | **Evaluations + Optimization** | Ops pipeline, not Marko UI v1 |
| SQLite enterprise posture | WAL + NORMAL + planned backups | AgentCore is source of truth for agent state | Keep SQLite as Marko session index only |

---

## 6. Enterprise AWS footprint (J&J-class landing zone)

```
Account: agent-platform-prod (or shared AI platform account)
Region: approved (e.g. us-east-1) — model + data residency locked

Network
  VPC (private subnets) + AgentCore harness networkMode=VPC
  PrivateLink to AgentCore / Bedrock
  Security groups: egress only to approved prefixes (Gateway, KB, internal APIs)

Identity
  Corporate IdP (Okta / Entra) → Cognito or direct JWT authorizer on harness
  Execution role for harness (least privilege: Bedrock invoke, Gateway, Memory, S3/EFS mounts)
  No static keys in Marko; Hermes uses IRSA / instance profile / SSO

Data
  AgentCore Memory encrypted CMK
  Session filesystem: ephemeral microVM (+ optional S3/EFS access points for approved corpora)
  Marko SQLite: non-PHI metadata only for first vertical (cloud ops)

Observability / compliance
  AgentCore Observability → CloudWatch Logs/Traces
  SIEM subscription (Splunk/Chronicle)
  CloudTrail on control plane (CreateHarness, UpdateHarnessEndpoint)
  Evaluations gate before promoting harness endpoint (prod ← staging)

Promotion
  harness versions immutable; named endpoints (dev / staging / prod)
  Rollback = repoint endpoint to prior version (AgentCore native)
```

**First vertical recommendation (matches public J&J CLOUDx direction):**  
internal **cloud operations / ticket / self-service** agent — not clinical or patient data — so PHI/GxP controls come in phase 2 after the platform path is proven.

---

## 7. Implementation phases

### Phase 0 — Discovery & access (platform)
- AWS account access; enable AgentCore in region; VPC + PrivateLink design review.
- Confirm IdP (Okta/Entra) integration path with IAM Identity Center / Cognito.
- Model allow-list (e.g. Claude Sonnet via Bedrock only).
- Threat model: session isolation, tool policy, data classes (public / internal / confidential).
- **Exit:** signed architecture decision record (ADR): *Marko → Hermes adapter → AgentCore Harness*.

### Phase 1 — AgentCore Harness spike (no Marko UI change)
**New package:** `hermes/agent/agentcore/` (or `hermes_cli/agentcore_*.py`).

| Deliverable | Detail |
|---|---|
| boto3 clients | `bedrock-agentcore`, `bedrock-agentcore-control` (pin versions; optional extra `hermes-agent[agentcore]`) |
| `CreateHarness` IaC | Terraform/CDK: harness + execution role + VPC config + endpoint `dev` |
| `InvokeHarness` CLI | `hermes agentcore invoke --harness-arn … --session …` prints stream |
| Stream parser | Map content/tool/error events → internal callback protocol identical to `AIAgent` callbacks |
| Config schema | `agentcore:` block in `config.yaml` (see §3) |

**Exit:** CLI can run a harness that answers + calls one Gateway MCP tool; CloudWatch shows a trace.

### Phase 2 — Wire Marko AG-UI (`mode=agentcore`)
| Deliverable | Detail |
|---|---|
| `AgentCoreBackend` in `agui_endpoint.py` | Branch before `AIAgent`; reuse `_DeltaCoalescer`, early `RUN_STARTED`, cancel via thread Event |
| Session ID mapping | `runtimeSessionId = f"marko-{threadId}"` padded ≥ 33 |
| Profiles API | Provider `agentcore`; UI fields: harness ARN, region, endpoint name |
| Capabilities | `GET /api/capabilities` flag `agentcore: true` when creds + ARN present |
| Title / context | Keep heuristic titles; emit `hermes.context` from AgentCore usage metrics if present |
| A2UI bridge | When harness returns structured `{a2ui:…}` JSON in a tool result or final message, emit `CUSTOM a2ui.message` (same as today) |

**Exit:** Marko chat against AgentCore feels identical to local Hermes (working chrome, streaming, tools, forms).

### Phase 3 — Enterprise platform services
| Deliverable | Detail |
|---|---|
| Gateway | Publish 3–5 internal APIs as MCP tools (ticket create, CMDB lookup, service catalog request) |
| Policy | Cedar / NL policies: deny prod write without approval tag; Marko HITL for writes |
| Identity | Inbound JWT validation; outbound OAuth for SaaS tools |
| Memory | Long-term user/project memory store; Marko “Memory” panel reads AgentCore Memory API |
| Observability | Propagate `trace_id` to Marko StatusFooter; deep-link CloudWatch |
| Browser / Code Interpreter | Enable as harness tools; surface live-view URL in Marko panel |

**Exit:** one production endpoint (`prod`) behind HITL for write tools; audit trail complete.

### Phase 4 — Multi-agent + graduation
| Deliverable | Detail |
|---|---|
| Domain harnesses | Ops / Knowledge / Procurement (AZ/Genentech pattern) |
| Marko router | Lightweight supervisor (Hermes or Step Functions `InvokeHarness`) picks harness by intent |
| Export path | When config harness is insufficient, `agentcore export` → Strands project on **Runtime** (AWS graduation path) |
| Evaluations | Offline eval suites + Optimization A/B before prod promote |
| Registry | Publish approved skills/MCP servers for other J&J teams (internal paved path) |

**Exit:** multi-harness catalog in Marko; Runtime used only where custom orchestration is justified.

### Phase 5 — Regulated / GxP (optional, later)
- PHI segmentation, validated environments, model change control, stronger retention.
- Do **not** start here; prove Phase 3 on internal ops first.

---

## 8. Concrete code touchpoints (this repo)

| File / area | Change |
|---|---|
| `hermes/pyproject.toml` | Optional extra `agentcore = ["boto3>=…", "bedrock-agentcore…"]` |
| `hermes_cli/config.py` | Default `agentcore: {}` schema |
| `hermes_cli/runtime_provider.py` | Resolve `provider=agentcore` → runtime dict with ARNs |
| **new** `hermes_cli/agentcore_backend.py` | InvokeHarness/Runtime + stream→callback |
| **new** `hermes_cli/agentcore_events.py` | Pure event mapper (unit-testable) |
| `hermes_cli/agui_endpoint.py` | Backend switch; keep coalescing / early RUN_STARTED |
| `hermes_cli/marko_profiles_api.py` | Provider enum + DTO fields |
| `hermes_cli/marko_capabilities.py` | Feature flags |
| `ui/.../Settings` / Profiles | AgentCore ARN / region / endpoint fields |
| `docs/marko-ui-features/API_MAPPING.md` | Document no new browser routes (adapter is server-side) |
| `scripts/smoke_agui.py` | `--backend agentcore` timing mode |
| IaC (new) `infra/agentcore/` | Terraform: harness, roles, VPC endpoints, Gateway stubs |

**Do not** reintroduce `hermes/web` Vite UI; Marko remains the only SPA.

---

## 9. Security & compliance checklist

- [ ] Browser never holds AWS credentials.
- [ ] Hermes holds only short-lived enterprise JWT + IRSA to call AgentCore.
- [ ] Harness `networkMode=VPC`; no public tool egress except allow-listed.
- [ ] Every mutating tool behind AgentCore Policy **and** Marko approval card.
- [ ] Prompt + tool args redaction in logs (no secrets in CloudWatch).
- [ ] `runtimeSessionId` / Marko `threadId` correlation stored for audit.
- [ ] Kill switch: Profiles toggle back to `hermes-local` without redeploy.
- [ ] Data classification tag on harness; block PHI models/regions until Phase 5.
- [ ] Retention: AgentCore Memory TTL + Marko SQLite backup policy aligned.

---

## 10. Risks & decisions

| Risk | Mitigation |
|---|---|
| Harness config too limited for Hermes-parity tools | Graduate specific agents to Runtime (Strands export); keep Marko mapping |
| Double agent loops (Hermes + Harness) | **Never** nest; profile is XOR `hermes-local` \| `agentcore` |
| A2UI not understood by AgentCore | Keep A2UI in Marko; pass form results as next user message / tool result into same `runtimeSessionId` |
| Latency vs local Hermes | Reuse shipped SSE coalescing; measure TTFE/TTFT with `smoke_agui.py`; AgentCore cold start — warm endpoints / provisioned where needed |
| Org standard is classic Bedrock Agents (`InvokeAgent`) not AgentCore | Adapter supports a third mode later; prefer AgentCore Harness (current AWS paved path, Sanofi direction) |
| SQLite vs AgentCore Memory confusion | Document: SQLite = Marko UX index; AgentCore Memory = agent cognitive memory |

**ADR decision to lock in Phase 0:**  
*Marko remains the only UI. Hermes is the BFF/adapter. AgentCore Harness is the default production agent engine. Hermes local loop remains for dev and break-glass.*

---

## 11. Success metrics

| Metric | Target |
|---|---|
| Marko TTFE with AgentCore | < 100 ms to `RUN_STARTED` (local bridge); first token dominated by AgentCore |
| Tool-call policy deny visible in UI | < 1 s to `hermes.policy` event |
| Trace deep-link from Marko → CloudWatch | 100% of prod runs |
| Write actions with HITL | 100% |
| Time to add a new Gateway tool | < 1 day (config, not code) after Phase 3 |
| Rollback | < 5 minutes (endpoint repoint) |

---

## 12. Suggested first milestone (smallest vertical slice)

1. Terraform: one Harness + execution role in a sandbox account (public network OK for spike).
2. `hermes agentcore invoke` streaming to terminal.
3. `agui_endpoint` branch + Marko profile pointing at harness ARN.
4. One read-only Gateway tool (e.g. “list open tickets”).
5. CloudWatch trace screenshot + Marko session recording.

That proves the Sanofi/J&J pattern end-to-end without touching regulated data.

---

## 13. Document map

| Doc | Role |
|---|---|
| This file | Enterprise AgentCore integration plan |
| [HARNESS_PERFORMANCE.md](./HARNESS_PERFORMANCE.md) | Keep Marko↔adapter latency low (already partially shipped) |
| [AGUI_EVENTS.md](./AGUI_EVENTS.md) | Extend with `hermes.policy` / `hermes.citation` / `hermes.trace` when implemented |
| [API_MAPPING.md](./API_MAPPING.md) | No new public routes for AgentCore (server-side only) |
| [ONE_HOP_ARCHITECTURE.md](./ONE_HOP_ARCHITECTURE.md) | Still one hop browser→Hermes; Hermes may call AgentCore as backend |
