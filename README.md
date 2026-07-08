# @e2b/n8n-nodes-e2b

n8n community node for E2B sandboxes.

Use this package to create and manage E2B sandboxes, snapshots, files, git repositories, and volumes, and run shell commands in an E2B sandbox from n8n workflows.

## Install

In n8n, open **Settings > Community nodes**, then install:

```text
@e2b/n8n-nodes-e2b
```

For local development:

```bash
pnpm install
pnpm build
```

## Credentials

Create an **E2B API** credential and set your E2B API key.

Optional advanced fields are available for custom E2B deployments:

- API URL
- Domain
- Sandbox URL

## Node resources and operations

The E2B node uses n8n's resource and operation layout:

- Code: Run Command
- File: Create Folder, Delete, Download, Get Info, List, Move, Read, Upload, Write
- Git: Add, Checkout, Clone, Commit, Pull, Push, Status
- Sandbox: Create, Get, Get Many, Get Preview URL, Pause, Kill
- Snapshot: Create, Get Many, Delete
- Volume: Create, Get, Get Many, Delete

## Examples

Importable example workflows live in [`docs/examples/`](./docs/examples):

Ordered simplest → most advanced (Level 1–4):

- **Level 1** — [`1-run-command-ephemeral.json`](./docs/examples/1-run-command-ephemeral.json) — run a command in a one-shot ephemeral sandbox (the simplest flow).
- **Level 2** — [`2-web-app-with-preview.json`](./docs/examples/2-web-app-with-preview.json) — write and start a web server, return a preview URL.
- **Level 3** — [`3-clone-build-download.json`](./docs/examples/3-clone-build-download.json) — clone a repo, run a build, download the artifact back into n8n.
- **Level 4** — [`4-ai-agent-tool.json`](./docs/examples/4-ai-agent-tool.json) — an AI Agent that runs code in E2B as a tool.

In n8n: **Workflows → Import from File**, select a JSON, then set your **E2B API** credential. See [`docs/examples/README.md`](./docs/examples/README.md) for details.

## Development

```bash
pnpm test
pnpm typecheck
pnpm build
```

The package follows the standard n8n community node layout and uses `@n8n/node-cli` for build, lint, dev, and release commands.
