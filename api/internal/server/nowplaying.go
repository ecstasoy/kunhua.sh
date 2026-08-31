package server

import (
	"net/http"
	"time"

	"kunhua.sh/api/internal/lastfm"
	"kunhua.sh/api/internal/store"
)

type trackJSON struct {
	Artist string `json:"artist"`
	Title  string `json:"title"`
	Album  string `json:"album"`
	URL    string `json:"url"`
}

// nowPlayingResponse is the contract the colophon reads. web/lib/nowPlaying.ts
// declares the same shape, and a test compares the two files.
type nowPlayingResponse struct {
	// Null before anything has ever been fetched, which is the state of a
	// fresh machine and of one whose API key was never set.
	Track   *trackJSON `json:"track"`
	Playing bool       `json:"playing"`
	// FetchedAt is the last time the fetch *succeeded*, not the last time it
	// ran. That distinction is the whole point: a job failing every minute
	// still has a recent run, and a page told about the run would keep
	// presenting a week-old song as current.
	FetchedAt   *string `json:"fetched_at"`
	GeneratedAt string  `json:"generated_at"`
}

func nowPlaying(db *store.DB, cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp := nowPlayingResponse{GeneratedAt: cfg.Now().UTC().Format(time.RFC3339)}

		if current, found, err := db.Current(r.Context()); err == nil && found {
			resp.Track = &trackJSON{
				Artist: current.Track.Artist,
				Title:  current.Track.Title,
				Album:  current.Track.Album,
				URL:    current.Track.URL,
			}
			resp.Playing = current.Playing
		}

		if run, found, err := db.LastJobRun(r.Context(), lastfm.JobName); err == nil && found {
			if !run.LastOKAt.IsZero() {
				at := run.LastOKAt.UTC().Format(time.RFC3339)
				resp.FetchedAt = &at
			}
		}

		// Always 200, like /api/status: a database that will not answer is
		// what /api/healthz is for, and this page's job is to render absence.
		writeJSON(w, http.StatusOK, resp)
	}
}
