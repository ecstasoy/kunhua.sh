-- Notes on albums. Keyed by artist and album rather than by chart position, so
-- a note survives the album moving or leaving the chart.
--
-- The first thing in this database that cannot be fetched again.
CREATE TABLE album_notes (
    artist     TEXT NOT NULL,
    album      TEXT NOT NULL,
    note       TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (artist, album)
);

-- Sessions are rows rather than signed cookies so that signing out, and
-- revoking everything after a mistake, are both possible.
CREATE TABLE sessions (
    id         TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
