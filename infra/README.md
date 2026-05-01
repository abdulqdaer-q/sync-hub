# Infrastructure Notes

This folder documents the infrastructure patterns around the project.

## What is actually used locally right now

The current local stack is a mix of:

- `Supabase CLI` for the local backend stack
- `Docker` for Supabase-managed local containers
- `supabase functions serve --no-verify-jwt` for Edge Functions
- `ollama serve` for local LLM / embeddings
- `npm run dev` for the frontend

Important point:

- the local Supabase containers are **not** managed by a repo-owned `docker-compose.yml`
- they are created and managed by the `supabase start` workflow

That is why this repo did not previously contain “the Docker files” for the local Supabase stack.

## Files in this folder

- `docker-compose.ollama.yml`
  - optional containerized Ollama runtime if you want Ollama in Docker instead of running it natively
- `docker-compose.selfhost-gcp.example.yml`
  - reference-only starter file for evaluating self-hosted Supabase on GCP
  - not intended as a drop-in production deployment without hardening
- `.env.selfhost.example`
  - placeholder environment values for the self-hosting example
- `cloudflare/sync-dev.example.yml`
  - named Cloudflare Tunnel template for exposing the local frontend and Supabase gateway
- `cloudflare/README.md`
  - setup notes for the `sync-dev` tunnel name used in local sharing

## Recommended local workflow

### Supabase local backend

Use the CLI:

```bash
supabase start
supabase status
supabase functions serve --no-verify-jwt
```

### Frontend

```bash
cd frontend
npm run dev --host 0.0.0.0 --port 5175
```

### Cloudflare local sharing

If you want stable public URLs instead of temporary `trycloudflare.com` links, use the named
Cloudflare tunnel scaffold under `infra/cloudflare/`.

This repo standardizes on:

- tunnel name: `sync-dev`
- frontend origin: `http://127.0.0.1:5173`
- backend origin: `http://127.0.0.1:54321`

The named tunnel still requires:

- a Cloudflare account
- a domain managed in Cloudflare
- one-time `cloudflared tunnel login`

### Ollama

Preferred local path:

```bash
ollama serve
```

Optional Docker path:

```bash
docker compose -f infra/docker-compose.ollama.yml up -d
```

## Port reference

Local endpoints currently used by the project:

- `http://127.0.0.1:54321` -> Supabase API gateway
- `postgresql://postgres:postgres@127.0.0.1:54322/postgres` -> Postgres
- `http://127.0.0.1:54323` -> Supabase Studio
- `http://127.0.0.1:54324` -> Mailpit
- `http://127.0.0.1:11434` -> Ollama
- `http://localhost:5175` -> frontend dev server

## Self-hosting note

If the NGO later decides to self-host Supabase on GCP, use:

- the official Supabase self-hosting guidance as the source of truth
- `docker-compose.selfhost-gcp.example.yml` only as a starting reference

Do not treat the example compose file in this folder as a final production deployment by itself.
