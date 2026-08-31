package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// CreateSession stores a session id with an expiry.
func (db *DB) CreateSession(ctx context.Context, id string, now time.Time, ttl time.Duration) error {
	_, err := db.W.ExecContext(ctx, `
		INSERT INTO sessions (id, created_at, expires_at) VALUES (?, ?, ?)`,
		id,
		now.UTC().Format(time.RFC3339),
		now.Add(ttl).UTC().Format(time.RFC3339),
	)
	return err
}

// SessionValid reports whether a session exists and has not expired.
//
// Expiry is compared in SQL against a passed-in time rather than datetime('now')
// so the caller's clock is the only one involved, and tests need not sleep.
func (db *DB) SessionValid(ctx context.Context, id string, now time.Time) (bool, error) {
	if id == "" {
		return false, nil
	}
	var found string
	err := db.R.QueryRowContext(ctx,
		`SELECT id FROM sessions WHERE id = ? AND expires_at > ?`,
		id, now.UTC().Format(time.RFC3339),
	).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// DeleteSession ends one session.
func (db *DB) DeleteSession(ctx context.Context, id string) error {
	_, err := db.W.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, id)
	return err
}

// DeleteExpiredSessions clears rows that can no longer authenticate anything.
func (db *DB) DeleteExpiredSessions(ctx context.Context, now time.Time) error {
	_, err := db.W.ExecContext(ctx,
		`DELETE FROM sessions WHERE expires_at <= ?`, now.UTC().Format(time.RFC3339))
	return err
}
