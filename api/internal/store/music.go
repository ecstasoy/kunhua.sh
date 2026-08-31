package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Track represents one play. Album and URL may be empty.
type Track struct {
	Artist string
	Title  string
	Album  string
	URL    string
	// Zero means "currently playing" (not finished yet).
	PlayedAt time.Time
}

// Current is the latest known track plus playback state.
type Current struct {
	Track     Track
	Playing   bool
	UpdatedAt time.Time
}

// SaveScrobbles stores finished plays and ignores duplicates.
func (db *DB) SaveScrobbles(ctx context.Context, tracks []Track) error {
	if len(tracks) == 0 {
		return nil
	}

	tx, err := db.W.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT OR IGNORE INTO scrobbles (played_at, artist, title, album, url)
		VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, t := range tracks {
		if t.PlayedAt.IsZero() {
			continue // still playing; not history yet
		}
		if _, err := stmt.ExecContext(
			ctx,
			t.PlayedAt.Unix(),
			t.Artist,
			t.Title,
			nullable(t.Album),
			nullable(t.URL),
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// SaveCurrent upserts the single now-playing row.
func (db *DB) SaveCurrent(ctx context.Context, t Track, playing bool, at time.Time) error {
	_, err := db.W.ExecContext(ctx, `
		INSERT INTO now_playing (id, artist, title, album, url, playing, updated_at)
		VALUES (1, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			artist = excluded.artist,
			title = excluded.title,
			album = excluded.album,
			url = excluded.url,
			playing = excluded.playing,
			updated_at = excluded.updated_at`,
		t.Artist,
		t.Title,
		nullable(t.Album),
		nullable(t.URL),
		boolToInt(playing),
		at.UTC().Format(time.RFC3339),
	)
	return err
}

// Current returns (value, found, error). found=false is normal when no row exists.
func (db *DB) Current(ctx context.Context) (Current, bool, error) {
	var c Current
	var album, url sql.NullString
	var playing int
	var updated string

	err := db.R.QueryRowContext(ctx, `
		SELECT artist, title, COALESCE(album, ''), COALESCE(url, ''), playing, updated_at
		FROM now_playing WHERE id = 1`).
		Scan(&c.Track.Artist, &c.Track.Title, &album, &url, &playing, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return Current{}, false, nil
	}
	if err != nil {
		return Current{}, false, err
	}

	c.Track.Album = album.String
	c.Track.URL = url.String
	c.Playing = playing == 1

	c.UpdatedAt, err = time.Parse(time.RFC3339, updated)
	if err != nil {
		return Current{}, false, err
	}

	return c, true, nil
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
