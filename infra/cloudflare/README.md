# Cloudflare Tunnel

This repo uses `sync-dev` as the fixed local tunnel name for development sharing.

What this means:

- tunnel name: `sync-dev`
- frontend target: `http://127.0.0.1:5173`
- backend target: `http://127.0.0.1:54321`

## Why this exists

Quick tunnels on `trycloudflare.com` are temporary and get a new hostname every time.

If you want stable URLs that can be resumed later, create a named tunnel with the fixed name
`sync-dev`.

## One-time setup

1. Authenticate Cloudflare locally:

```bash
cloudflared tunnel login
```

2. Create the named tunnel:

```bash
cloudflared tunnel create sync-dev
```

3. Copy [sync-dev.example.yml](./sync-dev.example.yml) to a real local config file and replace:

- `REPLACE_WITH_TUNNEL_ID`
- `REPLACE_WITH_CREDENTIALS_FILE`
- `app.example.com`
- `api.example.com`

4. Route DNS records to the tunnel:

```bash
cloudflared tunnel route dns sync-dev app.example.com
cloudflared tunnel route dns sync-dev api.example.com
```

5. Run the tunnel:

```bash
cloudflared tunnel --config infra/cloudflare/sync-dev.yml run
```

Or from the frontend package:

```bash
cd frontend
npm run tunnel:sync-dev
```

If your tunnel is managed by a Cloudflare-issued run token instead of a local config file:

```bash
cd frontend
CLOUDFLARED_TOKEN=YOUR_TUNNEL_TOKEN npm run tunnel:sync-dev:token
```

## Notes

- The tunnel name is fixed as `sync-dev`, but the config uses the Cloudflare tunnel UUID after
  creation.
- `api.example.com` points at the local Supabase gateway on `54321`, so function URLs stay under
  `/functions/v1/...`.
- Without a Cloudflare-managed domain, you can only use temporary quick tunnels.
