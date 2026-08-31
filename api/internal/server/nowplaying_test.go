package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"kunhua.sh/api/internal/lastfm"
	"kunhua.sh/api/internal/store"
)

func dbAndServer(t *testing.T, now time.Time) (*store.DB, http.Handler) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewJSONHandler(io.Discard, nil))
	return db, New(db, log, Config{Now: fixed(now)})
}

func getJSON(t *testing.T, h http.Handler, path string) map[string]any {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("%s = %d, want 200", path, rec.Code)
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v (body %q)", err, rec.Body.String())
	}
	return got
}

// Asserted as decoded JSON rather than through the response struct, which
// would keep passing after a field was renamed on both the struct and its tag.
// The page reads these strings.
func TestNowPlayingFieldNamesAndTypes(t *testing.T) {
	now := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	fetched := time.Date(2026, 8, 31, 11, 59, 0, 0, time.UTC)
	db, h := dbAndServer(t, now)

	track := store.Track{Artist: "Artist", Title: "Title", Album: "Album", URL: "https://example.test/t"}
	if err := db.SaveCurrent(context.Background(), track, true, fetched); err != nil {
		t.Fatal(err)
	}
	if err := db.RecordJobRun(context.Background(), lastfm.JobName, fetched, fetched, nil); err != nil {
		t.Fatal(err)
	}

	got := getJSON(t, h, "/api/now-playing")

	if len(got) != 4 {
		t.Errorf("fields = %v, want exactly track, playing, fetched_at, generated_at", keys(got))
	}
	if got["playing"] != true {
		t.Errorf("playing = %#v, want true", got["playing"])
	}
	if got["fetched_at"] != "2026-08-31T11:59:00Z" {
		t.Errorf("fetched_at = %#v", got["fetched_at"])
	}
	if got["generated_at"] != "2026-08-31T12:00:00Z" {
		t.Errorf("generated_at = %#v", got["generated_at"])
	}

	tr, ok := got["track"].(map[string]any)
	if !ok {
		t.Fatalf("track = %#v, want an object", got["track"])
	}
	for k, want := range map[string]any{
		"artist": "Artist", "title": "Title", "album": "Album", "url": "https://example.test/t",
	} {
		if tr[k] != want {
			t.Errorf("track.%s = %#v, want %#v", k, tr[k], want)
		}
	}
}

func TestNowPlayingIsEmptyBeforeAnythingIsFetched(t *testing.T) {
	// A fresh machine, and a machine whose API key was never set. Neither is
	// an error, and the page has a state for it.
	_, h := dbAndServer(t, time.Now())
	got := getJSON(t, h, "/api/now-playing")

	if got["track"] != nil {
		t.Errorf("track = %#v, want null", got["track"])
	}
	if got["fetched_at"] != nil {
		t.Errorf("fetched_at = %#v, want null", got["fetched_at"])
	}
	if _, present := got["generated_at"]; !present {
		t.Error("generated_at is missing")
	}
}

// The failure this ticket is actually about: not a crash, but silence. The
// track stays, and fetched_at stops advancing, which is what lets the page say
// the track is old instead of presenting it as current.
func TestFetchedAtKeepsTheLastSuccessAfterFailures(t *testing.T) {
	now := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	succeeded := now.Add(-3 * time.Hour)
	db, h := dbAndServer(t, now)

	ctx := context.Background()
	track := store.Track{Artist: "A", Title: "T"}
	if err := db.SaveCurrent(ctx, track, false, succeeded); err != nil {
		t.Fatal(err)
	}
	if err := db.RecordJobRun(ctx, lastfm.JobName, succeeded, succeeded, nil); err != nil {
		t.Fatal(err)
	}
	// Three hours of failing every minute, the last of them a moment ago.
	if err := db.RecordJobRun(ctx, lastfm.JobName, now, now, errors.New("token expired")); err != nil {
		t.Fatal(err)
	}

	got := getJSON(t, h, "/api/now-playing")
	if got["fetched_at"] != "2026-08-31T09:00:00Z" {
		t.Errorf("fetched_at = %#v, want the last success and not the last run", got["fetched_at"])
	}
	if got["track"] == nil {
		t.Error("track was dropped; the page shows it as old rather than not at all")
	}
}

func TestNowPlayingIsNotCacheable(t *testing.T) {
	_, h := dbAndServer(t, time.Now())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/now-playing", nil))
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
}
