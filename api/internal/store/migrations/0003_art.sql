-- Covers are stored on disk by content hash and mapped back from the upstream
-- URL, so a track that has not changed costs no download. The mapping is a
-- table rather than a column because the album wall will look up the same way,
-- for fifteen albums at once.
CREATE TABLE art (
    url        TEXT PRIMARY KEY,
    hash       TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);

ALTER TABLE now_playing ADD COLUMN art_hash TEXT;
