# Mahigo Group Platform

A Node.js server version of the Mahigo Group admin console. Unlike the standalone HTML prototype, this version persists records and files on the server, uses a signed HTTP-only administrator session cookie, serves MahigoWebs websites by hostname, converts Scratch `.sb3` files into standalone playable HTML using TurboWarp Packager, and exposes Mahigo Kusum JSON endpoints.

## Requirements

- Node.js 20 or newer
- A server with persistent disk storage
- Control of `mahigo.com` DNS for public website hosting
- Wildcard DNS + TLS support for the site and game hostnames

## Run locally

```bash
cp .env.example .env
npm install
npm start
```

Open `http://localhost:3000`. The example `.env` uses development mode and non-secure cookies so localhost login works over HTTP.

Default admin account from `.env.example`:

- Username: `admin`
- Password: `mahir7532`

Before public deployment, change `ADMIN_PASSWORD`, set `COOKIE_SECURE=true`, and set a unique random `SESSION_SECRET`. Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Never commit `.env` or the `data/` folder to source control. The admin API checks the request Origin on every state-changing request; keep the reverse proxy's original Host and HTTPS scheme headers intact. Docker Compose uses production mode; enable HTTPS at your reverse proxy and set `COOKIE_SECURE=true` in `.env` before public exposure.

The server stores workspace data in `data/store.json` and Scratch source + playable output in `data/games/`. Keep that directory on a persistent volume when deploying.

## What gets hosted

- **MahigoWebs:** Saves each site's HTML and serves it by hostname as `slug.mahigo.com`. If custom HTML is blank, the server creates a basic landing page from the name and description.
- **MahigoGames:** Saves the original `.sb3`, packages it to a standalone playable HTML file, and serves it at `slug.games.mahigo.com`.
- **Mahigo Kusum API:** Registers public GET/POST routes on `api.mahigo.com` using the imported JSON database or a custom JSON response. POST adds the submitted JSON object to the top-level array or to an object's `records` array.
- **Headquarters settings:** Persists in the server JSON store.

Public APIs return their configured JSON data without authentication. Only import data that is intended to be public. Add authentication/permissions before exposing private records. GET endpoints return the imported JSON as-is; POST endpoints append submitted JSON records to the root array or an object's `records` array.

## DNS and HTTPS configuration

After deploying to a server with a stable public IP / hostname, configure DNS at the provider for the `mahigo.com` zone. Typical records are:

| Type | Name | Target |
|---|---|---|
| A or CNAME | `@` | Your platform's target |
| CNAME or A | `admin` | Your platform's target |
| CNAME or A | `api` | Your platform's target |
| A or CNAME | `*` | Your platform's target |
| A or CNAME | `*.games` | Your platform's target |

The exact targets depend on your hosting provider. Configure HTTPS certificates for `admin.mahigo.com`, `api.mahigo.com`, `*.mahigo.com`, and `*.games.mahigo.com`. A certificate for `*.mahigo.com` does not automatically cover `*.games.mahigo.com`.

If your provider cannot route nested wildcard hosts, configure its custom-domain routing for `*.games.mahigo.com` separately.

### About `.mahigo.gms`

The UI originally used names like `game.mahigo.gms`. The public DNS root database currently has no `.gms` TLD entry, so that name cannot resolve through the normal public DNS root. This build uses `game-name.games.mahigo.com` instead. Check the IANA Root Zone Database before choosing an alternative suffix: https://www.iana.org/domains/root/db

## Local hostname testing

You can test website routing before DNS is changed by sending a Host header:

```bash
curl -H 'Host: demo.mahigo.com' http://localhost:3000/
curl -H 'Host: demo.games.mahigo.com' http://localhost:3000/
curl -H 'Host: api.mahigo.com' http://localhost:3000/v1/example
```

The corresponding records must first exist in the admin console for these routes to return content.

## Deployment notes

1. Deploy this folder to a Node.js host with Node 20+, or run it with Docker Compose.
2. Copy `.env.example` to `.env`, then replace the example password and session secret with private values.
3. Mount persistent storage at `DATA_DIR` (`/var/lib/mahigo` in Docker). Without a persistent volume, data can be lost on redeploy/restart depending on the host.
4. Point the DNS names above to the deployed app and enable HTTPS.
5. Open `https://admin.mahigo.com` and sign in.

TurboWarp Packager's Node API is beta and its maintainers recommend pinning an exact package version. This project pins `@turbowarp/packager` to `3.14.0`; test project packaging after any upgrade. It may fetch its runtime assets during the first package operation, so the server needs outbound internet access for that first conversion.
