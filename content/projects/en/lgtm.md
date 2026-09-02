---
name: LGTM
summary: An assistant that reviews GitHub pull requests, live. It reads CI status and the repository's own convention docs, not just the diff. Repo-level RAG is achieved.
---

- **Building the context**: handing a model only the diff produces comments detached from the project, so a review starts by pulling the PR's metadata, its CI status, and the repository's own convention documents
- **A three-stage pipeline**: one long response is hard to act on or reuse, so the review is split into a change summary, a risk list, and fix suggestions. Each stage can use a different model and be retried on its own; the output is structured rather than prose, with suggestions anchored to specific file lines
- **Streaming the result**: a full review takes long enough that waiting on a blank page is unpleasant, so a self-built ***SSE*** protocol streams the summary as it is written and replaces the risks and suggestions when their stages finish
- **GitHub App integration**: ***OAuth*** for sign-in, a webhook that reviews new pull requests and pushes automatically, and the results written back as inline suggestions
- **Caching and idempotency**: re-triggering the same PR would otherwise mean paying for the same model calls, so results are persisted in ***SQLite*** or ***Postgres*** behind a ***Redis*** cache, and webhook deliveries are made idempotent
- **Internationalization**: the interface language and the language the model writes in have to agree, so one self-built locale layer drives both. PR comments stay in English regardless, so a repository's maintainers only ever read one language
- **Deployment**: the frontend on ***Vercel***, the ***Go*** backend containerized on ***Fly.io***, persistence switchable between ***SQLite*** and ***Postgres***. 
