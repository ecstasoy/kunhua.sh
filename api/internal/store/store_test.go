package store

import (
	"database/sql"
	"path/filepath"
	"testing"
)

// Tests run against a real SQLite file rather than a mock. It costs
// milliseconds, and in exchange every test also proves the SQL dialect is
// right and the migrations actually execute — which is most of what could be
// wrong here, and exactly what a mock would hide.
func open(t *testing.T) *DB {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func pragma(t *testing.T, pool *sql.DB, name string) string {
	t.Helper()
	var v string
	if err := pool.QueryRow("PRAGMA " + name).Scan(&v); err != nil {
		t.Fatalf("PRAGMA %s: %v", name, err)
	}
	return v
}

func TestOpenAppliesPragmas(t *testing.T) {
	db := open(t)

	// Both pools: these are per-connection settings, and a DSN spelled the
	// mattn way would be ignored silently rather than reported.
	for name, pool := range map[string]*sql.DB{"read": db.R, "write": db.W} {
		if got := pragma(t, pool, "foreign_keys"); got != "1" {
			t.Errorf("%s pool: foreign_keys = %q, want 1", name, got)
		}
		if got := pragma(t, pool, "journal_mode"); got != "wal" {
			t.Errorf("%s pool: journal_mode = %q, want wal", name, got)
		}
		if got := pragma(t, pool, "busy_timeout"); got != "5000" {
			t.Errorf("%s pool: busy_timeout = %q, want 5000", name, got)
		}
	}
}

func TestWritePoolIsSerialised(t *testing.T) {
	db := open(t)
	// One connection is what makes concurrent writes queue inside Go rather
	// than come back as SQLITE_BUSY.
	if got := db.W.Stats().MaxOpenConnections; got != 1 {
		t.Errorf("write pool MaxOpenConnections = %d, want 1", got)
	}
}

func TestMigrateIsIdempotent(t *testing.T) {
	db := open(t)

	if err := db.Migrate(); err != nil {
		t.Fatalf("first Migrate: %v", err)
	}
	// Running twice is the normal case — every restart re-runs this.
	if err := db.Migrate(); err != nil {
		t.Fatalf("second Migrate: %v", err)
	}

	var n int
	if err := db.R.QueryRow(`SELECT count(*) FROM schema_migrations`).Scan(&n); err != nil {
		t.Fatalf("count migrations: %v", err)
	}
	names, err := migrationNames()
	if err != nil {
		t.Fatal(err)
	}
	if n != len(names) {
		t.Errorf("recorded %d migrations, embedded %d", n, len(names))
	}
	if n == 0 {
		t.Error("no migrations were embedded; the //go:embed pattern matched nothing")
	}
}

func TestJobRunsIsUsable(t *testing.T) {
	db := open(t)
	if err := db.Migrate(); err != nil {
		t.Fatal(err)
	}

	if _, err := db.W.Exec(
		`INSERT INTO job_runs (name, started_at, ok) VALUES ('scrobble', datetime('now'), 1)`,
	); err != nil {
		t.Fatalf("insert: %v", err)
	}

	var ok int
	if err := db.R.QueryRow(`SELECT ok FROM job_runs WHERE name = 'scrobble'`).Scan(&ok); err != nil {
		t.Fatalf("select: %v", err)
	}
	if ok != 1 {
		t.Errorf("ok = %d, want 1", ok)
	}
}
