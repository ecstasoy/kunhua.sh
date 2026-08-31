package server

import (
	"net/http"
	"os"

	"kunhua.sh/api/internal/art"
)

// serveArt returns a stored cover by content hash.
func serveArt(arts art.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path, err := arts.Path(r.PathValue("hash"))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		f, err := os.Open(path)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer f.Close()

		info, err := f.Stat()
		if err != nil {
			http.NotFound(w, r)
			return
		}

		// The name is the content, so it can never go stale.
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		http.ServeContent(w, r, "", info.ModTime(), f)
	}
}
