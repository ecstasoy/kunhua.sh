package store

import (
	"context"
	"strings"
	"time"
)

// MaxNoteLength bounds what one note can hold.
const MaxNoteLength = 2000

// SaveNote writes a note, or removes it when the text is empty.
//
// Empty deletes rather than storing a blank row: an emptied note and one never
// written should look the same to every reader, including the owner's own
// "still to write" marker.
func (db *DB) SaveNote(ctx context.Context, artist, album, note string, at time.Time) error {
	note = strings.TrimSpace(note)
	if note == "" {
		_, err := db.W.ExecContext(ctx,
			`DELETE FROM album_notes WHERE artist = ? AND album = ?`, artist, album)
		return err
	}

	_, err := db.W.ExecContext(ctx, `
		INSERT INTO album_notes (artist, album, note, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(artist, album) DO UPDATE SET
			note = excluded.note,
			updated_at = excluded.updated_at`,
		artist, album, note, at.UTC().Format(time.RFC3339),
	)
	return err
}

// Notes returns every note, keyed by artist and album joined by a null byte —
// a separator that cannot occur in either field.
func (db *DB) Notes(ctx context.Context) (map[string]string, error) {
	rows, err := db.R.QueryContext(ctx, `SELECT artist, album, note FROM album_notes`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]string{}
	for rows.Next() {
		var artist, album, note string
		if err := rows.Scan(&artist, &album, &note); err != nil {
			return nil, err
		}
		out[NoteKey(artist, album)] = note
	}
	return out, rows.Err()
}

// NoteKey is the map key for one album, shared so the reader and the writer
// cannot disagree about it.
func NoteKey(artist, album string) string {
	return artist + "\x00" + album
}
