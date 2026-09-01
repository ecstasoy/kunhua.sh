package store

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// Snapshot writes a consistent SQLite snapshot to path using VACUUM INTO.
func (db *DB) Snapshot(ctx context.Context, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}

	// VACUUM INTO does not overwrite, so remove any stale output first.
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}

	// Run through the single write connection to avoid interleaving with writes.
	if _, err := db.W.ExecContext(ctx, `VACUUM INTO ?`, path); err != nil {
		return fmt.Errorf("snapshot to %s: %w", path, err)
	}
	return nil
}
