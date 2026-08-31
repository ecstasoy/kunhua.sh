-- Listening history, one row per play. played_at is Last.fm's own timestamp in
-- unix seconds, which makes it a natural key: re-fetching the same window is
-- an INSERT OR IGNORE rather than a diff.
CREATE TABLE scrobbles (
    played_at INTEGER PRIMARY KEY,
    artist    TEXT NOT NULL,
    title     TEXT NOT NULL,
    album     TEXT,
    url       TEXT
);

-- What is playing right now, which has no timestamp of its own — Last.fm
-- reports it as a track with no date. A single row, enforced by the CHECK, so
-- writing it is an upsert and reading it needs no ordering.
--
-- Separate from scrobbles because it is not history: a track that is playing
-- may never finish, and would then never be a scrobble at all.
CREATE TABLE now_playing (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    artist     TEXT NOT NULL,
    title      TEXT NOT NULL,
    album      TEXT,
    url        TEXT,
    playing    INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

-- When a job last *succeeded*, which is not the same as when it last ran. A
-- fetcher whose token expired runs every minute and fails every minute; the
-- page needs the last time it worked, or it would keep showing last week's
-- song with nothing to say the song is old.
ALTER TABLE job_runs ADD COLUMN last_ok_at TEXT;
