package server

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"kunhua.sh/api/internal/store"
)

const maxNoteBody = 8 << 10

// saveNote writes one album's note. Only ever reached through requireSession.
func saveNote(db *store.DB, cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Artist string `json:"artist"`
			Album  string `json:"album"`
			Note   string `json:"note"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, maxNoteBody)).Decode(&body); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}

		artist := strings.TrimSpace(body.Artist)
		album := strings.TrimSpace(body.Album)
		if artist == "" || album == "" {
			http.Error(w, "artist and album are required", http.StatusBadRequest)
			return
		}
		if len(body.Note) > store.MaxNoteLength {
			http.Error(w, "note is too long", http.StatusRequestEntityTooLarge)
			return
		}

		if err := db.SaveNote(r.Context(), artist, album, body.Note, cfg.Now()); err != nil {
			http.Error(w, "could not save", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"saved": true,
			"at":    cfg.Now().UTC().Format(time.RFC3339),
		})
	}
}
