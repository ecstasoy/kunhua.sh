// Package store owns SQLite setup: pools, pragmas, and migrations.
package store

import (
	"database/sql"
	"errors"
	"fmt"

	_ "modernc.org/sqlite"
)

// DB exposes separate read/write pools for one SQLite file.
// The write pool is capped at one connection to serialize writes.
type DB struct {
	R *sql.DB
	W *sql.DB
}

// For modernc.org/sqlite, pragmas must use _pragma=name(value).
// foreign_keys is per-connection, so it must be in the shared DSN.
const pragmas = "_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(on)"

func Open(path string) (*DB, error) {
	dsn := fmt.Sprintf("file:%s?%s", path, pragmas)

	r, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open read pool: %w", err)
	}

	w, err := sql.Open("sqlite", dsn)
	if err != nil {
		r.Close()
		return nil, fmt.Errorf("open write pool: %w", err)
	}
	w.SetMaxOpenConns(1)

	db := &DB{R: r, W: w}

	// sql.Open is lazy; ping now so path/permission errors fail at startup.
	if err := w.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping %s: %w", path, err)
	}

	return db, nil
}

func (db *DB) Close() error {
	return errors.Join(db.R.Close(), db.W.Close())
}
