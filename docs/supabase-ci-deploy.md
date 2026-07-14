# Supabase CI deploy and access control

Production database migrations and edge functions deploy **only through GitHub Actions** on merge to `main`. Developers work against **staging** Supabase on the `dev` branch.

Related: GitHub issue #58.

## Deploy matrix

| Environment | Git branch | Workflow | Secrets |
|-------------|------------|----------|---------|
| Staging | `dev` | `deploy-supabase-staging.yml` | `STG_SUPABASE_*` |
| Production | `main` | `deploy-supabase-production.yml` | `SUPABASE_*` (GHA only) |

Deploy order (per [release-process.md](release-process.md)):

1. Supabase (`db push` + `functions deploy`)
2. Frontend (cPanel)
3. Worker (separate operator process)

## One-time: GitHub Actions production token

1. In [Supabase Dashboard](https://supabase.com/dashboard/account/tokens), create an access token named e.g. `github-actions-production`.
2. Store it only in GitHub:
   - **Settings → Environments → production → Secrets**
   - Or repository secrets if you do not use environments yet
3. Add secrets:

| Secret | Value |
|--------|--------|
| `SUPABASE_ACCESS_TOKEN` | Token from step 1 |
| `SUPABASE_PROJECT_REF` | Production project ref (subdomain id, e.g. `clijfubyeaklfxtbnzdi`) |
| `SUPABASE_DB_PASSWORD` | Database password if `db push` prompts for it |

4. Enable **environment protection** on `production` (required reviewers) so only leads can approve production Supabase deploys.

## One-time: staging Supabase (dev branch)

| Secret | Value |
|--------|--------|
| `STG_SUPABASE_ACCESS_TOKEN` | Staging-only personal access token |
| `STG_SUPABASE_PROJECT_REF` | Staging project ref |
| `STG_SUPABASE_DB_PASSWORD` | Optional |

Developers may keep **staging** tokens on laptops for local `supabase link` to the staging project.

## Revoke production write access from developers (#58)

Goal: **no human has write/deploy access to production**; only GitHub Actions.

### Supabase organization / project

1. **Organization → Team members**
   - Developers: access to **staging** project only (Developer role).
   - Production project: no access, or **Read-only** if dashboards are needed.
2. **Account → Access Tokens**
   - Revoke old personal tokens that could reach production.
   - Keep one token for GHA (`SUPABASE_ACCESS_TOKEN` in GitHub only).
3. **Never share** `service_role` or production DB password in chat, `.env` commits, or laptops.

### What developers still do

| Action | Where |
|--------|--------|
| Write migrations / functions | Git PR → `dev` → staging auto-deploy |
| Test against staging DB | Staging project + `STG_*` local env |
| Ship to production | PR `dev` → `main`; GHA deploys Supabase + frontend |

### What developers must not do

- `supabase link` to the **production** project ref on a laptop
- Store `SUPABASE_ACCESS_TOKEN` (production) locally
- Run `supabase db push` or `functions deploy` against production manually

## Manual operator deploy (break-glass)

If GHA is unavailable:

```bash
export SUPABASE_ACCESS_TOKEN=...   # production token — operators only
export SUPABASE_PROJECT_REF=...
export SUPABASE_DB_PASSWORD=...    # if required
bash scripts/deploy-supabase-remote.sh
```

Log the break-glass use and rotate the token afterward.

## Workflows

- **Staging**: push to `dev` when `supabase/` changes → `deploy-supabase-staging.yml`
- **Production**: push to `main` when `supabase/` changes → `deploy-supabase-production.yml`
- Both support **workflow_dispatch** for manual runs.

## Function secrets (LLM keys, etc.)

Edge Function **runtime secrets** (e.g. `GEMINI_API_KEY`) stay in the Supabase dashboard for each project. CI deploys **code only**; it does not overwrite dashboard secrets unless you add explicit `supabase secrets set` steps later.

## Smoke test after deploy

1. Supabase Dashboard → Database → Migrations: latest files applied.
2. Edge Functions → all functions show recent deploy time.
3. Staging: https://dev-jobs.sync.ngo — search / auth against staging URL.
4. Production: https://jobs.sync.ngo — after `main` deploy only.

## Related

- [staging-environment.md](staging-environment.md)
- [DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md)
- [release-process.md](release-process.md)
