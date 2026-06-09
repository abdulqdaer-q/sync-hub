# cPanel Deployment Checklist

This is the simple deployment path for this project.

Use this when:

- the frontend will be hosted on `cPanel`
- Supabase is already online
- the worker will run separately on a laptop or VM

## Short answer

No, you do **not** need only an API key from the owner.

At minimum, you need:

- cPanel access or a way to upload files to the website
- the production Supabase project URL
- the production Supabase anon/public key
- access to deploy Supabase Edge Functions and database migrations
- the final website domain

If CV ingestion will use Gemini, you also need:

- a Gemini API key

If you will run the worker yourself, you also need:

- a worker access token for Supabase, or a service-role key for setup only

## What runs where

### cPanel

Only the built frontend files.

### Supabase online

- auth
- database
- storage
- edge functions

### Worker machine

- CV extraction
- embeddings
- syncing CV data into Supabase

Do **not** try to run the worker inside cPanel shared hosting.

## What to ask the owner for

Send this list:

1. Website domain or subdomain for the frontend
2. cPanel login or FTP/SFTP upload access
3. Supabase project URL
4. Supabase anon/public key
5. Supabase project access, or someone who can run migrations and deploy functions
6. Gemini API key if Gemini will be used
7. Confirmation whether original CV files should be stored in Supabase Storage

Optional but useful:

- Supabase service-role key for one-time setup only
- a dedicated worker access token

## What I can do if I have the right access

I can:

- build the frontend
- prepare the production frontend env
- upload the frontend build to cPanel
- apply migrations to Supabase
- deploy Edge Functions
- configure the worker to sync to the online project

I cannot finish production deployment correctly with only:

- a Gemini key
- or only cPanel access
- or only the Supabase URL without keys/access

## Production frontend env

Create production values like this:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_API_BASE_URL=https://YOUR_PROJECT.supabase.co/functions/v1
```

Important:

- never put the Supabase service-role key in the frontend
- never put Gemini or OpenAI secret keys in the frontend

## Deployment steps

### 1. Prepare Supabase production

You need the online Supabase project ready first.

Do this:

1. Apply all SQL migrations in `supabase/migrations/`
2. Deploy these Edge Functions:
   - `search`
   - `compare`
   - `ask`
   - `agent`
3. Set required function secrets
4. Create the `cv-originals` bucket if you want original CV storage
5. In Supabase Auth, set:
   - `Site URL` to the final website URL
   - any redirect URLs you plan to use

### 2. Prepare the frontend build

Use the production env values, then build:

```bash
cd frontend
npm install
npm run build
```

Output will be in:

- `frontend/dist/`

### 3. Upload to cPanel

Upload the contents of `frontend/dist/` to:

- `public_html/` if this is the main domain
- or the correct subfolder if this is a subdomain/addon domain

This app uses a hash router, so no SPA rewrite rules are required.

### 4. Smoke test the live site

After upload, verify:

1. login page loads
2. sign-in works
3. search page loads
4. admin pages load for admin users
5. browser requests go to the real online Supabase URL, not `127.0.0.1`
6. no request goes to `trycloudflare.com`

### 5. Run the worker separately

The worker should point to the online Supabase project, not local Supabase.

Typical production-style worker env:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ACCESS_TOKEN=YOUR_WORKER_ACCESS_TOKEN
SUPABASE_STORAGE_BUCKET=cv-originals

CV_MODEL_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
CV_MODEL_API_KEY=YOUR_GEMINI_API_KEY
CV_EXTRACTION_PROVIDER=openai-compatible
CV_EXTRACTION_MODEL=gemini-2.5-flash
CV_EMBEDDING_PROVIDER=openai
CV_EMBEDDING_MODEL=gemini-embedding-001
CV_EMBEDDING_DIMENSION=768
CV_EMBEDDING_VERSION=gemini-embedding-001-768-v1
CV_WORKER_CACHE_DIR=./tmp/cv_intelligence_worker
CV_DELETE_SYNCED_BUNDLES=true
```

Then run ingestion from the worker machine, not the cPanel server.

## What is missing right now before a real deployment

If your current frontend env still points to local or temporary URLs, that must be replaced before build.

The production deployment is not ready until all of these are true:

- frontend env points to the real online Supabase project
- Supabase migrations are applied online
- Edge Functions are deployed online
- Auth `Site URL` is set correctly
- worker env points to the online Supabase project
- no frontend config references:
  - `127.0.0.1`
  - local tunnels
  - `trycloudflare.com`

## Safest handoff model

If the owner is non-technical, the easiest model is:

1. they give you the required access once
2. you do the initial deployment
3. after that, normal frontend updates are just:
   - rebuild
   - upload new `dist/`

The more sensitive backend items are:

- Supabase keys
- function secrets
- worker credentials

Keep those out of the frontend and out of cPanel public files.
