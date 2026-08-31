package lastfm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// A stand-in for Last.fm. Every test here is about what happens when the real
// one misbehaves, because that is the part this package exists for — the happy
// path is a few lines of field copying.
func fake(t *testing.T, h http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	c := New("test-key", "test-user")
	c.BaseURL = srv.URL + "/"
	return c
}

func serve(body string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}
}

const twoTracks = `{"recenttracks":{"track":[
  {"name":"Song A","url":"https://last.fm/a","artist":{"#text":"Artist A"},
   "album":{"#text":"Album A"},"@attr":{"nowplaying":"true"}},
  {"name":"Song B","url":"https://last.fm/b","artist":{"#text":"Artist B"},
   "album":{"#text":"Album B"},"date":{"uts":"1756600000"}}
]}}`

func TestParsesTracksAndTheNowPlayingFlag(t *testing.T) {
	c := fake(t, serve(twoTracks))

	tracks, playing, err := c.RecentTracks(context.Background(), 10)
	if err != nil {
		t.Fatalf("RecentTracks: %v", err)
	}
	if len(tracks) != 2 {
		t.Fatalf("got %d tracks, want 2", len(tracks))
	}
	if !playing {
		t.Error("playing = false; the first track carries nowplaying")
	}

	// What is playing has no time: it has not finished, so it is not history.
	if !tracks[0].PlayedAt.IsZero() {
		t.Errorf("the playing track has PlayedAt = %v, want zero", tracks[0].PlayedAt)
	}
	if tracks[0].Artist != "Artist A" || tracks[0].Title != "Song A" {
		t.Errorf("track[0] = %+v", tracks[0])
	}
	if tracks[0].Album != "Album A" || tracks[0].URL != "https://last.fm/a" {
		t.Errorf("track[0] lost album or url: %+v", tracks[0])
	}
	if got := tracks[1].PlayedAt.Unix(); got != 1756600000 {
		t.Errorf("track[1].PlayedAt = %d, want 1756600000", got)
	}
}

func TestSendsTheCredentialsAndTheUser(t *testing.T) {
	var got string
	c := fake(t, func(w http.ResponseWriter, r *http.Request) {
		got = r.URL.RawQuery
		serve(twoTracks)(w, r)
	})
	if _, _, err := c.RecentTracks(context.Background(), 7); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"api_key=test-key", "user=test-user", "limit=7", "format=json"} {
		if !strings.Contains(got, want) {
			t.Errorf("query %q is missing %q", got, want)
		}
	}
}

// Last.fm reports its own failures with HTTP 200 and an error in the body. A
// wrong username would otherwise decode to zero tracks and read as "not
// listening to anything" — a silence indistinguishable from the truth.
func TestTreatsAnErrorBodyAsAnError(t *testing.T) {
	c := fake(t, serve(`{"error":6,"message":"User not found"}`))

	_, _, err := c.RecentTracks(context.Background(), 10)
	if err == nil {
		t.Fatal("expected an error for an error body served with 200")
	}
	if !strings.Contains(err.Error(), "User not found") {
		t.Errorf("error = %v, want it to carry the upstream message", err)
	}
}

func TestFailsOnAnErrorStatus(t *testing.T) {
	c := fake(t, func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "upstream is unwell", http.StatusInternalServerError)
	})
	if _, _, err := c.RecentTracks(context.Background(), 10); err == nil {
		t.Fatal("expected an error for HTTP 500")
	}
}

func TestFailsOnMalformedJSON(t *testing.T) {
	c := fake(t, serve(`{"recenttracks": {"track": [ this is not json`))
	if _, _, err := c.RecentTracks(context.Background(), 10); err == nil {
		t.Fatal("expected an error for a truncated body")
	}
}

func TestGivesUpWhenTheUpstreamHangs(t *testing.T) {
	// The failure that matters most: not an error, but an answer that never
	// comes. Without the context bound this would block the fetcher forever.
	c := fake(t, func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	})

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	start := time.Now()
	if _, _, err := c.RecentTracks(ctx, 10); err == nil {
		t.Fatal("expected an error when the upstream never answers")
	}
	if took := time.Since(start); took > 5*time.Second {
		t.Errorf("took %v; the context deadline was not honoured", took)
	}
}

func TestSkipsTracksWithNothingToShow(t *testing.T) {
	c := fake(t, serve(`{"recenttracks":{"track":[
	  {"name":"","artist":{"#text":"Nobody"}},
	  {"name":"Real","artist":{"#text":"Someone"},"date":{"uts":"1756600000"}}
	]}}`))

	tracks, _, err := c.RecentTracks(context.Background(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(tracks) != 1 || tracks[0].Title != "Real" {
		t.Errorf("got %+v, want only the track with an artist and a title", tracks)
	}
}

func TestEmptyHistoryIsNotAnError(t *testing.T) {
	// An account that has never played anything is a legitimate answer, and
	// must not be recorded as a failed fetch.
	c := fake(t, serve(`{"recenttracks":{"track":[]}}`))

	tracks, playing, err := c.RecentTracks(context.Background(), 10)
	if err != nil {
		t.Fatalf("RecentTracks: %v", err)
	}
	if len(tracks) != 0 || playing {
		t.Errorf("got %d tracks, playing=%v; want nothing", len(tracks), playing)
	}
}
