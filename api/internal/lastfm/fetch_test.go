package lastfm

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"kunhua.sh/api/internal/art"
	"kunhua.sh/api/internal/job"
	"kunhua.sh/api/internal/store"
)

func arts(t *testing.T) art.Store {
	t.Helper()
	return art.Store{Dir: filepath.Join(t.TempDir(), "art")}
}

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

	j := c.Job(db, arts(t))
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
	runOnceThrough(t, ctx, db, log, working.Job(db, arts(t)))

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
	bj := broken.Job(db, arts(t))
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
//
// Cancellation waits on the job signalling that it ran, not on a sleep: a
// sleep long enough on this machine is not long enough on a slower one.
func runOnceThrough(t *testing.T, ctx context.Context, db *store.DB, log *slog.Logger, j job.Job) {
	t.Helper()
	j.Every = time.Hour // only the run at startup

	ran := make(chan struct{})
	inner := j.Run
	j.Run = func(c context.Context) error {
		err := inner(c)
		close(ran)
		return err
	}

	c, cancel := context.WithCancel(ctx)
	wait := job.Start(c, db, log, j)

	select {
	case <-ran:
	case <-time.After(10 * time.Second):
		cancel()
		wait()
		t.Fatal("the job never ran")
	}
	cancel()
	wait()
}

// The cover pipeline end to end: parsed from the response, downloaded once,
// stored by content hash, and reused on the next run without a second request.
func TestCoverIsDownloadedOnceAndStoredLocally(t *testing.T) {
	db := testDB(t)
	arts := arts(t)
	var imageRequests int

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/cover") {
			imageRequests++
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte("jpeg bytes"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"recenttracks":{"track":[
		  {"name":"Song","artist":{"#text":"Artist"},"album":{"#text":"Album"},
		   "@attr":{"nowplaying":"true"},
		   "image":[{"#text":"%s/cover-small","size":"small"},
		            {"#text":"%s/cover-xl","size":"extralarge"}]}
		]}}`, "http://"+r.Host, "http://"+r.Host)
	}))
	t.Cleanup(srv.Close)

	c := New("k", "u")
	c.BaseURL = srv.URL + "/"

	for i := 0; i < 3; i++ {
		if err := c.Job(db, arts).Run(context.Background()); err != nil {
			t.Fatalf("run %d: %v", i, err)
		}
	}

	if imageRequests != 1 {
		t.Errorf("downloaded the cover %d times, want 1", imageRequests)
	}

	current, found, err := db.Current(context.Background())
	if err != nil || !found {
		t.Fatalf("Current: %v found=%v", err, found)
	}
	if !art.IsHash(current.Track.ArtHash) {
		t.Fatalf("art hash = %q", current.Track.ArtHash)
	}

	path, err := arts.Path(current.Track.ArtHash)
	if err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("cover not on disk: %v", err)
	}
	if string(b) != "jpeg bytes" {
		t.Errorf("stored %q", b)
	}
}

// Last.fm serves a placeholder star for albums with no cover.
func TestThePlaceholderCoverIsNotStored(t *testing.T) {
	db := testDB(t)
	arts := arts(t)

	c := fake(t, serve(`{"recenttracks":{"track":[
	  {"name":"Song","artist":{"#text":"Artist"},"date":{"uts":"1756600000"},
	   "image":[{"#text":"https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png","size":"extralarge"}]}
	]}}`))

	if err := c.Job(db, arts).Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	current, found, err := db.Current(context.Background())
	if err != nil || !found {
		t.Fatal(err)
	}
	if current.Track.ArtHash != "" {
		t.Errorf("art hash = %q, want none for the placeholder", current.Track.ArtHash)
	}
}

// A cover that will not download must not fail the fetch: the track still
// shows, with the fallback block, and the next run tries again.
func TestAFailedCoverDownloadIsNotAFailedFetch(t *testing.T) {
	db := testDB(t)
	arts := arts(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/cover") {
			http.Error(w, "gone", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"recenttracks":{"track":[
		  {"name":"Song","artist":{"#text":"Artist"},"date":{"uts":"1756600000"},
		   "image":[{"#text":"%s","size":"extralarge"}]}
		]}}`, "http://"+r.Host+"/cover")
	}))
	t.Cleanup(srv.Close)

	c := New("k", "u")
	c.BaseURL = srv.URL + "/"

	if err := c.Job(db, arts).Run(context.Background()); err != nil {
		t.Fatalf("the fetch failed because of a cover: %v", err)
	}
	current, found, err := db.Current(context.Background())
	if err != nil || !found {
		t.Fatal("the track was not stored")
	}
	if current.Track.ArtHash != "" {
		t.Errorf("art hash = %q, want none", current.Track.ArtHash)
	}
}
