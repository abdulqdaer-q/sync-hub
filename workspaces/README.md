# Workspace CV Folders

This folder is the repo-safe place for tenant/workspace CV inputs.

## Rules

- Create one subfolder per tenant slug.
- Put real CV files inside `workspaces/<tenant-slug>/`.
- Git ignores the actual CV files under these folders.
- Keep only `.gitkeep` placeholders in the repo.

## Current tenant folders

- `workspaces/demo/`
- `workspaces/beta/`

## Recommended worker usage

```bash
PYTHONPATH=worker/src python3 -m cv_intelligence_worker ingest \
  "./workspaces/<tenant-slug>" \
  --tenant-id <tenant-id>
```

## Demo workspace seed

The local `demo` workspace is intended to hold the 10 sample CVs used for local testing.

If you already have the sample files in `./cvs`, seed the workspace folder like this:

```bash
cp -f ./cvs/*.pdf ./workspaces/demo/
```

Then ingest them into the local `demo` tenant:

```bash
PYTHONPATH=worker/src python3 -m cv_intelligence_worker ingest \
  "./workspaces/demo" \
  --tenant-id 00000000-0000-0000-0000-000000000000
```

The PDF files inside `workspaces/demo/` stay ignored by git.

## Google Drive

If you use Google Drive Desktop, mirror the same tenant slug structure under:

```text
<drive-sync-path>/CV Intelligence/<tenant-slug>/
```

The tenant admin utility can create both the local repo-safe folders and the synced Drive folders for you.
