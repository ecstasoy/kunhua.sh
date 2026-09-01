package store

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// Snapshot writes a consistent copy of the database to path.
//
// Through the database, not the filesystem. Under WAL a copy of app.db alone
// is missing everything still in the write-ahead log — on this machine that
// log has been thirty times the size of the database — and a copy of all three
// files taken while a write is in flight can be torn.
//
// VACUUM INTO takes its own read transaction, so the result is one file that
// is internally consistent and needs no -wal or -shm beside it.
func (db *DB) Snapshot(ctx context.Context, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}
	// VACUUM INTO refuses to overwrite, which is the behaviour we want for the
	// destination but not for a leftover from a failed run.
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}

	// Written through the write pool: it is the single connection, so the
	// snapshot cannot interleave with a fetcher's write.
	if _, err := db.W.ExecContext(ctx, `VACUUM INTO ?`, path); err != nil {
		return fmt.Errorf("snapshot to %s: %w", path, err)
	}
	return nil
}
