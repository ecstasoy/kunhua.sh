---
title: "An attempt: building a personal site from zero, the AI-native way"
excerpt: 'A\ I am keeping you on a very short leash 🥵'
---
I had put off building a personal site for a long time. Not really for the shopfront — what I feel short of is experience in a real environment, and building a place that can put me through it is the most direct way to get some. The problem is that I am not a planner, so once the skeleton was in place I started arguing with A\.

## Planning with skills

| Skills | What to do | Output |
| --- | --- | --- |
| /init | Analyse the repository and generate CLAUDE.md. At this point it is an empty repo, so writing it by hand would do; an existing codebase is where it earns its place | CLAUDE.md |
| superpowers:brainstorming | I state what I want, A\ starts interrogating the idea and forces me to think about the shape of the whole project | docs/superpowers/specs |
| /grill-me | Another pass over the spec | edits made straight back into the spec |
| /to-spec | Publish the earlier thinking as an issue, in the form of user stories | issue #1 |
| /to-tickets | Cut the project into seven independently deliverable stages, each of which breaks down into issues | the remaining issues |

I do not actually think superpowers is necessary — it burns a lot of tokens. I used it not because I was short of ideas but because I had too many, scattered, and needed something to put them in order.

## Stack

### Server

- **Vultr, Tokyo**: somewhere the routes from both hemispheres can meet
- **Debian 13**: I like it
- **Caddy 2.11.4**: mostly for obtaining and renewing certificates on its own
- **ufw + unattended-upgrades**, and two Linux identities: `deploy` has sudo and administers the machine, `ci` has none and only publishes

### Frontend

- **Next.js 16.3.3**, static export via `output: 'export'`
- **React 19.2 / TypeScript 7**
- **unified**: gray-matter + remark-parse / remark-gfm / remark-rehype / rehype-stringify
- **Plain CSS + IBM Plex / Noto Serif / Sans SC**

### Backend

Planned rather than built:

- **Go**: I really do like Go. Later on it can run some actual services
- **SQLite** + modernc.org/sqlite: a pure Go driver
- **log/slog**: structured logging
- **systemd**: a static binary, no containers
- **Last.fm API + asciinema**: planned
- and more: there is a lot I want to build…

### CI/CD

- **GitHub Actions**, filtered by path
- **rsync over SSH**, into `releases/<sha>/`
- **node --test + linkinator**, wrapped in a `check` script
