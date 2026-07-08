# Example workflows

Importable n8n workflows that show the E2B node in action. Each is a `.json` you can drop straight into n8n.

## Import

In n8n: **Workflows → Import from File** and select the JSON. After import, open the E2B node(s) and set your **E2B API** credential (the examples ship with a placeholder credential ID).

You'll need an E2B API key — create one at [e2b.dev/dashboard](https://e2b.dev/dashboard?tab=keys).

## The examples

Ordered from simplest to most advanced — start at Level 1 and work up.

| Level | File | What it shows |
| --- | --- | --- |
| 1 | [`1-run-command-ephemeral.json`](./1-run-command-ephemeral.json) | The simplest possible flow — run a command in a one-shot ephemeral sandbox (empty `Sandbox ID` + **Kill After Run**), no explicit create/kill needed. Great starting point and AI-agent tool pattern. |
| 2 | [`2-web-app-with-preview.json`](./2-web-app-with-preview.json) | Create a sandbox → **write** a server file → start it on port 3000 → return a **preview URL**. Demonstrates exposing a running service for demos. |
| 3 | [`3-clone-build-download.json`](./3-clone-build-download.json) | Persistent sandbox: create → **Git clone** a repo → run a build command → **download** the artifact back into n8n as binary → kill. A CI-style template. |
| 4 | [`4-ai-agent-tool.json`](./4-ai-agent-tool.json) | An **AI Agent with full control of one persistent sandbox** — it's given four E2B tools (`run_command`, `write_file`, `read_file`, `list_files`) and decides which to call. The sandbox is reused across chat runs (tagged with metadata, found via `Get Sandbox → By Metadata` server-side filtering, and paused between runs), so files persist between messages — send the example prompt twice to watch a run counter grow. Needs a chat-model credential (OpenAI in the example) plus E2B. |

## Notes

- Sandbox operations chain by referencing the created sandbox: `={{ $('Create Sandbox').item.json.sandboxId }}`.
- `Run Command` can run standalone: leave **Sandbox ID** empty to spin up a throwaway sandbox for that step, and enable **Kill After Run** to clean it up automatically.
- All examples default to `allowInternetAccess: true` so `pip`/`git`/network calls work; disable it for locked-down runs.
