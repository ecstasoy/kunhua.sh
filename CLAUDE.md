# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

`kunhua.sh` — personal website. **Design is settled; no implementation exists yet.** The directories
below are empty. The full design and its rationale live in
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
- `deploy/` — `docker-compose.yml` and release scripts.
- `.github/` — two path-filtered pipelines (`web/**`+`content/**`, and `api/**`+`deploy/**`). Path
  filtering is correctness, not optimization: editing a post must not restart the Go service.

Runtime is exactly two processes: Caddy (host, systemd) and the Go service (Docker, listening on
localhost only). Caddy serves static files and reverse-proxies `/api/*`, so front and back are
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
- Secrets live in `/srv/kunhua.sh/.env` on the host, never in CI. CI holds only the deploy SSH key and
  a GHCR token.

## Commands

None yet — nothing is scaffolded. Once each half exists, record here:

- `web/`: dev server, build, lint, and the single-test invocation for whichever runner is chosen.
- `api/`: `go build ./...`, `go test ./...`, single test via `go test ./path -run TestName`.
