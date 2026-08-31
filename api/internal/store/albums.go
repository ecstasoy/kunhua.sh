package store

import (
	"context"
)

// Album is one entry in a period's chart.
type Album struct {
	Rank      int
	Artist    string
	Album     string
	URL       string
	Playcount int
	// ArtURL is the upstream cover address; carried, never stored.
	ArtURL  string
	ArtHash string
}

// ReplaceTopAlbums swaps one period's chart in a single transaction.
//
// Delete-then-insert, so an album that has fallen off the chart leaves. A
// failed refetch never reaches here, which is what keeps the previous chart on
// the page rather than emptying it.
func (db *DB) ReplaceTopAlbums(ctx context.Context, period string, albums []Album) error {
	tx, err := db.W.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM top_albums WHERE period = ?`, period); err != nil {
		return err
	}

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO top_albums (period, rank, artist, album, url, playcount, art_hash)
		VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, a := range albums {
		if _, err := stmt.ExecContext(ctx, period, a.Rank, a.Artist, a.Album,
			nullable(a.URL), a.Playcount, nullable(a.ArtHash)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// TopAlbums returns every stored period, keyed by period name.
func (db *DB) TopAlbums(ctx context.Context) (map[string][]Album, error) {
	rows, err := db.R.QueryContext(ctx, `
		SELECT period, rank, artist, album, COALESCE(url, ''), playcount, COALESCE(art_hash, '')
		FROM top_albums ORDER BY period, rank`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string][]Album{}
	for rows.Next() {
		var period string
		var a Album
		if err := rows.Scan(&period, &a.Rank, &a.Artist, &a.Album, &a.URL, &a.Playcount, &a.ArtHash); err != nil {
			return nil, err
		}
		out[period] = append(out[period], a)
	}
	return out, rows.Err()
}

// ArtHashes returns the stored hash for each of the given upstream URLs.
//
// One query rather than one per album: a daily run looks up a hundred covers,
// almost all of which it already has.
func (db *DB) ArtHashes(ctx context.Context, urls []string) (map[string]string, error) {
	out := map[string]string{}
	if len(urls) == 0 {
		return out, nil
	}

	// Built rather than fixed, since the count varies; the values stay bound.
	query := `SELECT url, hash FROM art WHERE url IN (?`
	args := make([]any, 0, len(urls))
	args = append(args, urls[0])
	for _, u := range urls[1:] {
		query += ",?"
		args = append(args, u)
	}
	query += ")"

	rows, err := db.R.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var url, hash string
		if err := rows.Scan(&url, &hash); err != nil {
			return nil, err
		}
		out[url] = hash
	}
	return out, rows.Err()
}
