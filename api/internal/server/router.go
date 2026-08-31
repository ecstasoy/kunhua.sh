// Package server connects HTTP routes to the store layer.
package server

import (
	"log/slog"
	"net/http"

	"kunhua.sh/api/internal/store"
)

// New builds the API handler tree.
// Keep /api in route patterns because the reverse proxy does not strip it.
func New(db *store.DB, log *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/healthz", health(db))

	// Middleware order matters:
	// request ID first, then logging, then recover inside logging.
	var h http.Handler = mux
	h = withRecover(log, h)
	h = withLogging(log, h)
	h = withRequestID(h)
	return h
}
