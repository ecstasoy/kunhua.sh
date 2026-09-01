package store

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// The property that matters: a snapshot is one self-contained file holding
// everything committed, including what is still only in the write-ahead log.
func TestSnapshotHoldsWritesStillInTheLog(t *testing.T) {
	db := migrated(t)
	ctx := context.Background()

	if err := db.SaveNote(ctx, "Belle and Sebastian", "Tigermilk", "the one before", time.Now()); err != nil {
		t.Fatal(err)
	}

	// No checkpoint, no close: the note is committed but very likely still in
	// the -wal file. Copying app.db here would lose it.
	dest := filepath.Join(t.TempDir(), "snap.db")
	if err := db.Snapshot(ctx, dest); err != nil {
		t.Fatalf("Snapshot: %v", err)
	}

	// Opened as its own database, with no -wal or -shm beside it.
	if _, err := os.Stat(dest + "-wal"); !os.IsNotExist(err) {
		t.Error("the snapshot left a write-ahead log beside it")
	}

	restored, err := Open(dest)
	if err != nil {
		t.Fatalf("the snapshot will not open: %v", err)
	}
	defer restored.Close()

	notes, err := restored.Notes(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := notes[NoteKey("Belle and Sebastian", "Tigermilk")]; got != "the one before" {
		t.Errorf("the snapshot is missing the note: %q", got)
	}
}

func TestSnapshotOverwritesAFailedRunsLeftovers(t *testing.T) {
	db := migrated(t)
	dest := filepath.Join(t.TempDir(), "snap.db")

	// VACUUM INTO refuses an existing file, so a crashed run would otherwise
	// block every run after it.
	if err := os.WriteFile(dest, []byte("half a snapshot"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := db.Snapshot(context.Background(), dest); err != nil {
		t.Fatalf("Snapshot over a leftover: %v", err)
	}

	restored, err := Open(dest)
	if err != nil {
		t.Fatalf("the snapshot will not open: %v", err)
	}
	restored.Close()
}

func TestSnapshotCreatesItsDirectory(t *testing.T) {
	db := migrated(t)
	dest := filepath.Join(t.TempDir(), "does", "not", "exist", "snap.db")
	if err := db.Snapshot(context.Background(), dest); err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if _, err := os.Stat(dest); err != nil {
		t.Error(err)
	}
}
