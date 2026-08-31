-- Most-played albums per period. Every period is stored, so the visitor's
-- choice of span never becomes a request to Last.fm.
CREATE TABLE top_albums (
    period    TEXT NOT NULL,
    rank      INTEGER NOT NULL,
    artist    TEXT NOT NULL,
    album     TEXT NOT NULL,
    url       TEXT,
    playcount INTEGER NOT NULL DEFAULT 0,
    art_hash  TEXT,
    PRIMARY KEY (period, rank)
);
