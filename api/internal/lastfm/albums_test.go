package lastfm

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func chart(names ...string) string {
	var b strings.Builder
	b.WriteString(`{"topalbums":{"album":[`)
	for i, n := range names {
		if i > 0 {
			b.WriteString(",")
		}
		fmt.Fprintf(&b, `{"name":%q,"playcount":"%d","url":"https://last.fm/%s",
		  "artist":{"name":"Artist %d"},
		  "image":[{"#text":"COVER/%s","size":"extralarge"}]}`, n, 100-i, n, i, n)
	}
	b.WriteString(`]}}`)
	return b.String()
}

func TestTopAlbumsRanksByPosition(t *testing.T) {
	c := fake(t, serve(chart("First", "Second", "Third")))

	albums, err := c.TopAlbums(context.Background(), "7day", 25)
	if err != nil {
		t.Fatalf("TopAlbums: %v", err)
	}
	if len(albums) != 3 {
		t.Fatalf("got %d albums, want 3", len(albums))
	}
	for i, want := range []string{"First", "Second", "Third"} {
		if albums[i].Album != want {
			t.Errorf("albums[%d] = %q, want %q", i, albums[i].Album, want)
		}
		if albums[i].Rank != i+1 {
			t.Errorf("albums[%d].Rank = %d, want %d", i, albums[i].Rank, i+1)
		}
	}
	if albums[0].Playcount != 100 {
		t.Errorf("playcount = %d, want 100", albums[0].Playcount)
	}
}

func TestTopAlbumsSendsThePeriodAndLimit(t *testing.T) {
	var query string
	c := fake(t, func(w http.ResponseWriter, r *http.Request) {
		query = r.URL.RawQuery
		serve(chart("One"))(w, r)
	})
	if _, err := c.TopAlbums(context.Background(), "12month", 25); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"period=12month", "limit=25", "method=user.gettopalbums"} {
		if !strings.Contains(query, want) {
			t.Errorf("query %q is missing %q", query, want)
		}
	}
}

func TestTopAlbumsTreatsAnErrorBodyAsAnError(t *testing.T) {
	c := fake(t, serve(`{"error":6,"message":"User not found"}`))
	if _, err := c.TopAlbums(context.Background(), "7day", 25); err == nil {
		t.Fatal("expected an error for an error body served with 200")
	}
}

// Every period is fetched in one run so that choosing a span on the page is
// never a request to Last.fm.
func TestTheDailyJobFetchesEveryPeriod(t *testing.T) {
	db := testDB(t)
	seen := map[string]int{}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/cover") {
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("cover " + r.URL.Path))
			return
		}
		period := r.URL.Query().Get("period")
		seen[period]++
		w.Header().Set("Content-Type", "application/json")
		body := strings.ReplaceAll(chart(period+"-A", period+"-B"), "COVER", "http://"+r.Host+"/cover")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)

	c := New("k", "u")
	c.BaseURL = srv.URL + "/"

	if err := c.TopJob(db, arts(t)).Run(context.Background()); err != nil {
		t.Fatalf("TopJob: %v", err)
	}

	for _, p := range Periods {
		if seen[p] != 1 {
			t.Errorf("period %q fetched %d times, want 1", p, seen[p])
		}
	}

	stored, err := db.TopAlbums(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(stored) != len(Periods) {
		t.Errorf("stored %d periods, want %d", len(stored), len(Periods))
	}
	for _, p := range Periods {
		if len(stored[p]) != 2 {
			t.Errorf("period %q has %d albums", p, len(stored[p]))
		}
		if stored[p][0].ArtHash == "" {
			t.Errorf("period %q lost its cover", p)
		}
	}
}

// A period that fails must not discard the ones that worked, and must still
// report the run as failed.
func TestOnePeriodFailingLeavesTheOthers(t *testing.T) {
	db := testDB(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/cover") {
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("c"))
			return
		}
		// The *first* period fails. Choosing the last one would let an
		// implementation that aborts on the first error still pass, because
		// everything before it was already stored.
		if r.URL.Query().Get("period") == Periods[0] {
			http.Error(w, "nope", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		body := strings.ReplaceAll(chart("A", "B"), "COVER", "http://"+r.Host+"/cover")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)

	c := New("k", "u")
	c.BaseURL = srv.URL + "/"

	err := c.TopJob(db, arts(t)).Run(context.Background())
	if err == nil {
		t.Fatal("the run reported success despite a period failing")
	}

	stored, dbErr := db.TopAlbums(context.Background())
	if dbErr != nil {
		t.Fatal(dbErr)
	}
	for _, p := range Periods[1:] {
		if len(stored[p]) != 2 {
			t.Errorf("%s has %d albums; a failure in an earlier period discarded it", p, len(stored[p]))
		}
	}
	if len(stored[Periods[0]]) != 0 {
		t.Errorf("%s stored %d albums from a failed fetch", Periods[0], len(stored[Periods[0]]))
	}
}

// Albums repeat across periods, so the same cover is offered many times.
func TestACoverSharedByPeriodsIsDownloadedOnce(t *testing.T) {
	db := testDB(t)
	downloads := 0

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/cover") {
			downloads++
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("one cover"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		// The same album in every period.
		body := strings.ReplaceAll(chart("Same"), "COVER", "http://"+r.Host+"/cover")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)

	c := New("k", "u")
	c.BaseURL = srv.URL + "/"

	if err := c.TopJob(db, arts(t)).Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if downloads != 1 {
		t.Errorf("downloaded %d times across %d periods, want 1", downloads, len(Periods))
	}
}
