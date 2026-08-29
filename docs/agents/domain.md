# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **single-context** repo: one `CONTEXT.md` at the root, one `docs/adr/`.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/adr/`** — read ADRs that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating
them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually
get resolved.

## File structure

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-static-export-keeps-the-showcase-up.md
│   └── 0002-sqlite-is-a-file-not-a-service.md
├── web/          ← Next.js, static export
├── api/          ← Go service
└── content/      ← markdown posts
```

## Why single-context, not multi

`web/` and `api/` are different languages with different pipelines, which makes them look like separate
contexts. They aren't. The split is a **technical layer boundary, not a domain boundary** — both halves
name the same concepts (post, album note, cast, release, job run) with the same meaning.

This matters beyond tidiness. The known structural risk in this architecture is **contract drift**: the two
halves build and deploy separately, so a field renamed on one side fails silently on the other. Drift starts
as the two sides diverging on what a thing is called and means. A single shared glossary works against
that; splitting it into two would institutionalise the divergence.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name),
use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the
project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

## Current state

Neither `CONTEXT.md` nor any ADR exists yet, and that is deliberate — `web/` and `api/` are still empty, so
a glossary written now would describe intentions rather than code. Write them once there is real code to
name. The design decisions that would become the first ADRs are already argued in
`docs/superpowers/specs/2026-08-29-personal-site-design.md` (local only, not tracked).
