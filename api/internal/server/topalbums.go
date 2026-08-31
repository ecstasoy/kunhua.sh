package server

import (
	"net/http"
	"time"

	"kunhua.sh/api/internal/lastfm"
	"kunhua.sh/api/internal/store"
)

type albumJSON struct {
	Artist string `json:"artist"`
	Album  string `json:"album"`
	URL    string `json:"url"`
	Plays  int    `json:"plays"`
	// Art is a path on this site, or null when no cover is stored.
	Art *string `json:"art"`
}

// topAlbumsResponse carries every period in one answer, so choosing a span on
// the page costs no request.
type topAlbumsResponse struct {
	// Periods in the order the page offers them, so the frontend needs no
	// ordering of its own.
	Order   []string               `json:"order"`
	Periods map[string][]albumJSON `json:"periods"`
	// FetchedAt is when the chart last fetched successfully, not when it last
	// ran, so a chart that stopped updating can say so.
	FetchedAt   *string `json:"fetched_at"`
	GeneratedAt string  `json:"generated_at"`
}

func topAlbums(db *store.DB, cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp := topAlbumsResponse{
			Order:       lastfm.Periods,
			Periods:     map[string][]albumJSON{},
			GeneratedAt: cfg.Now().UTC().Format(time.RFC3339),
		}

		if stored, err := db.TopAlbums(r.Context()); err == nil {
			for period, albums := range stored {
				out := make([]albumJSON, 0, len(albums))
				for _, a := range albums {
					entry := albumJSON{Artist: a.Artist, Album: a.Album, URL: a.URL, Plays: a.Playcount}
					if a.ArtHash != "" {
						at := "/api/art/" + a.ArtHash
						entry.Art = &at
					}
					out = append(out, entry)
				}
				resp.Periods[period] = out
			}
		}

		if run, found, err := db.LastJobRun(r.Context(), lastfm.TopJobName); err == nil && found {
			if !run.LastOKAt.IsZero() {
				at := run.LastOKAt.UTC().Format(time.RFC3339)
				resp.FetchedAt = &at
			}
		}

		writeJSON(w, http.StatusOK, resp)
	}
}
