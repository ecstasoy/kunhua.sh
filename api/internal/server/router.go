// Package server connects HTTP routes to the store layer.
package server

import (
	"log/slog"
	"net/http"
	"time"

	"kunhua.sh/api/internal/art"
	"kunhua.sh/api/internal/auth"
	"kunhua.sh/api/internal/host"
	"kunhua.sh/api/internal/store"
)

// Config is what the handlers need from outside themselves. The three function
// fields exist so tests can supply a machine that is not this one — a fixed
// uptime, a symlink that does not exist, a clock that does not move.
type Config struct {
	// ReleaseLink is the site's current-release symlink. Its own mtime is the
	// moment of the last deploy.
	ReleaseLink string
	// Art is where cover images are stored.
	Art art.Store
	// Auth is nil when no admin token is configured, which disables writing
	// rather than opening it.
	Auth *auth.Auth

	Uptime      func() (time.Duration, error)
	SymlinkTime func(string) (time.Time, error)
	Now         func() time.Time
}

func (c Config) withDefaults() Config {
	if c.Uptime == nil {
		c.Uptime = host.Uptime
	}
	if c.SymlinkTime == nil {
		c.SymlinkTime = host.SymlinkTime
	}
	if c.Now == nil {
		c.Now = time.Now
	}
	return c
}

// New builds the API handler tree.
// Keep /api in route patterns because the reverse proxy does not strip it.
func New(db *store.DB, log *slog.Logger, cfg Config) http.Handler {
	cfg = cfg.withDefaults()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/healthz", health(db))
	mux.HandleFunc("GET /api/status", status(cfg))
	mux.HandleFunc("GET /api/now-playing", nowPlaying(db, cfg))
	mux.HandleFunc("GET /api/top-albums", topAlbums(db, cfg))
	mux.HandleFunc("GET /api/art/{hash}", serveArt(cfg.Art))

	mux.HandleFunc("GET /api/session", session(cfg.Auth))
	mux.HandleFunc("POST /api/session", signIn(cfg.Auth))
	mux.HandleFunc("DELETE /api/session", signOut(cfg.Auth))

	// Every write goes through requireSession. Registering the guard here
	// rather than inside the handler keeps it visible in the route table,
	// where a new write cannot be added without deciding about it.
	mux.HandleFunc("PUT /api/notes", requireSession(cfg.Auth, saveNote(db, cfg)))

	// Middleware order matters:
	// request ID first, then logging, then recover inside logging.
	var h http.Handler = mux
	h = withRecover(log, h)
	h = withLogging(log, h)
	h = withRequestID(h)
	return h
}
