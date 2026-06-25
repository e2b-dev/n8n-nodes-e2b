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

## Development

```bash
pnpm test
pnpm typecheck
pnpm build
```

The package follows the standard n8n community node layout and uses `@n8n/node-cli` for build, lint, dev, and release commands.
