package store

import (
	"embed"
	"fmt"
	"sort"
	"strings"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// Migrate applies all embedded .sql files not yet recorded in schema_migrations.
// Embedding keeps code and schema together in one binary.
func (db *DB) Migrate() error {
	if _, err := db.W.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT PRIMARY KEY,
			applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	applied, err := db.appliedVersions()
	if err != nil {
		return err
	}

	names, err := migrationNames()
	if err != nil {
		return err
	}

	for _, name := range names {
		version := strings.TrimSuffix(name, ".sql")
		if applied[version] {
			continue
		}

		body, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}

		if err := db.applyOne(version, string(body)); err != nil {
			return fmt.Errorf("migration %s: %w", version, err)
		}
	}

	return nil
}

// Files are sorted lexically; numeric prefixes (0001_, 0002_, ...) define order.
func migrationNames() ([]string, error) {
	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		return nil, err
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		names = append(names, e.Name())
	}

	sort.Strings(names)
	return names, nil
}

func (db *DB) appliedVersions() (map[string]bool, error) {
	rows, err := db.R.Query(`SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, fmt.Errorf("read schema_migrations: %w", err)
	}
	defer rows.Close()

	applied := map[string]bool{}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		applied[v] = true
	}

	return applied, rows.Err()
}

// applyOne executes and records one migration in the same transaction.
func (db *DB) applyOne(version, body string) error {
	tx, err := db.W.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(body); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO schema_migrations (version) VALUES (?)`, version); err != nil {
		return err
	}

	return tx.Commit()
}
