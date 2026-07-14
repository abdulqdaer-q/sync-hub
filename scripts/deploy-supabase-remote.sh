#!/usr/bin/env bash
# Deploy linked Supabase migrations and all edge functions (CI / operators).
#
# Required env:
#   SUPABASE_ACCESS_TOKEN
#   SUPABASE_PROJECT_REF
# Optional:
#   SUPABASE_DB_PASSWORD  (required by some projects for db push)
#
# Usage:
#   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... ./scripts/deploy-supabase-remote.sh

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "SUPABASE_ACCESS_TOKEN is required" >&2
  exit 1
fi

if [ -z "${SUPABASE_PROJECT_REF:-}" ]; then
  echo "SUPABASE_PROJECT_REF is required" >&2
  exit 1
fi

export SUPABASE_ACCESS_TOKEN

echo "→ Linking project ${SUPABASE_PROJECT_REF}"
supabase link --project-ref "${SUPABASE_PROJECT_REF}" --yes

echo "→ Applying database migrations (supabase db push)"
if [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then
  supabase db push --password "${SUPABASE_DB_PASSWORD}"
else
  supabase db push
fi

echo "→ Deploying edge functions"
mapfile -t functions < <(node scripts/list-supabase-edge-functions.mjs)
if [ "${#functions[@]}" -eq 0 ]; then
  echo "No edge functions found under supabase/functions/" >&2
  exit 1
fi

for fn in "${functions[@]}"; do
  echo "  • ${fn}"
  supabase functions deploy "${fn}"
done

echo "Done. Deployed ${#functions[@]} edge function(s)."
