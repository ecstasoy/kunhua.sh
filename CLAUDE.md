# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

`kunhua.sh` — personal website. `web/` is live and deploys on push. `api/` runs locally — the
service, its database and its health check exist; nothing supervises or deploys it yet. The full
design and its rationale live in
`docs/superpowers/specs/2026-08-29-personal-site-design.md` — read it before proposing changes, since
most structural questions are already decided there (and several tempting options are ruled out on
purpose). Build/test commands are recorded here as they become real; do not assume a listed command
works before verifying it exists.

## Architecture

Two independently-built and independently-deployed halves. Everything runs on a single self-managed VPS.

- `web/` — Next.js App Router, **static export only** (`output: 'export'`). Renders `content/` at build
  time. No Node process runs on the server; the build output is plain files.
- `api/` — Go service. A separate binary and a separate deploy lifecycle, not Next.js route handlers.
  Serves JSON only, never HTML. SQLite, plus in-process scheduled fetchers.
- `content/` — markdown posts. Authored content, not code. `web/` consumes it at build time;
  front-matter is a contract. Album notes are *not* here — they are runtime data, edited in place.
- `infra/` — Caddyfile and host bootstrap. **No Terraform** — one machine does not justify it.
- `deploy/` — systemd units and release scripts.
- `.github/` — two path-filtered pipelines (`web/**`+`content/**`, and `api/**`+`deploy/**`). Path
  filtering is correctness, not optimization: editing a post must not restart the Go service.

Runtime is exactly two processes, both under systemd: Caddy, and the Go service listening on
localhost only. **No containers** — a static Go binary does not need one, and a root-owned daemon
would hand the CI identity the root access the two-identity split exists to deny it. Caddy serves static files and reverse-proxies `/api/*`, so front and back are
same-origin and CORS never enters the picture.

### Load-bearing constraints

These are decisions, not defaults — changing one has consequences documented in the spec:

- **Posts never go in the database.** Only runtime-generated data that the build cannot know does.
  This is why there is no CMS. The one carve-out is album notes — annotations bound to runtime data,
  edited in place through an authenticated endpoint. Posts stay in git with no exception; do not widen
  that carve-out.
- **Static export is what keeps the showcase up** when the Go service is down. Switching `web/` to
  server mode forfeits that isolation.
- **SQLite is a file, not a service.** Chosen to avoid a second daemon on the box. Plain `database/sql`
  and hand-written SQL, no ORM, so a later Postgres move stays contained.
- Secrets live in `/etc/kunhua.sh/api.env` on the host, never in CI — **not** under `/srv/kunhua.sh/`,
  which stays group-writable so `ci` can rename the release symlink, and write permission on a
  directory is permission to delete what is in it. CI holds one credential: the deploy
  SSH key. With no image registry there is no second one to steal.

## Commands

Run from `web/`:

- `npm run dev` — dev server on :3000
- `npm run build` — static export into `web/out/`
- `npm run preview` — serve the exported output, byte-for-byte what gets deployed

Run from `api/`:

- `go test ./...` — the whole suite; a single test is `go test ./internal/store -run TestMigrateIsIdempotent`
- `go build ./cmd/server` — the binary
- `APP_DB=./data/app.db APP_ADDR=127.0.0.1:8080 go run ./cmd/server` — runs it locally. Note
  `go run` does not forward SIGTERM to the child, so use a built binary when testing shutdown.

The gate takes a slice: `./check api`, `./check web`, or `./check` for both. The two halves deploy
independently, so a failing Go test must not block publishing a post; locally you want the lot.

`./check unit` is separate and **not** part of `./check`: it runs `systemd-analyze security` against
`deploy/kunhua-api.service` with a ceiling on the exposure score, so it needs Linux with systemd and
fails outright anywhere else rather than skipping. Run it on the host or let CI run it.

## Deploying

Pushing to `main` deploys — CI builds, rsyncs to `releases/<sha>/` on the host, and swaps the
`current` symlink. Nothing is done by hand.

Rolling back is `ssh deploy@<host> 'bash /srv/kunhua.sh/release.sh <sha>'` — a symlink swap, no
rebuild. The five most recent releases are kept.

Three identities on the host: `deploy` is the human admin (has sudo), `ci` is what GitHub Actions
uses and deliberately has none, and `kunhua-api` only runs the service — no shell, not in the `web`
group, so it can neither publish nor escalate. Publishing needs no root.

The one exception is restarting: `ci` may run `systemctl restart kunhua-api.service` and nothing
else, through a sudoers rule naming that unit literally.

**Changing `deploy/kunhua-api.service` does not deploy it.** Installing a unit needs root, and a unit
`ci` could write is a unit that runs anything as root. `api-release.sh` ships the file and compares
it with the host's, failing the deploy when they differ; installing it is `sudo bash ~/bootstrap.sh`
as `deploy`.

## Agent skills

### Issue tracker

GitHub Issues via the `gh` CLI — note the remote does not exist yet. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, unrenamed (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and one `docs/adr/` at the root. See `docs/agents/domain.md`.
