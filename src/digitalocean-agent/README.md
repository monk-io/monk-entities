# DigitalOcean GenAI Agent

Manage DigitalOcean GenAI Agents (create/read/update/delete) and related sub-resources like guardrails, knowledge bases, API keys, and deployments.

## Entity
- `digitalocean-agent/agent`: Provisions and manages a GenAI Agent via the DigitalOcean API (`/v2/gen-ai/agents`).

## Definition
- `name` (string, required): Agent display name
- `instruction` (string, required): System instruction
- `model_uuid` (string, required): Model UUID
  - Alternatively provide `model_id` or `inference_name` (e.g. `openai-o3`); it will be resolved to the correct UUID automatically.
- `project_id` (string, optional)
- `knowledge_base_uuids` (string[], optional): Knowledge Base UUIDs (alias of API `knowledge_base_uuid`)
- `guardrail_uuids` (string[], optional)
- `tags` (string[], optional)
- `region` (string, optional): e.g. `tor1`
- `provide_citations` (boolean, optional)
- `retrieval_method` (string, optional)
- `k` (number, optional)
- `temperature` (number, optional)
- `top_p` (number, optional)
- `max_tokens` (number, optional)
- `description` (string, optional)

## State
- `id` (string): Agent UUID
- `status` (string): Agent/deployment status
- `endpoint` (string): Deployment URL if available
- `existing` (boolean)

## Lifecycle
- `create`: POST `/v2/gen-ai/agents`
- `update`: PATCH `/v2/gen-ai/agents/{uuid}`
- `delete`: DELETE `/v2/gen-ai/agents/{uuid}`
- `checkReadiness`: GET `/v2/gen-ai/agents/{uuid}` and checks active/ready/running/enabled

## Actions
- `get`: Fetch full agent payload
- `setGuardrails`:
  - args: `guardrail_uuids=uuid1,uuid2`
  - effect: PATCH `/v2/gen-ai/agents/{uuid}` with `{"guardrail_uuids": [..]}`
- `setKnowledgeBases`:
  - args: `knowledge_base_uuids=uuid1,uuid2`
  - effect: PATCH `/v2/gen-ai/agents/{uuid}` with `{"knowledge_base_uuid": [..]}`
- `createApiKey`: POST `/v2/gen-ai/agents/{uuid}/api-keys`
- `revokeApiKey`:
  - args: `api_key_uuid=<uuid>`
  - effect: DELETE `/v2/gen-ai/agents/{uuid}/api-keys/{api_key_uuid}`
- `deploy`: POST `/v2/gen-ai/agents/{uuid}/deployments`

## Using the Agent endpoint and API keys

After creation/update completes and readiness checks pass, the entity state will contain:
- `endpoint`: public URL of the agent deployment (when published)
- `endpoint_api_key`: a secret key that authenticates requests to the endpoint (created automatically on first create, and also via `createApiKey`)

Example HTTP call to the agent (replace placeholders with values from state):

```bash
ENDPOINT="https://<your-agent-subdomain>.agents.do-ai.run"
API_KEY="<endpoint_api_key>"

curl -i \
  -X POST \
  $ENDPOINT$/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer xtS_pbWB_yCD3K8PW_hm2kOcnMaVkatU"
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "What is the capital of France?"
      }
    ],
    "stream": false,
    "include_functions_info": false,
    "include_retrieval_info": false,
    "include_guardrails_info": false
  }'

Notes:
- If your deployment is not public, enable publishing via definition `publish: true` (or run the `makePublic`/`deploy` actions) and ensure an API key exists (`createApiKey`).

## Example
```yaml
namespace: do-agent-example

agent:
  defines: digitalocean-agent/agent
  name: api-create
  instruction: "be a weather reporter"
  model_id: "openai-o3"
  project_id: "37455431-84bd-4fa2-94cf-e8486f8f8c5e"
  tags: ["tag1"]
  region: "tor1"
  publish: true
  knowledge_base_uuids:
    - "9758a232-b351-11ef-bf8f-4e013e2ddde4"
  services:
    data:
      protocol: custom
```

Run:
```bash
monk load dist/digitalocean-agent/MANIFEST
monk run do-agent-example/agent
monk do do-agent-example/agent/get
monk do do-agent-example/agent/setGuardrails --set guardrail_uuids="<uuid1>,<uuid2>"
monk do do-agent-example/agent/setKnowledgeBases --set knowledge_base_uuids="<kb1>,<kb2>"
monk do do-agent-example/agent/createApiKey
monk do do-agent-example/agent/revokeApiKey --set api_key_uuid="<key-uuid>"
monk do do-agent-example/agent/deploy

# Use endpoint and key from state
# curl -H "Authorization: Bearer <endpoint_api_key>" -H "Content-Type: application/json" \
#   -X POST "<endpoint>/chat" -d '{"input":"Hi"}'
```
