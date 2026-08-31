package lastfm

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"kunhua.sh/api/internal/job"
	"kunhua.sh/api/internal/store"
)

func testDB(t *testing.T) *store.DB {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatal(err)
	}
	return db
}

// The whole chain with only the upstream faked: fetch, store, and the record
// of whether it worked. The pieces are tested separately; this is here because
// they are wired together in main, where nothing tests them.
func TestFetchStoresTracksAndRecordsTheRun(t *testing.T) {
	db := testDB(t)
	c := fake(t, serve(twoTracks))

	j := c.Job(db)
	if j.Name != JobName {
		t.Errorf("job name = %q, want %q", j.Name, JobName)
	}
	if err := j.Run(context.Background()); err != nil {
		t.Fatalf("job: %v", err)
	}

	current, found, err := db.Current(context.Background())
	if err != nil || !found {
		t.Fatalf("Current: %v found=%v", err, found)
	}
	// The newest entry, which in this fixture is the one playing now.
	if current.Track.Title != "Song A" || !current.Playing {
		t.Errorf("current = %+v playing=%v", current.Track, current.Playing)
	}

	// Only the finished play becomes history.
	var n int
	if err := db.R.QueryRow(`SELECT count(*) FROM scrobbles`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("stored %d scrobbles, want 1", n)
	}
}

// What the page reads when the key expires: the track stays, and the last
// success stops moving. Nothing crashes and nothing is logged as fatal, which
// is exactly why the timestamp has to be visible.
func TestAFailingFetchLeavesTheTrackAndStopsTheClock(t *testing.T) {
	db := testDB(t)
	log := slog.New(slog.NewJSONHandler(io.Discard, nil))
	ctx := context.Background()

	working := fake(t, serve(twoTracks))
	runOnceThrough(t, ctx, db, log, working.Job(db))

	before, _, err := db.LastJobRun(ctx, JobName)
	if err != nil {
		t.Fatal(err)
	}
	if before.LastOKAt.IsZero() {
		t.Fatal("no last_ok_at after a successful fetch")
	}

	broken := fake(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"error":10,"message":"Invalid API key"}`))
	})
	bj := broken.Job(db)
	bj.Attempts = 1
	runOnceThrough(t, ctx, db, log, bj)

	after, _, err := db.LastJobRun(ctx, JobName)
	if err != nil {
		t.Fatal(err)
	}
	if after.OK {
		t.Error("ok = true after an invalid key")
	}
	if !after.LastOKAt.Equal(before.LastOKAt) {
		t.Errorf("last_ok_at moved to %v on a failed run", after.LastOKAt)
	}

	if _, found, _ := db.Current(ctx); !found {
		t.Error("the track was dropped; the page shows it as old rather than not at all")
	}
}

// Through job.Start rather than by calling Run directly, so the recording path
// is the one production uses.
func runOnceThrough(t *testing.T, ctx context.Context, db *store.DB, log *slog.Logger, j job.Job) {
	t.Helper()
	j.Every = time.Hour // only the run at startup
	c, cancel := context.WithCancel(ctx)
	wait := job.Start(c, db, log, j)
	// The startup run is synchronous inside the goroutine; cancelling stops
	// the ticker without interrupting it.
	time.Sleep(50 * time.Millisecond)
	cancel()
	wait()
}
