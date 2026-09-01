package store

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Why Snapshot exists, demonstrated rather than asserted from the manual: a
// plain file copy of app.db, taken while the process is running, does not
// contain what has been committed.
func TestAPlainFileCopyLosesCommittedData(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "live.db")

	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.Migrate(); err != nil {
		t.Fatal(err)
	}

	ctx := context.Background()
	for i := 0; i < 20; i++ {
		if err := db.SaveNote(ctx, "Artist", string(rune('A'+i)), "a note", time.Now()); err != nil {
			t.Fatal(err)
		}
	}

	copyTo := func(name string) string {
		dest := filepath.Join(dir, name)
		in, err := os.Open(path)
		if err != nil {
			t.Fatal(err)
		}
		defer in.Close()
		out, err := os.Create(dest)
		if err != nil {
			t.Fatal(err)
		}
		defer out.Close()
		if _, err := io.Copy(out, in); err != nil {
			t.Fatal(err)
		}
		return dest
	}

	countIn := func(dest string) int {
		opened, err := Open(dest)
		if err != nil {
			t.Logf("%s will not open: %v", filepath.Base(dest), err)
			return -1
		}
		defer opened.Close()
		notes, err := opened.Notes(ctx)
		if err != nil {
			t.Logf("%s will not read: %v", filepath.Base(dest), err)
			return -1
		}
		return len(notes)
	}

	copied := countIn(copyTo("copied.db"))

	snap := filepath.Join(dir, "snap.db")
	if err := db.Snapshot(ctx, snap); err != nil {
		t.Fatal(err)
	}
	snapped := countIn(snap)

	t.Logf("a plain copy holds %d of 20 notes; the snapshot holds %d", copied, snapped)

	if snapped != 20 {
		t.Errorf("the snapshot holds %d notes, want 20", snapped)
	}
	if copied == 20 {
		t.Log("the copy happened to be complete here; it is not guaranteed to be, " +
			"which is the whole reason the snapshot goes through the database")
	}
}
