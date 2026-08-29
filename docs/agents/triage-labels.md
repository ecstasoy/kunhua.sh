# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Notes for this repo

Defaults are used unchanged — this is a new repo with no pre-existing label vocabulary to map onto, so
renaming would only add a layer to remember. GitHub ships `wontfix` by default; the other four do not yet
exist in the tracker and must be created on first use (`gh label create <name>`).

`ready-for-agent` is expected to be the common path rather than the exception, given how the project is
scheduled. An issue only earns the label if an agent could pick it up with **no** human context — that bar
is what makes the label worth having.
