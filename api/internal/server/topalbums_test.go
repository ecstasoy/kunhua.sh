package server

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"kunhua.sh/api/internal/lastfm"
	"kunhua.sh/api/internal/store"
)

func TestTopAlbumsReturnsEveryPeriodInOneAnswer(t *testing.T) {
	now := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	db, h := dbAndServer(t, now)
	ctx := context.Background()

	// Choosing a span on the page must not become a request to Last.fm, which
	// is only possible if one answer carries them all.
	for _, p := range []string{"7day", "overall"} {
		err := db.ReplaceTopAlbums(ctx, p, []store.Album{
			{Rank: 1, Artist: "A", Album: p + " one", Playcount: 42, ArtHash: "ab"},
			{Rank: 2, Artist: "B", Album: p + " two", Playcount: 7},
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if err := db.RecordJobRun(ctx, lastfm.TopJobName, now, now, nil); err != nil {
		t.Fatal(err)
	}

	got := getJSON(t, h, "/api/top-albums")

	order, ok := got["order"].([]any)
	if !ok || len(order) != len(lastfm.Periods) {
		t.Fatalf("order = %#v, want the %d periods", got["order"], len(lastfm.Periods))
	}
	if order[0] != lastfm.Periods[0] {
		t.Errorf("order[0] = %v, want %q", order[0], lastfm.Periods[0])
	}

	periods, ok := got["periods"].(map[string]any)
	if !ok {
		t.Fatalf("periods = %#v", got["periods"])
	}
	for _, p := range []string{"7day", "overall"} {
		list, ok := periods[p].([]any)
		if !ok || len(list) != 2 {
			t.Fatalf("periods[%q] = %#v", p, periods[p])
		}
		first := list[0].(map[string]any)
		if first["album"] != p+" one" {
			t.Errorf("periods[%q][0].album = %v", p, first["album"])
		}
		if first["plays"] != float64(42) {
			t.Errorf("plays = %#v, want 42", first["plays"])
		}
		if first["art"] != "/api/art/ab" {
			t.Errorf("art = %#v, want a path on this site", first["art"])
		}
		// A cover-less album says so rather than pointing at nothing.
		if second := list[1].(map[string]any); second["art"] != nil {
			t.Errorf("art = %#v, want null", second["art"])
		}
	}

	if got["fetched_at"] != "2026-08-31T12:00:00Z" {
		t.Errorf("fetched_at = %#v", got["fetched_at"])
	}
}

func TestTopAlbumsIsEmptyBeforeTheFirstFetch(t *testing.T) {
	_, h := dbAndServer(t, time.Now())
	got := getJSON(t, h, "/api/top-albums")

	periods, ok := got["periods"].(map[string]any)
	if !ok || len(periods) != 0 {
		t.Errorf("periods = %#v, want an empty object", got["periods"])
	}
	if got["fetched_at"] != nil {
		t.Errorf("fetched_at = %#v, want null", got["fetched_at"])
	}
	// The order is still offered, so the page knows what could exist.
	if order, ok := got["order"].([]any); !ok || len(order) == 0 {
		t.Errorf("order = %#v", got["order"])
	}
}

// The same distinction now-playing makes: a chart that stopped updating must
// be able to say when it last did.
func TestTopAlbumsFetchedAtSurvivesAFailedRun(t *testing.T) {
	now := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	db, h := dbAndServer(t, now)
	ctx := context.Background()
	succeeded := now.Add(-30 * time.Hour)

	if err := db.RecordJobRun(ctx, lastfm.TopJobName, succeeded, succeeded, nil); err != nil {
		t.Fatal(err)
	}
	if err := db.RecordJobRun(ctx, lastfm.TopJobName, now, now, errors.New("rate limited")); err != nil {
		t.Fatal(err)
	}

	got := getJSON(t, h, "/api/top-albums")
	if got["fetched_at"] != "2026-08-30T06:00:00Z" {
		t.Errorf("fetched_at = %#v, want the last success", got["fetched_at"])
	}
}

func TestTopAlbumsIsNotCacheable(t *testing.T) {
	_, h := dbAndServer(t, time.Now())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/top-albums", nil))
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
}
