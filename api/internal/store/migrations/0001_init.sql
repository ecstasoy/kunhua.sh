-- One row per job, keyed by name: the row is the job's most recent run, not a
-- history. Nothing yet needs the history, and a table that only ever holds a
-- handful of rows never needs pruning.
CREATE TABLE job_runs (
    name        TEXT PRIMARY KEY,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    ok          INTEGER NOT NULL DEFAULT 0,
    error       TEXT
);
